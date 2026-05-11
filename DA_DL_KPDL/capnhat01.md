# Cap Nhat 01 - Chuan hoa du lieu va pipeline Kaggle end-to-end

## 1. Muc tieu cua lan cap nhat nay

Lan cap nhat nay tap trung vao 6 viec:

1. Chuan hoa du lieu tren Kaggle theo dung huong trong `doc/kehoach.md`.
2. Gom cac dataset cung muc dich ve cung mot taxonomy va sinh split `train/val/test` khong ro ri test.
3. Chot lai trang thai thuc te cua nguon video hien co tren Kaggle:
   - `RWF-2000` voi file `.avi`
   - `UCF-Crimes` voi file `.mp4`
   - `UCF-101` voi file `.avi`, da duoc dua vao pipeline data prep lam nguon normal action / hard temporal negative
4. Chuyen cac nguon video sang dang phu hop de train nhanh hon:
   - Tram 1 / proxy gate: luu 8 frame mau thanh `.npy`
   - Temporal transformer: luu CLIP feature `[T, 768]` thanh `.npy`, va co the sinh them aux feature
5. Tao them `challenge_holdout` cho `normal hard` va `positive hard`.
6. Bo sung `NSFW scorer` rieng de dua score NSFW vao aux feature temporal.
7. Viet lai runbook cho dung tinh huong project nam trong `Kaggle Input`, can copy code sang `Kaggle Working` truoc khi cai dependency va chay script.
8. Dua them `SwAV` cho spatial SSL va stage scene cut / inference theo huong `TransNetV2`.

## 2. Cac file/code da duoc them hoac cap nhat

### Script data prep va orchestration

- `scripts/prepare_kaggle_data.py`
  - Quet `/kaggle/input`
  - Nhan dien cac dataset da biet
  - Gom label ve schema thong nhat
  - Tao split `train/val/test`
  - Xuat labels CSV cho `proxy`, `temporal`, `spatial`, `multitask`
  - Sinh runtime config cho train tren Kaggle

- `scripts/build_proxy_arrays.py`
  - Lay toi da 8 frame tu video
  - Resize va luu thanh `.npy`
  - Tao manifest `proxy_train/val/test.csv`

- `scripts/prepare_yolo_dataset.py`
  - Gom cac dataset YOLO-format
  - Remap nhan ve 2 class:
    - `risky_object`
    - `medical_tool`
  - Tao dataset merged cho Ultralytics

- `scripts/build_clip_features.py`
  - Nang cap script cu
  - Sinh CLIP CLS feature `.npy`
  - Co the sinh them aux feature:
    - optical flow magnitude
    - score tu YOLO neu ban truyen `--yolo_weights`
  - Manifest output ho tro them `aux_feature_path`

- `scripts/run_kaggle_end_to_end.py`
  - Orchestrate pipeline theo stage
  - Co the chay tung stage hoac chay ca pipeline

### Evaluation scripts

- `scripts/evaluate_proxy.py`
- `scripts/evaluate_multitask.py`
- `scripts/evaluate_challenge.py`
  - Danh gia model multitask tren tap `challenge_holdout`
  - Phan tich theo tung bucket: `normal_hard`, `positive_hard`
  - Xuat metrics: F1, Precision, Recall, Confusion Matrix theo tung label va tung bucket

Cac script nay dung `test_manifest` hoac `challenge_manifest` rieng, khong dung vao train/val.

### Loader/model/trainer

- `src/data/proxy_array_dataset.py`
  - Loader cho proxy `.npy`

- `src/data/manifest_dataset.py`
  - Ho tro `aux_feature_path`

- `src/models/gated_fusion.py`
  - Fusion CLIP va aux feature

- `src/models/task_prompted_model.py`
  - Cap nhat theo huong:
    - task tokens
    - gated fusion
    - cross-attention query tu task token vao frame tokens

- `src/training/engine.py`
  - Ho tro aux features
  - Ho tro label smoothing
  - Ho tro backbone/head learning rate
  - Them early stopping
  - Ghi confusion matrix cho tung label

- `src/training/proxy_trainer.py`
  - Train duoc tu image manifest hoac proxy array manifest
  - Gom logits theo clip khi input la `[T, C, H, W]`

### Config

- `configs/kaggle_data_prep.yaml`
- Cap nhat:
  - `configs/proxy_efficientnet.yaml`
  - `configs/ssl_spatial.yaml`
  - `configs/temporal_ssl_pretext.yaml`
  - `configs/ssl_temporal.yaml`
  - `configs/finetune_multitask.yaml`

## 3. Taxonomy du lieu da dung

### 3.1 Nhom video cho proxy + temporal

Trang thai thuc te tai thoi diem cap nhat nay:

- Tren Kaggle input hien co 3 nguon video da duoc script ho tro truc tiep:
  - `RWF-2000` voi duoi file `.avi`
  - `UCF-Crimes` voi duoi file `.mp4`
  - `UCF-101` voi duoi file `.avi`
- Vi vay, khi doc tai lieu nay can hieu dung:
  - pipeline hien tai chay end-to-end duoc voi 3 nguon video dang co
  - `UCF-101` da duoc dua vao data prep de bo tro `proxy`, `temporal`, `multitask`, va `challenge_holdout`

#### `RWF-2000`

- Dinh dang file: `.avi`

- `Fight` -> `violence=1`, `proxy_label=1`
- `NonFight` -> `violence=0`, `proxy_label=0`

Dung cho:

- `proxy`
- `temporal`
- `multitask`

#### `UCF-Crimes`

- Dinh dang file: `.mp4`

- Anomaly classes duoc map vao `proxy_label=1`
- Normal videos map vao `proxy_label=0`
- Mac dinh `violence=1` voi cac class trong `configs/kaggle_data_prep.yaml`:
  - `Abuse`
  - `Arrest`
  - `Arson`
  - `Assault`
  - `Explosion`
  - `Fighting`
  - `RoadAccidents`
  - `Robbery`
  - `Shooting`

- Cac anomaly khac duoc xem la `proxy risky` nhung `violence=0`

Ly do:

- Trạm 1 can hoc "risky / not risky"
- Temporal head can hoc "violence / not violence" sach hon

#### `UCF-101`

- Dinh dang file: `.avi`
- Da duoc dua vao script `prepare_kaggle_data.py`
- Mac dinh duoc map:
  - `violence=0`
  - `self_harm=0`
  - `nsfw=0`
  - `proxy_label=0`
- Vai tro:
  - bo sung `normal action videos`
  - bo sung `hard temporal negative`
  - bo sung cac class de gay nham nhu `Punch`, `Fencing`, `BoxingPunchingBag`, `Nunchucks`, `CuttingInKitchen`

### 3.2 Nhom image cho spatial + multitask

#### `nsfw_dataset_v1`

- Positive:
  - `porn`
  - `sexy`
  - `hentai`
- Negative:
  - `neutral`
  - `drawings`

Map:

- `nsfw=1` cho positive
- `nsfw=0` cho negative

#### `Adult content dataset / P2datasetFull`

Da duoc xac nhan map dung:

- folder `"1"` -> `nsfw=0`
- folder `"2"` -> `nsfw=1`

Trang thai hien tai:

- mapping nay da duoc doi lai trong `configs/kaggle_data_prep.yaml`
- `prepare_kaggle_data.py` cung da dung mapping moi

#### `Self Harm Detection.v1i.yolov8`

- Anh muc tieu -> `self_harm=1`
- Dung cho:
  - `spatial`
  - `multitask`
  - `yolo positive source`

#### `Suicide Detection.v1i.yolov8(1)`

- Anh muc tieu -> `self_harm=1`
- Dung cho:
  - `spatial`
  - `multitask`
  - `yolo positive source`

#### `Surgical Tools Dataset.v2-labelled-set.yolov8`

- Hard negative y khoa
- Map image-level:
  - `violence=0`
  - `self_harm=0`
  - `nsfw=0`

- Dung cho:
  - `spatial`
  - `multitask`
  - `yolo medical_tool`

#### `Wound_dataset copy`

- Hard negative y khoa
- Map:
  - `violence=0`
  - `self_harm=0`
  - `nsfw=0`

Dung cho:

- `spatial`
- `multitask`

## 4. Chien luoc chia train/val/test

### Nguyen tac

- Test khong dung trong qua trinh train
- Test khong dung de chon hyperparameter
- Val chi dung de theo doi va early stopping

### Cach chia

1. Neu dataset da co split ro rang:
   - giu nguyen test/val neu co
2. Neu dataset chi co `train`:
   - dung `train_test_split` cua sklearn de tao them `val` va `test`
3. Neu la video:
   - split theo `group_id` de tranh ro ri giua cac clip cung goc
   - voi `RWF-2000`, `fight_0`, `fight_1`, ... co the duoc group cung goc theo regex bo duoi `_so`

### Co can hold-out cho normal case va hard case khong?

Co. Day la viec rat nen lam neu ban muon danh gia that su chat luong mo hinh, dac biet la voi bai toan kiem duyet.

Toi thieu, tap `test` nen co du 4 nhom:

1. `positive clear`: mau duong tinh ro rang
2. `positive hard`: mau duong tinh kho, mo, thieu sang, bi che mot phan
3. `normal easy`: mau am tinh de
4. `normal hard` hoac `hard negative`: mau am tinh de gay nham, vi du y khoa, vet thuong, dao mo, canh va cham an toan, nguoi mac it vai nhung khong NSFW

Khuyen nghi thuc te:

- `val` dung de theo doi va early stopping
- `test` dung de bao cao chi so chinh
- neu ban du du lieu, hay tao them mot tap `challenge_holdout` rieng, khong tham gia train/val/test tuning

Vai tro cua `challenge_holdout`:

- do suc ben cua model tren cac ca kho
- kiem tra false positive voi `normal hard`
- kiem tra false negative voi `positive hard`

Trong pipeline hien tai:

- script da sinh `train/val/test` chuan
- script hien tai da ho tro sinh them split `challenge` tu `challenge_bucket`
- neu chua du du lieu de lam tap rieng, uu tien dam bao `test` da co ca `normal easy` va `normal hard`

### Ket qua output

Sau khi chay `prepare_kaggle_data.py`, ban se co:

- `/kaggle/working/artifacts/data_prep/metadata/classification_master.csv`
- `/kaggle/working/artifacts/data_prep/metadata/classification_summary.json`
- `/kaggle/working/artifacts/data_prep/labels/labels_temporal_{train,val,test,challenge}.csv`
- `/kaggle/working/artifacts/data_prep/labels/labels_multitask_{train,val,test,challenge}.csv`
- `/kaggle/working/artifacts/data_prep/labels/labels_spatial_{train,val,test,challenge}.csv`
- `/kaggle/working/artifacts/data_prep/labels/labels_nsfw_{train,val,test,challenge}.csv`
- `/kaggle/working/artifacts/data_prep/labels/proxy_video_{train,val,test,challenge}.csv`

## 5. Dau ra `.npy` da duoc thiet ke

### 5.1 Proxy arrays

Moi video proxy duoc chuyen thanh:

- shape: `[8, 224, 224, 3]`
- dtype: `uint8`

Muc dich:

- khong decode video lap di lap lai
- train EfficientNet nhanh hon va on dinh hon tren Kaggle

### 5.2 Temporal / multitask CLIP features

Moi sample duoc chuyen thanh:

- `feature_path`: `.npy` CLIP CLS
- shape khuyen nghi: `[T, 768]`
- `T=64` cho video
- image se ra `[1, 768]` va duoc pad sau

Neu bat `--save_aux_features`, script se sinh them:

- `aux_feature_path`
- mac dinh gom:
  - optical flow magnitude
  - `risky_object` score tu YOLO neu co weights
  - `medical_tool` score tu YOLO neu co weights
  - `nsfw_score` tu NSFW scorer neu co weights

## 6. Runtime configs duoc sinh tu dong

Sau khi chay data prep:

- `/kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/nsfw_scorer_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/ssl_spatial_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/temporal_ssl_pretext_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/ssl_temporal_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml`
- `/kaggle/working/artifacts/runtime_configs/yolov8_nano_kaggle.yaml`

Ban nen dung cac file nay khi train tren Kaggle, khong dung manifest mau trong repo nua.

## 7. Cac cell Kaggle de chay khi project nam trong `Kaggle Input`

### Nguyen tac quan trong

- `/kaggle/input` la `read-only`
- `/kaggle/working` moi la noi duoc phep ghi
- khong can copy cac dataset lon nhu `RWF2000`, `UCF_Crimes`, `UCF101`, `data_dl`
- chi can copy phan code project sang `/kaggle/working`, sau do cai dependency va chay script tu ban copy nay

### Cell 1 - Tim root project trong `Kaggle Input`

```python
from pathlib import Path

INPUT_ROOT = Path("/kaggle/input")

candidates = []
for req in INPUT_ROOT.rglob("requirements-kaggle.txt"):
    root = req.parent
    if (root / "scripts").exists() and (root / "src").exists() and (root / "configs").exists():
        candidates.append(root)

assert candidates, "Khong tim thay root project trong /kaggle/input"

for i, path in enumerate(candidates, 1):
    print(f"{i}. {path}")

SRC_PROJECT_ROOT = candidates[0]
DST_PROJECT_ROOT = Path("/kaggle/working") / SRC_PROJECT_ROOT.name

print("SRC_PROJECT_ROOT =", SRC_PROJECT_ROOT)
print("DST_PROJECT_ROOT =", DST_PROJECT_ROOT)
```

### Cell 2 - Copy code project sang `Kaggle Working`

```python
import shutil

ignore = shutil.ignore_patterns(
    ".pytest_cache",
    "__pycache__",
    ".ipynb_checkpoints",
)

shutil.copytree(
    SRC_PROJECT_ROOT,
    DST_PROJECT_ROOT,
    dirs_exist_ok=True,
    ignore=ignore,
)

print("Da copy project sang:", DST_PROJECT_ROOT)
```

### Cell 3 - Khai bao bien duong dan

```python
PROJECT_ROOT = DST_PROJECT_ROOT
DATA_ROOT = Path("/kaggle/input")
OUTPUT_ROOT = Path("/kaggle/working/artifacts")

print("PROJECT_ROOT =", PROJECT_ROOT)
print("DATA_ROOT    =", DATA_ROOT)
print("OUTPUT_ROOT  =", OUTPUT_ROOT)
```

### Cell 4 - Di vao project va cai dependency

```python
%cd $PROJECT_ROOT
%pip install -q -r requirements-kaggle.txt
```

### Cell 5 - Chuan hoa du lieu classification va sinh split

```bash
%%bash
python scripts/prepare_kaggle_data.py \
  --config configs/kaggle_data_prep.yaml \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 6 - Kiem tra summary sau khi chuan hoa

```python
import json
from pathlib import Path

summary_path = Path("/kaggle/working/artifacts/data_prep/metadata/classification_summary.json")
summary = json.loads(summary_path.read_text(encoding="utf-8"))
summary
```

### Cell 7 - Dung lai neu summary chua sach

Chi chay tiep neu:

- `warnings` da duoc hieu va chap nhan
- `unmatched_roots` khong chua dataset quan trong ban muon dung
- `UCF-101` da xuat hien trong `by_source` neu ban da attach dataset nay
- `adult_content_binary` da dung mapping moi `1 -> safe`, `2 -> nsfw`

### Cell 8 - Chuyen video proxy thanh `.npy`

```bash
%%bash
python scripts/build_proxy_arrays.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/proxy_video_train.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/proxy_train.csv \
  --skip_existing

python scripts/build_proxy_arrays.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/proxy_video_val.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/proxy_val.csv \
  --skip_existing

python scripts/build_proxy_arrays.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/proxy_video_test.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/proxy_test.csv \
  --skip_existing
```

### Cell 9 - Chuan hoa dataset YOLO merged

```bash
%%bash
python scripts/prepare_yolo_dataset.py \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 10 - Train proxy gate (dung khi project da co log moi)

```bash
%%bash
python scripts/train_proxy_efficientnet.py \
  --config /kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 10b - Train proxy gate (STANDALONE - dung khi project chua co log)

Cell nay thay the Cell 10 khi ban dang chay tren phien ban code cu chua cap nhat log.
Khong can sua file nguon, paste thang cell nay vao Kaggle va chay.

```python
import json, csv, time, random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import yaml
from sklearn.metrics import confusion_matrix, precision_score, recall_score
from torch.utils.data import DataLoader
from torchvision import transforms

from src.data.proxy_array_dataset import ProxyArrayDataset
from src.data.image_manifest_dataset import ImageManifestDataset
from src.models.proxy_efficientnet import build_proxy_efficientnet

# ── 1. Load config ──
config_path = Path("/kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml")
with config_path.open("r", encoding="utf-8") as f:
    config = yaml.safe_load(f) or {}

data_root = Path("/kaggle/input")
output_root = Path("/kaggle/working/artifacts")

seed = int(config.get("project", {}).get("seed", 42))
random.seed(seed); np.random.seed(seed)
torch.manual_seed(seed); torch.cuda.manual_seed_all(seed)

data_cfg = config.get("data", {})
target_cfg = config.get("target", {})
opt_cfg = config.get("optimizer", {})
runtime_cfg = config.get("runtime", {})

image_size = int(data_cfg.get("image_size", 224))
train_tfm = transforms.Compose([
    transforms.Resize((image_size, image_size)),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.ColorJitter(0.2, 0.2, 0.2, 0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
])
val_tfm = transforms.Compose([
    transforms.Resize((image_size, image_size)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
])

# ── 2. Build datasets ──
import pandas as pd
def _build_ds(manifest_path, tfm):
    header = pd.read_csv(manifest_path, nrows=0).columns.tolist()
    if "array_path" in header:
        return ProxyArrayDataset(manifest_path, data_root, transform=tfm)
    return ImageManifestDataset(manifest_path, data_root, transform=tfm)

train_ds = _build_ds(Path(data_cfg["train_manifest"]), train_tfm)
val_ds   = _build_ds(Path(data_cfg["val_manifest"]),   val_tfm)
batch_size = int(target_cfg.get("batch_size", 32))
nw = int(runtime_cfg.get("num_workers", 4))
train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True,  num_workers=nw, pin_memory=True)
val_loader   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False, num_workers=nw, pin_memory=True)

# ── 3. Model + optimizer ──
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = build_proxy_efficientnet(num_classes=2, pretrained=True).to(device)
criterion = nn.CrossEntropyLoss(label_smoothing=float(target_cfg.get("label_smoothing", 0.0)))
optimizer = torch.optim.AdamW(model.parameters(), lr=float(opt_cfg.get("lr", 3e-4)), weight_decay=float(opt_cfg.get("weight_decay", 0.01)))
epochs = int(target_cfg.get("epochs", 12))
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(epochs, 1))
patience = int(target_cfg.get("early_stopping_patience", 0))

def fwd(model, x):
    if x.ndim == 5:
        b, t, c, h, w = x.shape
        return model(x.reshape(b*t, c, h, w)).view(b, t, -1).mean(dim=1)
    return model(x)

# ── 4. Training loop with logging ──
ckpt_dir = output_root / "checkpoints"; ckpt_dir.mkdir(parents=True, exist_ok=True)
history_csv = output_root / "metrics" / "proxy_history.csv"
history_csv.parent.mkdir(parents=True, exist_ok=True)
best_recall = -1.0; no_improve = 0; best_cm = {}
t0 = time.time()

print(f"\n{'#'*60}")
print(f"  PROXY GATE TRAINING")
print(f"  Dataset: {len(train_ds)} train / {len(val_ds)} val")
print(f"  Epochs: {epochs} | Batch: {batch_size} | LR: {opt_cfg.get('lr', 3e-4)}")
print(f"  Device: {device}")
print(f"{'#'*60}\n")

for epoch in range(1, epochs + 1):
    model.train()
    running = 0.0; n = 0
    for x, y in train_loader:
        x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        loss = criterion(fwd(model, x), y)
        loss.backward(); optimizer.step()
        running += loss.item(); n += 1

    model.eval()
    y_true, y_pred = [], []
    vloss = 0.0; m = 0
    with torch.no_grad():
        for x, y in val_loader:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            logits = fwd(model, x)
            vloss += criterion(logits, y).item(); m += 1
            y_true.extend(y.cpu().tolist())
            y_pred.extend(logits.argmax(dim=1).cpu().tolist())

    scheduler.step()
    tl = running / max(n, 1)
    vl = vloss / max(m, 1)
    rec = recall_score(y_true, y_pred, pos_label=1, zero_division=0)
    pre = precision_score(y_true, y_pred, pos_label=1, zero_division=0)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0,1]).ravel()
    acc = (tn + tp) / max(tn + fp + fn + tp, 1)

    # Log ra console
    print(f"\n{'='*60}")
    print(f"  [Proxy Gate] Epoch {epoch}/{epochs}")
    print(f"{'='*60}")
    print(f"  Train Loss : {tl:.4f}")
    print(f"  Val   Loss : {vl:.4f}  (gap: {abs(vl - tl):.4f})")
    print(f"  Val Accuracy : {acc:.4f}")
    print(f"  Val Recall   : {rec:.4f}  (risky class)")
    print(f"  Val Precision: {pre:.4f}  (risky class)")
    print(f"  Confusion Matrix:")
    print(f"               Pred=Safe  Pred=Risky")
    print(f"    True=Safe   {tn:>7}    {fp:>7}")
    print(f"    True=Risky  {fn:>7}    {tp:>7}")
    print(f"  LR: {optimizer.param_groups[0]['lr']:.2e}")

    # Ghi CSV
    exists = history_csv.exists()
    row = {"epoch": epoch, "train_loss": tl, "val_loss": vl,
           "val_recall_risky": rec, "val_precision_risky": pre, "lr": optimizer.param_groups[0]["lr"]}
    with history_csv.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not exists: w.writeheader()
        w.writerow(row)

    # Save checkpoint
    state = {"epoch": epoch, "model_state": model.state_dict(),
             "optimizer_state": optimizer.state_dict(),
             "scheduler_state": scheduler.state_dict(), "best_recall": best_recall}
    torch.save(state, ckpt_dir / "proxy_efficientnet_last.pth")

    if rec > best_recall:
        best_recall = float(rec)
        state["best_recall"] = best_recall
        torch.save(state, ckpt_dir / "proxy_efficientnet_best.pth")
        best_cm = {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}
        no_improve = 0
        print(f"  ★ New Best Recall = {best_recall:.4f} → checkpoint saved")
    else:
        no_improve += 1
        print(f"  No improvement ({no_improve}/{patience if patience > 0 else '∞'})")

    if patience > 0 and no_improve >= patience:
        print(f"\n  ⛔ Early stopping after {no_improve} epochs")
        break

elapsed = round(time.time() - t0, 3)
summary = {
    "stage": "proxy_efficientnet", "status": "finished",
    "best_recall_risky": best_recall, "best_confusion_matrix": best_cm,
    "history_csv": str(history_csv), "elapsed_seconds": elapsed,
    "best_checkpoint": str(ckpt_dir / "proxy_efficientnet_best.pth"),
    "last_checkpoint": str(ckpt_dir / "proxy_efficientnet_last.pth"),
}
(output_root / "metrics" / "proxy_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

print(f"\n{'#'*60}")
print(f"  TRAINING COMPLETE")
print(f"  Best Recall: {best_recall:.4f}")
print(f"  Time: {elapsed:.0f}s ({elapsed/60:.1f} min)")
print(f"{'#'*60}")
print(json.dumps(summary, indent=2))
```

### Cell 11 - Train NSFW scorer

```bash
%%bash
python scripts/train_nsfw_scorer.py \
  --config /kaggle/working/artifacts/runtime_configs/nsfw_scorer_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 12 - Train SwAV spatial stage

```bash
%%bash
python scripts/train_ssl_spatial.py \
  --config /kaggle/working/artifacts/runtime_configs/ssl_spatial_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 13 - Train YOLO

```bash
%%bash
python scripts/train_yolov8.py \
  --config /kaggle/working/artifacts/runtime_configs/yolov8_nano_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 14 - Build temporal features `[T, 768]` va aux (CO AUGMENTATION)

# Ghi chu: Cell 14 da duoc cap nhat de ho tro Style Augmentation.
# - Lenh dau tien (train): CO --augment va KHONG co --skip_existing (tao moi features)
# - Lenh thu 2, 3 (val, test): KHONG co --augment, CO --skip_existing
# Augmentation chi anh huong den CLIP features, optical flow / YOLO / NSFW aux luon dung frame goc.

```bash
%%bash
export YOLO_WEIGHTS=/kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt
export NSFW_WEIGHTS=/kaggle/working/artifacts/checkpoints/nsfw_scorer_best.pth

# TRAIN — CO augment, KHONG skip_existing (tao moi)
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_temporal_train.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/temporal_train.csv \
  --feature_subdir features/temporal_train \
  --save_aux_features \
  --aux_subdir aux_features/temporal_train \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --augment \
  --augment_strength 0.3

# VAL — KHONG augment
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_temporal_val.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/temporal_val.csv \
  --feature_subdir features/temporal_val \
  --save_aux_features \
  --aux_subdir aux_features/temporal_val \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --skip_existing

# TEST — KHONG augment
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_temporal_test.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/temporal_test.csv \
  --feature_subdir features/temporal_test \
  --save_aux_features \
  --aux_subdir aux_features/temporal_test \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --skip_existing
```

### Cell 14c - Tai ket qua Cell 14

```python
from pathlib import Path
import shutil
from IPython.display import FileLink, display

root = Path("/kaggle/working/artifacts")

items = [
    root / "features/temporal_train",
    root / "features/temporal_val",
    root / "features/temporal_test",
    root / "aux_features/temporal_train",
    root / "aux_features/temporal_val",
    root / "aux_features/temporal_test",
    root / "manifests/temporal_train.csv",
    root / "manifests/temporal_val.csv",
    root / "manifests/temporal_test.csv",
]

def make_zip(zip_base: Path, selected_items: list[Path]):
    archive_root = zip_base.parent / f"{zip_base.name}_content"
    if archive_root.exists():
        shutil.rmtree(archive_root)
    archive_root.mkdir(parents=True, exist_ok=True)

    for item in selected_items:
        if item.exists():
            target = archive_root / item.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
        else:
            print(f"Missing: {item}")

    archive_path = shutil.make_archive(str(zip_base), "zip", root_dir=str(archive_root))
    print(f"Created: {archive_path}")
    print(f"Size: {Path(archive_path).stat().st_size / (1024**3):.2f} GiB")
    display(FileLink(archive_path))

make_zip(Path("/kaggle/working/cell14_temporal_bundle"), items)
```

### Cell 15 - Build multitask features (CO AUGMENTATION)

# Ghi chu: Tuong tu Cell 14 — chi augment cho TRAIN, khong augment cho val/test.

```bash
%%bash
export YOLO_WEIGHTS=/kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt
export NSFW_WEIGHTS=/kaggle/working/artifacts/checkpoints/nsfw_scorer_best.pth

# TRAIN — CO augment, KHONG skip_existing
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_multitask_train.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/multitask_train.csv \
  --feature_subdir features/multitask_train \
  --save_aux_features \
  --aux_subdir aux_features/multitask_train \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --augment \
  --augment_strength 0.3

# VAL — KHONG augment
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_multitask_val.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/multitask_val.csv \
  --feature_subdir features/multitask_val \
  --save_aux_features \
  --aux_subdir aux_features/multitask_val \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --skip_existing

# TEST — KHONG augment
python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_multitask_test.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/multitask_test.csv \
  --feature_subdir features/multitask_test \
  --save_aux_features \
  --aux_subdir aux_features/multitask_test \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --skip_existing
```

### Cell 15c - Tai ket qua Cell 15

```python
from pathlib import Path
import shutil
from IPython.display import FileLink, display

root = Path("/kaggle/working/artifacts")

items = [
    root / "features/multitask_train",
    root / "features/multitask_val",
    root / "features/multitask_test",
    root / "aux_features/multitask_train",
    root / "aux_features/multitask_val",
    root / "aux_features/multitask_test",
    root / "manifests/multitask_train.csv",
    root / "manifests/multitask_val.csv",
    root / "manifests/multitask_test.csv",
]

def make_zip(zip_base: Path, selected_items: list[Path]):
    archive_root = zip_base.parent / f"{zip_base.name}_content"
    if archive_root.exists():
        shutil.rmtree(archive_root)
    archive_root.mkdir(parents=True, exist_ok=True)

    for item in selected_items:
        if item.exists():
            target = archive_root / item.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
        else:
            print(f"Missing: {item}")

    archive_path = shutil.make_archive(str(zip_base), "zip", root_dir=str(archive_root))
    print(f"Created: {archive_path}")
    print(f"Size: {Path(archive_path).stat().st_size / (1024**3):.2f} GiB")
    display(FileLink(archive_path))

make_zip(Path("/kaggle/working/cell15_multitask_bundle"), items)
```

### Cell 15b - Build challenge features (KHONG augment — day la tap danh gia)

```bash
%%bash
export YOLO_WEIGHTS=/kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt
export NSFW_WEIGHTS=/kaggle/working/artifacts/checkpoints/nsfw_scorer_best.pth

python scripts/build_clip_features.py \
  --labels_csv /kaggle/working/artifacts/data_prep/labels/labels_multitask_challenge.csv \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --manifest_out /kaggle/working/artifacts/manifests/multitask_challenge.csv \
  --feature_subdir features/multitask_challenge \
  --save_aux_features \
  --aux_subdir aux_features/multitask_challenge \
  --yolo_weights $YOLO_WEIGHTS \
  --nsfw_weights $NSFW_WEIGHTS \
  --skip_existing
```

### Cell 15d - Tai ket qua Cell 15b

```python
from pathlib import Path
import shutil
from IPython.display import FileLink, display

root = Path("/kaggle/working/artifacts")

items = [
    root / "features/multitask_challenge",
    root / "aux_features/multitask_challenge",
    root / "manifests/multitask_challenge.csv",
]

def make_zip(zip_base: Path, selected_items: list[Path]):
    archive_root = zip_base.parent / f"{zip_base.name}_content"
    if archive_root.exists():
        shutil.rmtree(archive_root)
    archive_root.mkdir(parents=True, exist_ok=True)

    for item in selected_items:
        if item.exists():
            target = archive_root / item.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
        else:
            print(f"Missing: {item}")

    archive_path = shutil.make_archive(str(zip_base), "zip", root_dir=str(archive_root))
    print(f"Created: {archive_path}")
    print(f"Size: {Path(archive_path).stat().st_size / (1024**3):.2f} GiB")
    display(FileLink(archive_path))

make_zip(Path("/kaggle/working/cell15b_challenge_bundle"), items)
```

### Cell 15e - Khoi phuc features tu /kaggle/input (SESSION MOI)

# Ghi chu quan trong:
# Sau khi tai zip ve va upload len Kaggle dataset (vi du: "temporal-features"),
# no se xuat hien tai /kaggle/input/temporal-features/
# Cell nay se:
#   1. Copy features + manifests tu /kaggle/input vao /kaggle/working/artifacts
#   2. Sua duong dan tuyet doi trong manifest CSV cho dung voi session moi
# Thay doi DATASET_NAME cho dung voi ten ban dat khi upload.

```python
import pandas as pd
from pathlib import Path
import shutil

# === CAU HINH — thay doi cho dung ten dataset ban da upload ===
FEATURE_DATASETS = {
    "temporal-features": "/kaggle/input/temporal-features",       # Cell 14
    "multitask-features": "/kaggle/input/multitask-features",     # Cell 15
    "challenge-features": "/kaggle/input/challenge-features",     # Cell 15b
}

artifacts = Path("/kaggle/working/artifacts")

for dataset_name, src_root in FEATURE_DATASETS.items():
    src = Path(src_root)
    if not src.exists():
        print(f"⚠ Dataset '{dataset_name}' khong ton tai tai {src}, bo qua.")
        continue

    print(f"\n{'='*50}")
    print(f"  Khoi phuc tu: {src}")
    print(f"{'='*50}")

    # Copy toan bo cau truc features/ aux_features/ manifests/ sang artifacts
    for subdir in ["features", "aux_features", "manifests"]:
        src_sub = src / subdir
        if src_sub.exists():
            dst_sub = artifacts / subdir
            dst_sub.mkdir(parents=True, exist_ok=True)
            for item in src_sub.iterdir():
                dst_item = dst_sub / item.name
                if item.is_dir():
                    if dst_item.exists():
                        shutil.rmtree(dst_item)
                    shutil.copytree(item, dst_item)
                    print(f"  Copied dir:  {subdir}/{item.name} ({len(list(item.rglob('*.npy')))} files)")
                else:
                    shutil.copy2(item, dst_item)
                    print(f"  Copied file: {subdir}/{item.name}")

# Sua duong dan tuyet doi trong tat ca manifest CSV
manifests_dir = artifacts / "manifests"
if manifests_dir.exists():
    print(f"\n{'='*50}")
    print(f"  Sua duong dan trong manifests")
    print(f"{'='*50}")
    for csv_file in manifests_dir.glob("*.csv"):
        df = pd.read_csv(csv_file)
        changed = False
        for col in ["feature_path", "aux_feature_path"]:
            if col not in df.columns:
                continue
            mask = df[col].notna() & (df[col] != "")
            if mask.any():
                # Thay the phan thu muc goc bang /kaggle/working/artifacts
                old_values = df.loc[mask, col].astype(str)
                new_values = old_values.apply(
                    lambda p: str(artifacts / "/".join(Path(p).parts[-3:]))  # giu 3 phan cuoi: features/xxx/sample.npy
                )
                if not old_values.equals(new_values):
                    df.loc[mask, col] = new_values
                    changed = True
        if changed:
            df.to_csv(csv_file, index=False)
            print(f"  ✓ Fixed paths in: {csv_file.name}")
        else:
            print(f"  — No changes needed: {csv_file.name}")

print(f"\n✅ Khoi phuc hoan tat. San sang chay Cell 16+.")
```

### Cell 16 - Temporal SSL pretext (warm-start tu SwAV spatial)

# Ghi chu: truyen --resume tro den ssl_spatial_best.pth de warm-start backbone
# tu SwAV. engine._load_model_weights_flexible() se tu dong extract cac
# tensor tuong thich, cac tensor con lai (frame_encoder, cross_attn, task_tokens)
# van khoi tao theo random. Neu khong co SwAV checkpoint, bo --resume di.

```bash
%%bash
python scripts/train_temporal_ssl.py \
  --config /kaggle/working/artifacts/runtime_configs/temporal_ssl_pretext_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --resume /kaggle/working/artifacts/checkpoints/ssl_spatial_best.pth
```

### Cell 17 - Temporal supervised stage (resume tu pretext)

```bash
%%bash
python scripts/train_ssl_temporal.py \
  --config /kaggle/working/artifacts/runtime_configs/ssl_temporal_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --resume /kaggle/working/artifacts/checkpoints/temporal_ssl_last.pth
```

### Cell 18 - Fine-tune multitask

```bash
%%bash
python scripts/train_finetune.py \
  --config /kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --resume /kaggle/working/artifacts/checkpoints/ssl_temporal_last.pth
```

### Cell 19 - Evaluate proxy tren test

```bash
%%bash
python scripts/evaluate_proxy.py \
  --config /kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml \
  --checkpoint /kaggle/working/artifacts/checkpoints/proxy_efficientnet_best.pth \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 20 - Evaluate multitask tren test

```bash
%%bash
python scripts/evaluate_multitask.py \
  --config /kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml \
  --checkpoint /kaggle/working/artifacts/checkpoints/finetune_multitask_best.pth \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

### Cell 21 - Kiem tra challenge holdout

```python
from pathlib import Path
import pandas as pd

challenge_path = Path("/kaggle/working/artifacts/data_prep/labels/labels_multitask_challenge.csv")
challenge_df = pd.read_csv(challenge_path)
challenge_df.head(), challenge_df["challenge_bucket"].value_counts(dropna=False)
```

### Cell 22 - Inference end-to-end co scene cut

```bash
%%bash
python scripts/run_inference_end_to_end.py \
  --config configs/inference.yaml \
  --video_path /kaggle/input/path-to-your-video/example.mp4 \
  --output_root /kaggle/working/artifacts
```

### Cell 23 - Evaluate challenge holdout

```bash
%%bash
python scripts/evaluate_challenge.py \
  --config /kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml \
  --checkpoint /kaggle/working/artifacts/checkpoints/finetune_multitask_best.pth \
  --challenge_manifest /kaggle/working/artifacts/manifests/multitask_challenge.csv \
  --data_root /kaggle/input \
  --output_root /kaggle/working/artifacts
```

Ket qua se co trong `/kaggle/working/artifacts/metrics/challenge_holdout_summary.json`,
gom:

- `overall`: F1 macro, confusion matrix tren toan bo challenge set
- `per_bucket`:
  - `normal_hard`: do false positive rate tren cac mau y khoa, vet thuong, dao mo...
  - `positive_hard`: do false negative rate tren cac mau kho nhan dien

## 8. Neu ban muon chay 1 lenh tong sau khi da copy project sang `working`

```bash
%%bash
python scripts/run_kaggle_end_to_end.py \
  --input_root /kaggle/input \
  --output_root /kaggle/working/artifacts \
  --prepare_config configs/kaggle_data_prep.yaml \
  --skip_existing
```

Khuyen nghi thuc te:

- Van nen chay theo tung cell de de resume khi Kaggle timeout
- Dung `--skip_existing` khi rerun
- Lenh tong chi nen dung sau khi `Cell 1` den `Cell 4` da xong

## 9. Luu y quan trong

### 9.1 Nhung gi da rat on

- Data standardization va split train/val/test da duoc dua vao script
- `challenge_holdout` da duoc sinh tu dong
- Proxy video -> `.npy` da co script rieng
- CLIP feature `.npy` + aux feature da co script
- `NSFW scorer` rieng da co trainer va checkpoint rieng
- `ssl_spatial` da chuyen sang huong `SwAV` tren anh tho
- Da co script inference end-to-end voi stage scene cut theo huong `TransNetV2`
- Runtime config cho Kaggle da duoc sinh tu dong
- Danh gia tren `test_manifest` da tach rieng

### 9.2 Nhung gi van la practical approximation

- Stage scene cut duoc bo sung cho inference, nhung neu moi truong khong co `transnetv2_pytorch` thi script se fallback ve single-scene mode
- `SwAV` hien tai la ban tu trien khai nhe de chay duoc tren Kaggle, khong phai ban distributed/day queue day du nhu training lon
- `NSFW scorer` da tach rieng thanh nhanh train/doc lap, nhung chua duoc dung de fine-tune nguoc tro lai backbone temporal
- Aux feature cho temporal da ho tro optical flow, YOLO score, va NSFW score; neu khong co checkpoint tuong ung thi kenh do se ve 0

### 9.3 Nhung gi can hieu dung ve du lieu video

- Hien tai pipeline dang chay tren 3 nguon video da co that:
  - `RWF-2000` `.avi`
  - `UCF-Crimes` `.mp4`
  - `UCF-101` `.avi`
- `UCF-101` da duoc map thanh nguon `safe action` / `hard temporal negative`
- Neu ban attach `UCF-101`, no se duoc scan tu dong trong data prep

### 9.4 Hold-out du lieu kho co nen lam ngay khong?

- Co, rat nen lam
- Neu chua du thoi gian, it nhat hay dam bao `test` co:
  - `normal easy`
  - `normal hard`
  - `positive clear`
  - `positive hard`
- Neu co du du lieu, hay tao them mot tap `challenge_holdout` rieng ngoai `train/val/test`

Noi ngan gon:

- Ban nay da duoc day theo huong Kaggle-first, chay duoc, de resume, de debug
- Nhung van nen coi day la ban thuc dung de train/inference tren Kaggle, chua phai ban nghien cuu day du theo moi chi tiet ly tuong

## 10. Thu tu uu tien rerun tren Kaggle

Neu session bi mat giua chung, uu tien rerun:

1. `prepare_kaggle_data.py`
2. `prepare_yolo_dataset.py`
3. `build_proxy_arrays.py`
4. `train_nsfw_scorer.py`
5. `build_clip_features.py` voi `--skip_existing`
6. cac lenh train co `--resume`

## 11. Kiem tra nhanh sau moi stage

- Sau data prep:
  - xem `classification_summary.json`
- Sau proxy arrays:
  - xem `/kaggle/working/artifacts/manifests/proxy_*.csv`
- Sau feature extraction:
  - xem `/kaggle/working/artifacts/manifests/{temporal,multitask,spatial}_*.csv`
- Sau train:
  - xem `/kaggle/working/artifacts/checkpoints`
  - xem `/kaggle/working/artifacts/metrics`

## 12. Trang thai hien tai va buoc tiep theo

### 12.1 Da hoan thanh (tat ca)

- [x] Scan va taxonomy cho UCF-101 (`scan_ucf101` trong `prepare_kaggle_data.py`)
- [x] Challenge holdout `normal_hard` / `positive_hard` (`assign_challenge_holdout`)
- [x] TransNetV2 inference end-to-end (`run_inference_end_to_end.py`, fallback graceful)
- [x] SwAV spatial SSL (`swav_trainer.py` + `swav_model.py` + `swav_dataset.py`)
- [x] NSFW scorer aux feature (`nsfw_trainer.py` tich hop vao `build_clip_features.py`)
- [x] Script evaluate challenge holdout (`evaluate_challenge.py`, breakdown theo bucket)
- [x] Mapping Adult content binary xac nhan: folder `"1"` -> nsfw=0, folder `"2"` -> nsfw=1
- [x] Warm-start backbone temporal tu SwAV checkpoint (Cell 16 da them `--resume ssl_spatial_best.pth`)

### 12.2 San sang chay end-to-end

Tat ca cac buoc trong Cell 1 den Cell 23 da san sang. Thu tu chay tren Kaggle:

```
Cell 1  -> Tim project root
Cell 2  -> Copy code sang /kaggle/working
Cell 3  -> Khai bao bien
Cell 4  -> Cai dependency
Cell 5  -> Data prep (phan loai + split)
Cell 6  -> Kiem tra summary
Cell 7  -> Dung lai neu data chua on
Cell 8  -> Build proxy arrays .npy
Cell 9  -> Chuan hoa YOLO dataset
Cell 10 -> Train proxy gate (EfficientNet-B0)
Cell 11 -> Train NSFW scorer
Cell 12 -> Train SwAV spatial SSL
Cell 13 -> Train YOLOv8-nano
Cell 14 -> Build CLIP features temporal
Cell 15 -> Build CLIP features multitask
Cell 15b-> Build challenge features (optional)
Cell 16 -> Temporal SSL pretext (warm-start tu SwAV)
Cell 17 -> Temporal supervised stage
Cell 18 -> Fine-tune multitask
Cell 19 -> Evaluate proxy tren test
Cell 20 -> Evaluate multitask tren test
Cell 21 -> Kiem tra challenge holdout split
Cell 22 -> Inference video cu the
Cell 23 -> Evaluate challenge holdout (breakdown bucket)
```

### 12.3 Tuy chon sau khi co ket qua

1. Mo rong `challenge_holdout` bang cach nhan thu cong theo cap do kho (positive_hard / normal_hard)
2. Them heuristic gioi han lop UCF-101 hard negative neu false-positive qua cao
3. Day thanh Kaggle notebook demo hoan chinh voi output visualization
