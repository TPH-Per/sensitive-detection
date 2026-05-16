# COLAB TRAINING PLAN — NSFW & VIOLENCE ViT FINE-TUNING

> Paste this entire document into Gemini. It will execute each step in order.
> **Platform:** Google Colab T4 GPU (15 GB VRAM)
> **Goal:** Fix NSFW oversensitivity to skin/sexy class + Fix violence model flagging sports

---

## CONTEXT (Read First)

You are completing two fine-tuning jobs for a content moderation pipeline:

**Job 1 — NSFW model** (`AdamCodd/vit-base-nsfw-detector`)
- **Problem:** The model flags swimwear, athletic wear, and art as "sexy" with 0.7–0.9 score, triggering blur
- **Fix:** Fine-tune so the model correctly separates explicit (nsfw/ban) from safe (sfw/ok)
- The model has 2 output classes: `label_0=sfw`, `label_1=nsfw`

**Job 2 — Violence model** (`jaranohaal/vit-base-violence-detection`)
- **Problem:** Model scores 0.89–0.96 on volleyball/sports frames — flags sports as violence
- **Fix:** Fine-tune with sports frames as negative (non-violence) examples
- The model has 2 output classes: `label_0=non-violence`, `label_1=violence`

**Both models:** freeze first 9 encoder layers, train only layers 9/10/11 + classifier head.

**Previous attempts failed because:**
- Dataset was only 500 images — too small
- Wikiart used as positive violence data — paintings are not violence
- Label assignment was inconsistent
- Some attempts used CPU after GPU CUDA errors instead of fixing the error
- `BATCH_SIZE=64` left ~6 GB of T4 VRAM unused
- `optimizer.zero_grad()` placed after `scaler.step()` — risks stale gradients on first batch
- `non_blocking=True` missing — CPU→GPU transfer was synchronous
- `laion/laion-art` does not expose `.image` field in streaming mode — silently collected 0 athletic images

**The correct approach:**
- `BATCH_SIZE=128` — fills ~12–13 GB of 15 GB T4
- `optimizer.zero_grad()` at **top** of batch loop (before `autocast`)
- `non_blocking=True` on all `.to(DEVICE)` calls
- `num_workers=2, prefetch_factor=4` — stable on Colab CPU
- Use `keremberke/volleyball-object-detection` for sports hard negatives (has actual images)
- PyTorch version guard for `GradScaler`
- AUC save trigger handles single-class val set correctly
- Always use GPU with AMP (`torch.amp.autocast`)
- If CUDA error occurs: **Runtime → Restart session**, then re-run setup cell only

---

## JOB 1 — NSFW MODEL FINE-TUNING

---

### STEP 1-A: Install and verify GPU

```python
!pip install -q transformers torch torchvision Pillow scikit-learn albumentations datasets

import torch
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {DEVICE}")
if DEVICE.type == "cuda":
    print(f"GPU:  {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
else:
    print("WARNING: No GPU. Go to Runtime > Change runtime type > T4 GPU")
assert DEVICE.type == "cuda", "STOP: Must have GPU before continuing"
```

> **GATE:** Must print `cuda` and show GPU name. If not — change runtime to T4 GPU.

---

### STEP 1-B: Collect NSFW training data

This step collects images from public HuggingFace datasets and auto-labels them using the base NSFW model.

**Data sources:**
- `huggan/wikiart` → SFW baseline (paintings are safe, have actual `.image` field)
- `keremberke/volleyball-object-detection` → sports hard negatives (actual images, not URL-only)

```python
import os, json, requests
from pathlib import Path
from PIL import Image
from collections import Counter
from datasets import load_dataset
from transformers import pipeline as hf_pipeline
import torch

DEVICE = torch.device("cuda")

os.makedirs("nsfw_data/sfw", exist_ok=True)
os.makedirs("nsfw_data/nsfw_explicit", exist_ok=True)

# Load the base model for auto-labeling
print("Loading base NSFW model for auto-labeling...")
nsfw_pipe = hf_pipeline(
    "image-classification",
    model="AdamCodd/vit-base-nsfw-detector",
    device=0,
    top_k=5,
)

# ── Collect SFW images from wikiart (paintings are safe, has real .image field) ──
print("Collecting SFW images from wikiart...")
ds_art = load_dataset("huggan/wikiart", split="train", streaming=True)

sfw_count = 0
TARGET_SFW = 1000
for item in ds_art:
    if sfw_count >= TARGET_SFW:
        break
    try:
        img = item["image"].convert("RGB")
        result = nsfw_pipe(img)
        scores = {r["label"].lower(): r["score"] for r in result}
        if scores.get("neutral", 0) > 0.70 or scores.get("drawings", 0) > 0.70:
            img.save(f"nsfw_data/sfw/sfw_{sfw_count:04d}.jpg")
            sfw_count += 1
            if sfw_count % 200 == 0:
                print(f"  SFW: {sfw_count}/{TARGET_SFW}")
    except Exception:
        continue

print(f"SFW from wikiart: {sfw_count}")

# ── Collect sports/athletic hard negatives (images with skin that should NOT be flagged) ──
# Using keremberke/volleyball-object-detection — has real images, not URL-only
print("Collecting athletic hard negatives from volleyball dataset...")
athletic_count = 0
TARGET_ATHLETIC = 500
try:
    ds_volleyball = load_dataset("keremberke/volleyball-object-detection", split="train", streaming=True)
    for item in ds_volleyball:
        if athletic_count >= TARGET_ATHLETIC:
            break
        try:
            img = item["image"].convert("RGB")
            result = nsfw_pipe(img)
            scores = {r["label"].lower(): r["score"] for r in result}
            # Save as SFW hard negative: has athletic bodies but is NOT explicit
            if scores.get("nsfw", 0) < 0.30:
                img.save(f"nsfw_data/sfw/athletic_{athletic_count:04d}.jpg")
                athletic_count += 1
        except Exception:
            continue
    print(f"Athletic hard negatives: {athletic_count}")
except Exception as e:
    print(f"Volleyball dataset unavailable ({e})")
    print("Trying fallback: using extra wikiart images as SFW instead")
    for item in ds_art:
        if athletic_count >= TARGET_ATHLETIC:
            break
        try:
            img = item["image"].convert("RGB")
            result = nsfw_pipe(img)
            scores = {r["label"].lower(): r["score"] for r in result}
            if scores.get("neutral", 0) > 0.60:
                img.save(f"nsfw_data/sfw/extra_{athletic_count:04d}.jpg")
                athletic_count += 1
        except Exception:
            continue
    print(f"Extra SFW fallback: {athletic_count}")

print(f"\nTotal SFW: {len(list(Path('nsfw_data/sfw').glob('*.jpg')))}")
```

---

### STEP 1-C: Upload explicit NSFW images (manual step)

```python
from google.colab import files
import zipfile
from pathlib import Path

print("=" * 60)
print("UPLOAD your explicit NSFW images as a zip file.")
print("These images should be clearly adult/explicit content.")
print("The zip should contain only .jpg/.png image files.")
print("=" * 60)
print("If you do NOT have explicit images to upload, skip this cell.")
print("The model will then only learn to suppress false positives on SFW content.")
print("=" * 60)

uploaded = files.upload()
for fname in uploaded:
    if fname.endswith(".zip"):
        with zipfile.ZipFile(fname, "r") as z:
            z.extractall("nsfw_data/nsfw_explicit")
        count = len(list(Path("nsfw_data/nsfw_explicit").rglob("*.*")))
        print(f"Extracted {count} explicit images")
```

---

### STEP 1-D: Build binary manifest (SFW=0, NSFW=1)

```python
import json
from pathlib import Path
from collections import Counter

entries = []

# SFW = label 0
for p in sorted(Path("nsfw_data/sfw").glob("*.jpg")):
    entries.append({"image": str(p), "label": 0})

# NSFW explicit = label 1
for ext in ["*.jpg", "*.jpeg", "*.png", "*.webp"]:
    for p in sorted(Path("nsfw_data/nsfw_explicit").rglob(ext)):
        entries.append({"image": str(p), "label": 1})

counts = Counter(e["label"] for e in entries)
print(f"SFW (0):  {counts[0]}")
print(f"NSFW (1): {counts[1]}")
print(f"Total:    {len(entries)}")

if counts[0] < 200:
    print("WARNING: Too few SFW images. Re-run Step 1-B with larger TARGET_SFW")
if counts[1] < 50:
    print("WARNING: Few or no NSFW images. Model will primarily learn false-positive reduction only.")
    print("This is still useful — it will suppress skin/athletic false positives.")

with open("nsfw_manifest.json", "w") as f:
    json.dump(entries, f, indent=2)
print("Saved nsfw_manifest.json")
```

---

### STEP 1-E: Train NSFW model

**Key T4 optimizations applied:**
- `BATCH_SIZE=128` → fills ~12–13 GB of 15 GB T4 VRAM (vs 8–9 GB with batch=64)
- `optimizer.zero_grad()` at top of loop — no stale gradients
- `non_blocking=True` — async CPU→GPU transfer via pinned memory
- `num_workers=2, prefetch_factor=4` — stable on Colab CPU
- AUC save trigger gracefully handles single-class val set

```python
import torch, json, numpy as np
from pathlib import Path
from PIL import Image
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from transformers import ViTForImageClassification, ViTImageProcessor
from sklearn.metrics import roc_auc_score
from collections import Counter
import albumentations as A

DEVICE = torch.device("cuda")

# ── Hyperparameters ────────────────────────────────────────────────────────
BATCH_SIZE   = 128    # T4-optimal: fills ~12–13 GB VRAM with AMP
EPOCHS       = 20
LR           = 2e-6
FREEZE_UP_TO = 9      # freeze layers 0..8, train 9..11 + classifier
PATIENCE     = 5

# ── PyTorch version guard for GradScaler ──────────────────────────────────
import torch
_pt_ver = tuple(int(x) for x in torch.__version__.split(".")[:2])
if _pt_ver >= (2, 3):
    def make_scaler():
        return torch.amp.GradScaler("cuda")
    def autocast_ctx():
        return torch.amp.autocast("cuda")
else:
    def make_scaler():
        return torch.cuda.amp.GradScaler()
    def autocast_ctx():
        return torch.cuda.amp.autocast()

# ── Dataset ────────────────────────────────────────────────────────────────
class NSFWDataset(Dataset):
    def __init__(self, items, processor, augment=False):
        self.items     = items
        self.processor = processor
        if augment:
            self.aug = A.Compose([
                A.HorizontalFlip(p=0.5),
                A.RandomBrightnessContrast(brightness_limit=0.25, p=0.5),
                A.HueSaturationValue(hue_shift_limit=10, sat_shift_limit=20, p=0.4),
                A.ImageCompression(quality_lower=55, p=0.4),
                A.GaussNoise(var_limit=(5, 30), p=0.3),
            ])
        else:
            self.aug = None

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        try:
            img = Image.open(item["image"]).convert("RGB")
            if self.aug:
                img = Image.fromarray(self.aug(image=np.array(img))["image"])
            inputs = self.processor(images=img, return_tensors="pt")
            return {
                "pixel_values": inputs["pixel_values"].squeeze(0),
                "labels": torch.tensor(item["label"], dtype=torch.long)
            }
        except Exception:
            return {
                "pixel_values": torch.zeros((3, 224, 224)),
                "labels": torch.tensor(0, dtype=torch.long)
            }

# ── Load manifest and split ────────────────────────────────────────────────
with open("nsfw_manifest.json") as f:
    manifest = json.load(f)

np.random.seed(42)
idx   = np.random.permutation(len(manifest))
split = int(len(manifest) * 0.85)
train_items = [manifest[i] for i in idx[:split]]
val_items   = [manifest[i] for i in idx[split:]]
print(f"Train: {len(train_items)} | Val: {len(val_items)}")

# ── Load model ─────────────────────────────────────────────────────────────
MODEL_ID  = "AdamCodd/vit-base-nsfw-detector"
processor = ViTImageProcessor.from_pretrained(MODEL_ID)
model     = ViTForImageClassification.from_pretrained(
    MODEL_ID,
    num_labels=2,
    ignore_mismatched_sizes=True,
    id2label={0: "sfw", 1: "nsfw"},
    label2id={"sfw": 0, "nsfw": 1},
).to(DEVICE)

# ── Freeze strategy ────────────────────────────────────────────────────────
for name, param in model.named_parameters():
    if "classifier" in name:
        param.requires_grad = True
    elif "encoder.layer" in name:
        layer_idx = int(name.split("encoder.layer.")[1].split(".")[0])
        param.requires_grad = (layer_idx >= FREEZE_UP_TO)
    else:
        param.requires_grad = False

n_train = sum(p.numel() for p in model.parameters() if p.requires_grad)
n_total = sum(p.numel() for p in model.parameters())
print(f"Trainable: {n_train:,} / {n_total:,} ({n_train/n_total:.1%})")

# ── DataLoaders ────────────────────────────────────────────────────────────
train_ds = NSFWDataset(train_items, processor, augment=True)
val_ds   = NSFWDataset(val_items,   processor, augment=False)

train_labels   = [e["label"] for e in train_items]
n_sfw          = max(1, sum(1 for l in train_labels if l == 0))
n_nsfw         = max(1, sum(1 for l in train_labels if l == 1))
sample_weights = [1.0/n_sfw if l == 0 else 1.0/n_nsfw for l in train_labels]
sampler        = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler,
                          num_workers=2, pin_memory=True, prefetch_factor=4)
val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=2, pin_memory=True, prefetch_factor=4)

# ── Optimizer — differential LR: classifier head gets 10× ─────────────────
optimizer = AdamW(
    [{"params": [p for n, p in model.named_parameters() if "classifier" in n and p.requires_grad], "lr": LR * 10},
     {"params": [p for n, p in model.named_parameters() if "classifier" not in n and p.requires_grad], "lr": LR}],
    weight_decay=0.01
)
scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=LR * 0.01)
scaler    = make_scaler()

# ── Training loop ──────────────────────────────────────────────────────────
best_auc       = 0.0
best_loss      = float("inf")  # fallback save criterion when val has only 1 class
patience_count = 0

print(f"\nStarting training — {EPOCHS} epochs, batch={BATCH_SIZE}")
print("=" * 65)

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0

    for batch in train_loader:
        optimizer.zero_grad()                                          # ← top of loop
        pv = batch["pixel_values"].to(DEVICE, non_blocking=True)      # ← non_blocking
        lb = batch["labels"].to(DEVICE, non_blocking=True)
        with autocast_ctx():
            out = model(pixel_values=pv, labels=lb)
        scaler.scale(out.loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(optimizer)
        scaler.update()
        total_loss += out.loss.item()

    scheduler.step()
    avg_loss = total_loss / len(train_loader)

    # ── Validation ────────────────────────────────────────────────────────
    model.eval()
    all_probs, all_labels_val = [], []
    with torch.no_grad():
        for batch in val_loader:
            logits = model(pixel_values=batch["pixel_values"].to(DEVICE, non_blocking=True)).logits
            probs  = torch.softmax(logits, dim=-1)[:, 1].cpu().numpy()
            all_probs.extend(probs)
            all_labels_val.extend(batch["labels"].numpy())

    n_classes = len(set(all_labels_val))
    auc   = roc_auc_score(all_labels_val, all_probs) if n_classes > 1 else None
    preds = [1 if p >= 0.5 else 0 for p in all_probs]
    tp    = sum(1 for p, l in zip(preds, all_labels_val) if p == 1 and l == 1)
    fn    = sum(1 for p, l in zip(preds, all_labels_val) if p == 0 and l == 1)
    fp    = sum(1 for p, l in zip(preds, all_labels_val) if p == 1 and l == 0)
    tn    = sum(1 for p, l in zip(preds, all_labels_val) if p == 0 and l == 0)
    recall    = tp / max(tp + fn, 1)
    precision = tp / max(tp + fp, 1)
    fpr       = fp / max(fp + tn, 1)
    vram      = torch.cuda.max_memory_allocated() / 1024**3

    auc_str = f"{auc:.3f}" if auc is not None else "N/A (1 class)"
    print(f"Epoch {epoch:02d}/{EPOCHS} | Loss={avg_loss:.4f} | AUC={auc_str} | "
          f"Rec={recall:.3f} | Pre={precision:.3f} | FPR={fpr:.3f} | VRAM={vram:.1f}GB")

    # ── Save logic: AUC-based when both classes present, loss-based fallback ──
    should_save = (auc is not None and auc > best_auc) or \
                  (auc is None and avg_loss < best_loss)
    if should_save:
        best_auc  = auc if auc is not None else best_auc
        best_loss = avg_loss
        model.save_pretrained("runs/nsfw_finetuned")
        processor.save_pretrained("runs/nsfw_finetuned")
        print(f"  ↑ Saved (AUC={auc_str})")
        patience_count = 0
    else:
        patience_count += 1
        if patience_count >= PATIENCE:
            print(f"Early stop — no improvement for {PATIENCE} epochs")
            break

print(f"\nDone. Best AUC: {best_auc:.3f}")
```

---

### STEP 1-F: Evaluate and check acceptance criteria

```python
from sklearn.metrics import classification_report, roc_auc_score
from pathlib import Path
import torch

model.eval()
all_preds, all_labels_eval, all_probs_eval = [], [], []
with torch.no_grad():
    for batch in val_loader:
        logits = model(pixel_values=batch["pixel_values"].to(DEVICE, non_blocking=True)).logits
        probs  = torch.softmax(logits, dim=-1)
        all_preds.extend(probs.argmax(dim=-1).cpu().numpy())
        all_labels_eval.extend(batch["labels"].numpy())
        all_probs_eval.extend(probs[:, 1].cpu().numpy())

print(classification_report(all_labels_eval, all_preds,
                             target_names=["sfw", "nsfw"], zero_division=0))

n_classes = len(set(all_labels_eval))
if n_classes > 1:
    auc = roc_auc_score(all_labels_eval, all_probs_eval)
else:
    auc = None
    print("NOTE: Val set has only 1 class — AUC cannot be computed.")
    print("      Upload explicit NSFW images in Step 1-C and retrain for full evaluation.")

fp  = sum(1 for p, l in zip(all_preds, all_labels_eval) if p == 1 and l == 0)
tn  = sum(1 for p, l in zip(all_preds, all_labels_eval) if p == 0 and l == 0)
fpr = fp / max(fp + tn, 1)

nsfw_items  = [l for l in all_labels_eval if l == 1]
nsfw_recall = sum(1 for p, l in zip(all_preds, all_labels_eval)
                  if p == 1 and l == 1) / max(len(nsfw_items), 1)

print("\n── Acceptance Criteria ─────────────────────────────────────────")
if auc is not None:
    print(f"  AUC ≥ 0.85:              {'✅' if auc >= 0.85 else '❌'} ({auc:.3f})")
else:
    print(f"  AUC:                     ⚠️  N/A — need both classes in val set")
print(f"  FPR on SFW ≤ 0.10:       {'✅' if fpr <= 0.10 else '❌'} ({fpr:.3f})")
if nsfw_items:
    print(f"  NSFW recall ≥ 0.80:      {'✅' if nsfw_recall >= 0.80 else '❌'} ({nsfw_recall:.3f})")
else:
    print(f"  NSFW recall:             ⚠️  N/A — no explicit images uploaded")

all_pass = (auc is not None and auc >= 0.85 and fpr <= 0.10 and
            (not nsfw_items or nsfw_recall >= 0.80))
print(f"\n{'✅ ALL CRITERIA PASS — proceed to Step 1-G' if all_pass else '❌ CRITERIA FAIL — see fix guide below'}")
```

**If criteria fail:**

| Failure | Action |
|---|---|
| AUC < 0.85 | Increase `EPOCHS` to 30, reduce `LR` to `1e-6`, re-run Step 1-E |
| FPR > 0.10 (too many safe images flagged) | Increase `TARGET_SFW` to 1500 in Step 1-B, re-run 1-B and 1-E |
| NSFW recall < 0.80 | Upload more explicit images in Step 1-C, re-run Step 1-E |
| Loss not decreasing after epoch 3 | LR too low — change to `LR = 5e-6` and re-run |
| VRAM > 14.5 GB (OOM risk) | Reduce to `BATCH_SIZE=96` and re-run |

---

### STEP 1-G: Download NSFW model

```python
import shutil
from google.colab import files as colab_files
from pathlib import Path

if Path("runs/nsfw_finetuned").exists():
    shutil.make_archive("nsfw_finetuned", "zip", "runs/nsfw_finetuned")
    colab_files.download("nsfw_finetuned.zip")
    print("Downloaded: nsfw_finetuned.zip")
    print("On local machine: extract to trongso/nsfw_finetuned/")
    print("In app.py update: WEIGHT_FILES_V6['nsfw'] = 'nsfw_finetuned'")
else:
    print("ERROR: runs/nsfw_finetuned not found. Did training complete?")
```

---

## JOB 2 — VIOLENCE MODEL FINE-TUNING (Sports Suppression)

> **IMPORTANT:** Run this in a **NEW Colab session** or after **Runtime → Restart**.
> The NSFW model and Violence model must not share GPU memory during training.

---

### STEP 2-A: Install and verify GPU

```python
!pip install -q transformers torch torchvision Pillow scikit-learn albumentations datasets

import torch
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {DEVICE}")
if DEVICE.type == "cuda":
    print(f"GPU:  {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
assert DEVICE.type == "cuda", "STOP: Need GPU. Runtime > Change runtime type > T4 GPU"
```

---

### STEP 2-B: Collect violence training data (correct sources)

**Why the previous plan failed here:**
- `laion/laion-art` is a metadata-only dataset — it has `URL` and `TEXT` columns but no `.image` field in streaming mode. Every `item["image"]` access silently fell into `except`, collecting 0 sports images.

**Correct sources used here:**
- `keremberke/volleyball-object-detection` → sports hard negatives (real `.image` field)
- `huggan/wikiart` → non-violence baseline (paintings, zero motion violence)
- Violence positives → upload manually in Step 2-C

```python
import os, json
from pathlib import Path
from PIL import Image
from collections import Counter
from datasets import load_dataset
from transformers import AutoModelForImageClassification, AutoImageProcessor
import torch

DEVICE = torch.device("cuda")
os.makedirs("violence_data/nonviolence", exist_ok=True)
os.makedirs("violence_data/violence", exist_ok=True)

# ── PyTorch version guard ──────────────────────────────────────────────────
_pt_ver = tuple(int(x) for x in torch.__version__.split(".")[:2])
def autocast_ctx():
    return torch.amp.autocast("cuda") if _pt_ver >= (2, 3) else torch.cuda.amp.autocast()

# Load violence model for auto-labeling
print("Loading violence model for auto-labeling...")
vio_model_id = "jaranohaal/vit-base-violence-detection"
vio_processor = AutoImageProcessor.from_pretrained(vio_model_id)
vio_model     = AutoModelForImageClassification.from_pretrained(vio_model_id).to(DEVICE)
vio_model.eval()

def get_violence_score(img):
    inputs = vio_processor(images=img, return_tensors="pt").to(DEVICE, non_blocking=True)
    with torch.no_grad(), autocast_ctx():
        out = vio_model(**inputs)
    probs = torch.softmax(out.logits, dim=-1)
    return probs[0][1].item()  # violence probability

# ── Non-violence: wikiart paintings ───────────────────────────────────────
print("Collecting non-violence images from wikiart...")
ds_art   = load_dataset("huggan/wikiart", split="train", streaming=True)
nv_count = 0
TARGET_NV = 700
for item in ds_art:
    if nv_count >= TARGET_NV:
        break
    try:
        img     = item["image"].convert("RGB")
        v_score = get_violence_score(img)
        if v_score < 0.20:
            img.save(f"violence_data/nonviolence/art_{nv_count:04d}.jpg")
            nv_count += 1
            if nv_count % 100 == 0:
                print(f"  Non-violence (art): {nv_count}/{TARGET_NV}")
    except Exception:
        continue
print(f"Non-violence from art: {nv_count}")

# ── Non-violence: sports hard negatives (CORRECT dataset with real images) ─
# keremberke/volleyball-object-detection has actual .image field in streaming mode
print("Collecting sports hard negatives from volleyball dataset...")
sports_count  = 0
TARGET_SPORTS = 600
try:
    ds_volleyball = load_dataset("keremberke/volleyball-object-detection",
                                 split="train", streaming=True)
    for item in ds_volleyball:
        if sports_count >= TARGET_SPORTS:
            break
        try:
            img = item["image"].convert("RGB")
            # Save as non-violence regardless of current model score
            # This is explicitly teaching the model that volleyball ≠ violence
            img.save(f"violence_data/nonviolence/sports_{sports_count:04d}.jpg")
            sports_count += 1
            if sports_count % 100 == 0:
                print(f"  Sports: {sports_count}/{TARGET_SPORTS}")
        except Exception:
            continue
    print(f"Sports hard negatives: {sports_count}")
except Exception as e:
    print(f"Volleyball dataset unavailable ({e})")
    print("Fallback: collecting additional wikiart images as non-violence...")
    for item in ds_art:
        if sports_count >= TARGET_SPORTS:
            break
        try:
            img     = item["image"].convert("RGB")
            v_score = get_violence_score(img)
            if v_score < 0.15:
                img.save(f"violence_data/nonviolence/extra_{sports_count:04d}.jpg")
                sports_count += 1
        except Exception:
            continue
    print(f"Extra non-violence fallback: {sports_count}")

print(f"\nTotal non-violence: {len(list(Path('violence_data/nonviolence').glob('*.jpg')))}")
```

---

### STEP 2-C: Upload violence positive examples (manual step)

```python
from google.colab import files
import zipfile
from pathlib import Path

print("=" * 60)
print("OPTIONAL: Upload violence images (action movie frames, fight scenes)")
print("These images should show clear physical conflict.")
print("If you skip this, the model trains only on non-violence examples.")
print("Training on non-violence only reduces false positives but may")
print("slightly reduce recall on actual violence content.")
print("=" * 60)
print("Skip by pressing the X button or waiting for timeout.")

try:
    uploaded = files.upload()
    for fname in uploaded:
        if fname.endswith(".zip"):
            with zipfile.ZipFile(fname, "r") as z:
                z.extractall("violence_data/violence")
            count = len(list(Path("violence_data/violence").rglob("*.*")))
            print(f"Extracted {count} violence images")
except Exception:
    print("No violence images uploaded — will train with non-violence hard negatives only")
```

---

### STEP 2-D: Build violence manifest

```python
import json
from pathlib import Path
from collections import Counter

entries = []

for p in sorted(Path("violence_data/nonviolence").glob("*.jpg")):
    entries.append({"image": str(p), "label": 0})

for ext in ["*.jpg", "*.jpeg", "*.png"]:
    for p in sorted(Path("violence_data/violence").rglob(ext)):
        entries.append({"image": str(p), "label": 1})

counts = Counter(e["label"] for e in entries)
print(f"Non-violence (0): {counts[0]}")
print(f"Violence (1):     {counts[1]}")
print(f"Total:            {len(entries)}")

if counts[0] < 200:
    print("ERROR: Too few non-violence images. Re-run Step 2-B.")
if counts[1] == 0:
    print("NOTE: No violence positive examples. Model will suppress false positives only.")
    print("This is the primary goal for the sports fix — acceptable.")

with open("violence_manifest.json", "w") as f:
    json.dump(entries, f, indent=2)
print("Saved violence_manifest.json")
```

---

### STEP 2-E: Train violence model

**Same T4 optimizations as Job 1:**
- `BATCH_SIZE=128`, `non_blocking=True`, `zero_grad()` at loop top, `num_workers=2`

```python
import torch, json, numpy as np
from pathlib import Path
from PIL import Image
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from transformers import AutoModelForImageClassification, AutoImageProcessor
from sklearn.metrics import roc_auc_score
from collections import Counter
import albumentations as A

DEVICE = torch.device("cuda")

BATCH_SIZE   = 128   # T4-optimal
EPOCHS       = 15
LR           = 2e-6
FREEZE_UP_TO = 9
PATIENCE     = 5

# ── PyTorch version guard ──────────────────────────────────────────────────
_pt_ver = tuple(int(x) for x in torch.__version__.split(".")[:2])
if _pt_ver >= (2, 3):
    def make_scaler():
        return torch.amp.GradScaler("cuda")
    def autocast_ctx():
        return torch.amp.autocast("cuda")
else:
    def make_scaler():
        return torch.cuda.amp.GradScaler()
    def autocast_ctx():
        return torch.cuda.amp.autocast()

class ViolenceDataset(Dataset):
    def __init__(self, items, processor, augment=False):
        self.items     = items
        self.processor = processor
        if augment:
            self.aug = A.Compose([
                A.HorizontalFlip(p=0.5),
                A.RandomBrightnessContrast(0.2, p=0.5),
                A.MotionBlur(blur_limit=7, p=0.4),
                A.ImageCompression(quality_lower=55, p=0.4),
            ])
        else:
            self.aug = None

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        try:
            img = Image.open(item["image"]).convert("RGB")
            if self.aug:
                img = Image.fromarray(self.aug(image=np.array(img))["image"])
            inputs = self.processor(images=img, return_tensors="pt")
            return {
                "pixel_values": inputs["pixel_values"].squeeze(0),
                "labels": torch.tensor(item["label"], dtype=torch.long)
            }
        except Exception:
            return {
                "pixel_values": torch.zeros((3, 224, 224)),
                "labels": torch.tensor(0, dtype=torch.long)
            }

with open("violence_manifest.json") as f:
    manifest = json.load(f)

np.random.seed(42)
idx   = np.random.permutation(len(manifest))
split = int(len(manifest) * 0.85)
train_items = [manifest[i] for i in idx[:split]]
val_items   = [manifest[i] for i in idx[split:]]
print(f"Train: {len(train_items)} | Val: {len(val_items)}")

MODEL_ID  = "jaranohaal/vit-base-violence-detection"
processor = AutoImageProcessor.from_pretrained(MODEL_ID)
model     = AutoModelForImageClassification.from_pretrained(
    MODEL_ID,
    num_labels=2,
    ignore_mismatched_sizes=True,
).to(DEVICE)

# ── Freeze strategy — handles both ViT encoder.layer and DeiT blocks ───────
for name, param in model.named_parameters():
    if "classifier" in name:
        param.requires_grad = True
    elif "encoder.layer" in name:
        layer_idx = int(name.split("encoder.layer.")[1].split(".")[0])
        param.requires_grad = (layer_idx >= FREEZE_UP_TO)
    elif "blocks." in name:
        try:
            block_idx = int(name.split("blocks.")[1].split(".")[0])
            param.requires_grad = (block_idx >= FREEZE_UP_TO)
        except Exception:
            param.requires_grad = False
    else:
        param.requires_grad = False

n_train = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"Trainable params: {n_train:,}")
# If n_train == 0 — architecture uses different layer names. Run: print(model) to inspect.

train_ds = ViolenceDataset(train_items, processor, augment=True)
val_ds   = ViolenceDataset(val_items,   processor, augment=False)

train_labels   = [e["label"] for e in train_items]
n_nv           = max(1, sum(1 for l in train_labels if l == 0))
n_v            = max(1, sum(1 for l in train_labels if l == 1))
sample_weights = [1.0/n_nv if l == 0 else 1.0/n_v for l in train_labels]
sampler        = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)

train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, sampler=sampler,
                          num_workers=2, pin_memory=True, prefetch_factor=4)
val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                          num_workers=2, pin_memory=True, prefetch_factor=4)

optimizer = AdamW(
    [{"params": [p for n, p in model.named_parameters() if "classifier" in n and p.requires_grad], "lr": LR * 10},
     {"params": [p for n, p in model.named_parameters() if "classifier" not in n and p.requires_grad], "lr": LR}],
    weight_decay=0.01
)
scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=LR * 0.01)
scaler    = make_scaler()

best_auc       = 0.0
best_loss      = float("inf")
patience_count = 0

print(f"\nStarting violence training — {EPOCHS} epochs, batch={BATCH_SIZE}")
print("=" * 65)

for epoch in range(1, EPOCHS + 1):
    model.train()
    total_loss = 0

    for batch in train_loader:
        optimizer.zero_grad()                                         # ← top of loop
        pv = batch["pixel_values"].to(DEVICE, non_blocking=True)     # ← non_blocking
        lb = batch["labels"].to(DEVICE, non_blocking=True)
        with autocast_ctx():
            out = model(pixel_values=pv, labels=lb)
        scaler.scale(out.loss).backward()
        scaler.unscale_(optimizer)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(optimizer)
        scaler.update()
        total_loss += out.loss.item()

    scheduler.step()
    avg_loss = total_loss / len(train_loader)

    model.eval()
    all_probs_v, all_labels_v = [], []
    with torch.no_grad():
        for batch in val_loader:
            logits = model(pixel_values=batch["pixel_values"].to(DEVICE, non_blocking=True)).logits
            probs  = torch.softmax(logits, dim=-1)[:, 1].cpu().numpy()
            all_probs_v.extend(probs)
            all_labels_v.extend(batch["labels"].numpy())

    n_classes = len(set(all_labels_v))
    auc    = roc_auc_score(all_labels_v, all_probs_v) if n_classes > 1 else None
    preds  = [1 if p >= 0.5 else 0 for p in all_probs_v]
    fp     = sum(1 for p, l in zip(preds, all_labels_v) if p == 1 and l == 0)
    tn     = sum(1 for p, l in zip(preds, all_labels_v) if p == 0 and l == 0)
    fpr_s  = fp / max(fp + tn, 1)
    vram   = torch.cuda.max_memory_allocated() / 1024**3
    auc_str = f"{auc:.3f}" if auc is not None else "N/A"

    print(f"Epoch {epoch:02d}/{EPOCHS} | Loss={avg_loss:.4f} | "
          f"AUC={auc_str} | Sports_FPR={fpr_s:.3f} | VRAM={vram:.1f}GB")

    should_save = (auc is not None and auc > best_auc) or \
                  (auc is None and avg_loss < best_loss)
    if should_save:
        best_auc  = auc if auc is not None else best_auc
        best_loss = avg_loss
        model.save_pretrained("runs/violence_finetuned")
        processor.save_pretrained("runs/violence_finetuned")
        print(f"  ↑ Saved (AUC={auc_str})")
        patience_count = 0
    else:
        patience_count += 1
        if patience_count >= PATIENCE:
            print(f"Early stop")
            break

print(f"\nDone. Best AUC: {best_auc:.3f}")
```

---

### STEP 2-F: Evaluate violence model

```python
from sklearn.metrics import classification_report, roc_auc_score
import torch

model.eval()
all_preds_v2, all_labels_v2, all_probs_v2 = [], [], []
with torch.no_grad():
    for batch in val_loader:
        logits = model(pixel_values=batch["pixel_values"].to(DEVICE, non_blocking=True)).logits
        probs  = torch.softmax(logits, dim=-1)
        all_preds_v2.extend(probs.argmax(dim=-1).cpu().numpy())
        all_labels_v2.extend(batch["labels"].numpy())
        all_probs_v2.extend(probs[:, 1].cpu().numpy())

print(classification_report(all_labels_v2, all_preds_v2,
                             target_names=["non-violence", "violence"], zero_division=0))

fp  = sum(1 for p, l in zip(all_preds_v2, all_labels_v2) if p == 1 and l == 0)
tn  = sum(1 for p, l in zip(all_preds_v2, all_labels_v2) if p == 0 and l == 0)
fpr = fp / max(fp + tn, 1)
tp  = sum(1 for p, l in zip(all_preds_v2, all_labels_v2) if p == 1 and l == 1)
fn  = sum(1 for p, l in zip(all_preds_v2, all_labels_v2) if p == 0 and l == 1)
recall = tp / max(tp + fn, 1) if (tp + fn) > 0 else None

n_classes = len(set(all_labels_v2))
auc = roc_auc_score(all_labels_v2, all_probs_v2) if n_classes > 1 else None

print("\n── Acceptance Criteria ─────────────────────────────────────────")
print(f"  Sports FPR ≤ 0.08:       {'✅' if fpr <= 0.08 else '❌'} ({fpr:.3f})")
if recall is not None:
    print(f"  Violence recall ≥ 0.75:  {'✅' if recall >= 0.75 else '❌'} ({recall:.3f})")
else:
    print(f"  Violence recall:         ⚠️  N/A — upload violence images to evaluate")
if auc is not None:
    print(f"  AUC ≥ 0.80:              {'✅' if auc >= 0.80 else '❌'} ({auc:.3f})")
else:
    print(f"  AUC:                     ⚠️  N/A — need both classes in val set")
```

**If criteria fail:**

| Failure | Action |
|---|---|
| Sports FPR > 0.08 | Collect 300 more sports images in Step 2-B, lower `FREEZE_UP_TO` to 7, retrain |
| Violence recall < 0.75 | Upload more violence images in Step 2-C, re-run Step 2-E |
| AUC N/A or < 0.80 | Upload violence images — AUC requires both classes present |
| `n_train == 0` after freeze | Architecture uses different layer names — run `print(model)` and adjust the freeze loop |
| VRAM > 14.5 GB | Reduce to `BATCH_SIZE=96` |

---

### STEP 2-G: Download violence model

```python
import shutil
from google.colab import files as colab_files
from pathlib import Path

if Path("runs/violence_finetuned").exists():
    shutil.make_archive("violence_finetuned", "zip", "runs/violence_finetuned")
    colab_files.download("violence_finetuned.zip")
    print("Downloaded: violence_finetuned.zip")
    print("On local machine: extract to trongso/violence_finetuned/")
    print("In app.py update: load violence model from trongso/violence_finetuned/")
else:
    print("ERROR: runs/violence_finetuned not found.")
```

---

## LOCAL INTEGRATION (Run on your machine after downloading both zips)

```python
# 1. Extract both zips:
#    nsfw_finetuned.zip    → trongso/nsfw_finetuned/
#    violence_finetuned.zip → trongso/violence_finetuned/

from transformers import ViTForImageClassification, ViTImageProcessor, pipeline as hf_pipeline
from transformers import AutoModelForImageClassification, AutoImageProcessor
from pathlib import Path
import torch

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def load_nsfw_model():
    local_path = Path("trongso/nsfw_finetuned")
    if local_path.exists():
        print(f"[NSFW] Loading fine-tuned model from {local_path}")
        return hf_pipeline("image-classification", model=str(local_path),
                            device=0 if torch.cuda.is_available() else -1, top_k=2)
    print("[NSFW] Fine-tuned model not found, using base model")
    return hf_pipeline("image-classification", model="AdamCodd/vit-base-nsfw-detector",
                        device=0 if torch.cuda.is_available() else -1, top_k=5)

def load_violence_model():
    local_path = Path("trongso/violence_finetuned")
    if local_path.exists():
        print(f"[Violence] Loading fine-tuned model from {local_path}")
        proc  = AutoImageProcessor.from_pretrained(str(local_path))
        model = AutoModelForImageClassification.from_pretrained(str(local_path)).to(DEVICE).eval()
        return model, proc
    print("[Violence] Fine-tuned model not found, using base model")
    proc  = AutoImageProcessor.from_pretrained("jaranohaal/vit-base-violence-detection")
    model = AutoModelForImageClassification.from_pretrained(
                "jaranohaal/vit-base-violence-detection").to(DEVICE).eval()
    return model, proc

# Updated NSFW scoring (fine-tuned model is binary: 0=sfw, 1=nsfw)
def get_nsfw_score_v2(image, nsfw_pipe):
    result = nsfw_pipe(image)
    scores = {r["label"].lower(): r["score"] for r in result}
    return scores.get("nsfw", scores.get("label_1", 0.0))

# Action thresholds for fine-tuned binary model:
# nsfw_score >= 0.70  → BAN
# nsfw_score >= 0.45  → BLUR
# nsfw_score <  0.45  → SAFE
# (The fine-tuned model's 0.5 decision boundary now corresponds to actual explicit content)
```

---

## SUMMARY CHECKLIST

### NSFW Job
- [ ] Step 1-A: GPU verified ✅
- [ ] Step 1-B: SFW images collected (target ≥ 1000 + 500 athletic hard negatives)
- [ ] Step 1-C: Explicit images uploaded (optional but improves recall)
- [ ] Step 1-D: Manifest built
- [ ] Step 1-E: Training completed — `BATCH_SIZE=128`, 20 epochs, VRAM ~12–13 GB
- [ ] Step 1-F: AUC ≥ 0.85, FPR ≤ 0.10, recall ≥ 0.80 ✅
- [ ] Step 1-G: `nsfw_finetuned.zip` downloaded

### Violence Job (new session)
- [ ] Step 2-A: GPU verified ✅
- [ ] Step 2-B: Non-violence + sports images collected (target ≥ 1300) — using `keremberke/volleyball-object-detection`
- [ ] Step 2-C: Violence images uploaded (optional)
- [ ] Step 2-D: Manifest built
- [ ] Step 2-E: Training completed — `BATCH_SIZE=128`, 15 epochs, VRAM ~12–13 GB
- [ ] Step 2-F: Sports FPR ≤ 0.08, AUC ≥ 0.80 ✅
- [ ] Step 2-G: `violence_finetuned.zip` downloaded

### Local integration
- [ ] Extract both zips to `trongso/`
- [ ] Update `load_nsfw_model()` and `load_violence_model()` in `app.py`
- [ ] Update NSFW action thresholds: ban ≥ 0.70, blur ≥ 0.45
- [ ] Run `python test_full_pipeline.py`
- [ ] Test volleyball video → should **NOT** flag violence
- [ ] Test swimwear image → should **NOT** trigger blur

---

## CHANGE LOG vs ORIGINAL PLAN

| Change | Reason |
|---|---|
| `BATCH_SIZE` 64 → **128** | Fills 12–13 GB of 15 GB T4 VRAM; old value wasted ~6 GB |
| `optimizer.zero_grad()` moved to **top** of batch loop | Prevents stale gradient accumulation on first batch |
| Added `non_blocking=True` to all `.to(DEVICE)` calls | Enables async CPU→GPU DMA via pinned memory |
| `num_workers` 4 → **2**, added `prefetch_factor=4` | Colab CPU is constrained; 4 workers causes stalls |
| Replaced `laion/laion-art` with `keremberke/volleyball-object-detection` | `laion-art` is metadata-only (no `.image` field) — collected 0 images silently |
| Added PyTorch version guard for `GradScaler` | Colab may run PyTorch 2.0–2.1 where `torch.amp.GradScaler("cuda")` is unavailable |
| AUC save trigger uses **loss fallback** when val set is single-class | Prevents saving every epoch when no explicit images are uploaded |
| `TARGET_SFW` 800 → **1000**, `TARGET_SPORTS` 500 → **600** | Minimum 1000–2000 images per class per problem statement |
| Added OOM fallback note: reduce to `BATCH_SIZE=96` | Safety valve if VRAM spikes above 14.5 GB |
