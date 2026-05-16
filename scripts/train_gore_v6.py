"""
train_gore_v6.py — V6.1
=========================
Training script for GoreDetector with ImageNet ResNet18 backbone.

V6.1 Design:
  - Blood_Violence dataset: filtered via categorize_image() per YOLO labels
    Uses Roboflow's pre-existing train/valid/test splits (NO re-splitting)
    train/augmented → "positive_clean" weight=2.0, "positive_contaminated" weight=0.5
  - HOD/blood: most trusted positive, weight=3.0
  - HOD/gun, HOD/knife: hard negatives, weight=2.0
  - Wound dataset (Surgical/Diabetic): hard negatives, weight=2.0
  - UCF-101 frames:
      - soft negative (exclude red-heavy classes): weight=1.0
      - red-heavy classes (SalsaSpin, Diving, etc.): weight=2.5 (tricky FP)
  - Reweight strategy configurable via --reweight_mode
    (default: sampler, to reduce calibration drift from double reweight)
  - pos_weight computed automatically from actual pos/neg ratio
  - WeightedRandomSampler via GoreDataset.get_weighted_sampler()

GATE 1 Pass Criteria:
  Test AUC   >= 0.88
  Test Recall >= 0.80
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import glob
import logging
import random
import csv
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score, recall_score, precision_score, f1_score, accuracy_score, average_precision_score
from torch.utils.data import DataLoader
from tqdm import tqdm

from scripts._common import append_epoch_metrics
from src.models.gore_detector import (
    GoreDetector, GoreDataset,
    get_default_transform,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)

# ─────────────────────────────────────────────────────────────────────────────
# Blood_Violence class IDs (nc=6)
# names: ['Gun', 'Mutilation', 'Normal', 'Violent', 'blood', 'knife']
# ─────────────────────────────────────────────────────────────────────────────

BLOOD_CLASS_ID     = 4
NORMAL_CLASS_ID    = 2
WEAPON_CLASS_IDS   = {0, 5}   # Gun (0), Knife (5)
MUTILATION_ID      = 1
VIOLENT_ID         = 3


# ─────────────────────────────────────────────────────────────────────────────
# Data Categorization
# ─────────────────────────────────────────────────────────────────────────────

def categorize_image(label_path: str) -> str:
    """
    Read a YOLOv8 label file and classify the image into one of 5 categories.
    Handles multi-label correctly (one image can have multiple bbox class IDs).

    Blood_Violence.v1 class mapping:
      0=Gun  1=Mutilation  2=Normal  3=Violent  4=blood  5=knife

    Returns:
        "positive_clean"        — blood only, no weapon, no mutilation
        "positive_contaminated" — blood + weapon in same frame (noisy)
        "negative_clean"        — Normal label, no blood
        "negative_violent"      — Violent but no blood (useful hard negative)
        "skip"                  — Mutilation, empty, or ambiguous

    Priority logic:
        blood wins over all other classes
        mutilation + blood → skip (extreme gore, too hard to calibrate)
        mutilation only    → skip (content out of scope for typical gore signal)
    """
    try:
        with open(label_path) as f:
            lines = [ln.strip() for ln in f if ln.strip()]
    except FileNotFoundError:
        return "skip"

    if not lines:
        return "skip"

    class_ids = {int(ln.split()[0]) for ln in lines}

    has_blood      = BLOOD_CLASS_ID   in class_ids
    has_weapon     = bool(WEAPON_CLASS_IDS & class_ids)
    has_mutilation = MUTILATION_ID    in class_ids
    has_normal     = NORMAL_CLASS_ID  in class_ids
    has_violent    = VIOLENT_ID       in class_ids

    # ── Blood is present ──────────────────────────────────────────────────
    if has_blood:
        if has_mutilation:
            return "skip"                    # extreme gore → calibration issue
        if has_weapon:
            return "positive_contaminated"   # blood + gun/knife (noisy context)
        return "positive_clean"              # pure gore signal → primary positive

    # ── No blood ──────────────────────────────────────────────────────────
    if has_mutilation:
        return "skip"                        # body parts without blood label

    if has_normal and not has_violent:
        return "negative_clean"

    if has_violent and not has_normal:
        return "negative_violent"            # fighting without blood → hard negative

    return "skip"


def scan_blood_violence_dataset(dataset_dir: str) -> dict:
    """
    Scan all splits of Blood_Violence dataset and report actual distribution.

    MUST run before training to know the real class balance.
    Do NOT assume counts — Roboflow augmentation changes them.

    Args:
        dataset_dir: Root directory of Blood_Violence dataset
                     (contains train/, valid/, test/ subdirs)
    Returns:
        dict with keys: positive_clean, positive_contaminated,
                        negative_clean, negative_violent, skip, total
    """
    results = Counter()
    total = 0
    for split in ("train", "valid", "test"):
        label_files = glob.glob(f"{dataset_dir}/{split}/labels/*.txt")
        for lf in label_files:
            cat = categorize_image(lf)
            results[cat] += 1
            total += 1

    results["total"] = total

    print("\n" + "=" * 45)
    print("  Blood_Violence.v1 Dataset Distribution")
    print("=" * 45)
    for k, v in results.items():
        if k == "total":
            continue
        pct = 100 * v / total if total > 0 else 0.0
        print(f"  {k:30s}: {v:5d}  ({pct:.1f}%)")
    print(f"  {'total':30s}: {total:5d}")
    print("=" * 45 + "\n")

    return dict(results)


# ─────────────────────────────────────────────────────────────────────────────
# UCF-101 Frame Sampling
# ─────────────────────────────────────────────────────────────────────────────

def sample_frames_from_videos(
    video_dir: str,
    n: int,
    exclude_classes: list | None = None,
    include_classes: list | None = None,
    seed: int = 42,
) -> list:
    """
    Sample .jpg frames from a directory structure (UCF-101 style).

    UCF-101 has class-named subdirectories, e.g.:
      ucf101_frames/SalsaSpin/img_0001.jpg
      ucf101_frames/Basketball/img_0001.jpg

    Args:
        video_dir:       Root directory containing class folders or flat jpgs
        n:               Max number of frames to return
        exclude_classes: Class folder names to EXCLUDE (soft negative use case)
        include_classes: Only include these class folders (red-heavy use case)
        seed:            Random seed for reproducibility
    Returns:
        List of str paths (up to n frames)
    """
    all_paths = sorted(Path(video_dir).rglob("*.jpg"))

    if include_classes:
        all_paths = [
            p for p in all_paths
            if any(cls in p.parts for cls in include_classes)
        ]
    elif exclude_classes:
        all_paths = [
            p for p in all_paths
            if not any(cls in p.parts for cls in exclude_classes)
        ]

    rng = random.Random(seed)
    rng.shuffle(all_paths)
    return [str(p) for p in all_paths[:n]]


# ─────────────────────────────────────────────────────────────────────────────
# Dataset Builder — Respects Roboflow train/valid/test splits
# ─────────────────────────────────────────────────────────────────────────────

# UCF-101 classes with dominant red tones → tricky false positives for gore
_RED_HEAVY_CLASSES = [
    "SalsaSpin", "Diving", "IceDancing", "BodyWeightSquats",
]


def build_gore_splits(
    blood_violence_dir: str,
    hod_blood_dir: str,
    hod_gun_dir: str,
    hod_knife_dir: str,
    wound_dir: str,
    ucf101_dir: str,
    knife_sample_n: int = 500,
    ucf101_soft_n: int  = 2000,
    ucf101_red_n: int   = 300,
    seed: int = 42,
) -> tuple[list, list, list]:
    """
    Build train / val / test sample lists for GoreDetector.

    IMPORTANT: Blood_Violence train/valid/test splits are used AS-IS
    from Roboflow (already augmented). No re-splitting is performed.

    Each sample tuple: (image_path: str, label: int, weight: float)
      label  0 = non-gore, 1 = gore/blood
      weight = per-sample importance for WeightedRandomSampler

    Weight table:
      HOD/blood positive:            3.0  (most trusted source)
      Blood_Viol positive_clean:     2.0  (augmented, still reliable)
      Blood_Viol positive_contam:    0.5  (noisy — blood + weapon)
      HOD/gun, HOD/knife, Wound:     2.0  (hard negative)
      Blood_Viol negative_violent:   1.5  (hard negative)
      Blood_Viol negative_clean:     1.0  (normal negative)
      UCF-101 red-heavy:             2.5  (deceptive red scenes)
      UCF-101 soft:                  1.0  (easy soft negative)
    """
    random.seed(seed)

    train_s, val_s, test_s = [], [], []

    # ── Blood_Violence — use Roboflow pre-existing splits ─────────────────
    split_map = [
        ("train", train_s),
        ("valid", val_s),
        ("test",  test_s),
    ]
    for split_name, target in split_map:
        img_dir = f"{blood_violence_dir}/{split_name}/images"
        for img_path in sorted(glob.glob(f"{img_dir}/*.jpg")):
            lbl_path = img_path.replace("/images/", "/labels/").replace(".jpg", ".txt")
            cat = categorize_image(lbl_path)

            if cat == "positive_clean":
                target.append((img_path, 1, 2.0))
            elif cat == "positive_contaminated":
                target.append((img_path, 1, 0.5))
            elif cat == "negative_clean":
                target.append((img_path, 0, 1.0))
            elif cat == "negative_violent":
                target.append((img_path, 0, 1.5))
            # "skip" → excluded entirely

    # ── HOD/blood — primary positive (most trusted) ───────────────────────
    for case_type in ("normal_cases", "hard_cases"):
        jpg_dir = Path(hod_blood_dir) / case_type / "jpg"
        if jpg_dir.exists():
            for p in sorted(jpg_dir.glob("*.jpg")):
                train_s.append((str(p), 1, 3.0))

    # ── HOD/gun — hard negative (gun ≠ gore) ─────────────────────────────
    for case_type in ("normal_cases", "hard_cases"):
        jpg_dir = Path(hod_gun_dir) / case_type / "jpg"
        if jpg_dir.exists():
            for p in sorted(jpg_dir.glob("*.jpg")):
                train_s.append((str(p), 0, 2.0))

    # ── HOD/knife — hard negative (sample to avoid overpopulation) ────────
    knife_paths = []
    for case_type in ("normal_cases", "hard_cases"):
        jpg_dir = Path(hod_knife_dir) / case_type / "jpg"
        if jpg_dir.exists():
            knife_paths.extend(sorted(jpg_dir.glob("*.jpg")))
    sampled_knife = random.sample(
        knife_paths, min(knife_sample_n, len(knife_paths))
    )
    for p in sampled_knife:
        train_s.append((str(p), 0, 2.0))

    # ── Wound dataset — hard negative (medical wounds ≠ gore) ────────────
    if wound_dir:
        surgical = glob.glob(f"{wound_dir}/Surgical Wounds/*.jpg")
        for p in sorted(surgical):
            train_s.append((p, 0, 2.0))

        diabetic = glob.glob(f"{wound_dir}/Diabetic Wounds/*.jpg")
        sampled_diab = random.sample(diabetic, min(300, len(diabetic)))
        for p in sampled_diab:
            train_s.append((p, 0, 2.0))

    # ── UCF-101 — soft negative (exclude red-heavy classes) ───────────────
    soft_neg = sample_frames_from_videos(
        ucf101_dir,
        n=ucf101_soft_n,
        exclude_classes=_RED_HEAVY_CLASSES,
        seed=seed,
    )
    for p in soft_neg:
        train_s.append((p, 0, 1.0))

    # ── UCF-101 — red-heavy hard negative ─────────────────────────────────
    red_neg = sample_frames_from_videos(
        ucf101_dir,
        n=ucf101_red_n,
        include_classes=_RED_HEAVY_CLASSES,
        seed=seed,
    )
    for p in red_neg:
        train_s.append((p, 0, 2.5))

    # Summary
    for name, split in [("train", train_s), ("val", val_s), ("test", test_s)]:
        pos = sum(1 for _, l, _ in split if l == 1)
        neg = sum(1 for _, l, _ in split if l == 0)
        logging.info(f"  {name:5s}: total={len(split):,}  pos={pos:,}  neg={neg:,}")

    return train_s, val_s, test_s


# ─────────────────────────────────────────────────────────────────────────────
# Gate 1 Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_gore(
    model: GoreDetector,
    test_dataset: GoreDataset,
    device: torch.device,
) -> tuple[float, float]:
    """
    Evaluate GoreDetector on test set.

    Gate 1 Pass Criteria:
      AUC    >= 0.88
      Recall >= 0.80

    Returns:
        (auc, recall_at_threshold_0.5)
    """
    loader = DataLoader(
        test_dataset, batch_size=64,
        shuffle=False, num_workers=2,
    )
    model.eval()

    all_probs, all_labels = [], []
    with torch.no_grad():
        for images, labels, _ in loader:
            probs = model.predict_proba(images.to(device)).cpu().squeeze(1)
            all_probs.extend(probs.numpy())
            all_labels.extend(labels.detach().cpu().squeeze(1).numpy())

    all_probs  = np.array(all_probs)
    all_labels = np.array(all_labels)

    auc    = roc_auc_score(all_labels, all_probs)
    preds  = (all_probs >= 0.5).astype(int)
    recall = recall_score(all_labels, preds, zero_division=0)

    print("\n" + "=" * 45)
    print("  GATE 1 — GoreDetector Test Evaluation")
    print("=" * 45)
    print(f"  Test AUC:    {auc:.4f}   (threshold >= 0.88)")
    print(f"  Test Recall: {recall:.4f}  (threshold >= 0.80)")

    auc_pass    = auc    >= 0.88
    recall_pass = recall >= 0.80

    if auc_pass and recall_pass:
        print("  ✅ GATE 1 PASS — GoreDetector is ready as V_pool teacher")
    elif not auc_pass:
        print("  ❌ GATE 1 FAIL — AUC below threshold")
        print("  → Option A: --unfreeze_from_layer 3 --epochs 30")
        print("  → Option B: --lr_backbone 5e-5")
        print("  → Option C: Check scan output — positive_clean too low?")
    else:
        print("  ❌ GATE 1 FAIL — Recall too low (missing too much gore)")
        print("  → Option A: Lower inference threshold to 0.4 in build_features")
        print("  → Option B: Add more HOD/blood hard_cases to training set")
    print("=" * 45)

    return auc, recall


# ─────────────────────────────────────────────────────────────────────────────
# Optimizer — Differential LR
# ─────────────────────────────────────────────────────────────────────────────

def get_optimizer(
    model: GoreDetector,
    lr_backbone: float = 1e-4,
    lr_head:     float = 1e-3,
) -> torch.optim.Optimizer:
    """
    Differential learning rate:
      backbone (layer4): low lr — preserve ImageNet features
      head:              high lr — new layer, needs fast learning
    """
    backbone_params = [p for p in model.backbone.parameters() if p.requires_grad]
    head_params     = list(model.head.parameters())

    return torch.optim.AdamW([
        {"params": backbone_params, "lr": lr_backbone},
        {"params": head_params,     "lr": lr_head},
    ], weight_decay=1e-4)


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def train_gore_detector(args) -> tuple[float, float, float]:
    """
    Full training routine for GoreDetector V6.1.

    Returns:
        (best_val_auc, test_auc, test_recall)
    """
    device = torch.device(args.device if torch.cuda.is_available() else 'cpu')
    logging.info(f"Using device: {device}")

    # 1. Scan dataset FIRST (mandatory — don't assume counts)
    stats = scan_blood_violence_dataset(args.blood_violence_dir)
    logging.info(f"Scan complete. Positives (clean+contam): "
                 f"{stats.get('positive_clean',0) + stats.get('positive_contaminated',0):,}")

    # 2. Build splits
    logging.info("Building dataset splits...")
    train_samples, val_samples, test_samples = build_gore_splits(
        blood_violence_dir=args.blood_violence_dir,
        hod_blood_dir=args.hod_blood_dir,
        hod_gun_dir=args.hod_gun_dir,
        hod_knife_dir=args.hod_knife_dir,
        wound_dir=args.wound_dir,
        ucf101_dir=args.ucf101_dir,
    )

    if not train_samples:
        logging.error("No training samples found! Check dataset paths.")
        return 0.0, 0.0, 0.0

    # 3. Datasets and DataLoaders
    train_ds = GoreDataset(train_samples, get_default_transform(is_train=True))
    val_ds   = GoreDataset(val_samples,   get_default_transform(is_train=False))
    test_ds  = GoreDataset(test_samples,  get_default_transform(is_train=False))

    use_sampler = args.reweight_mode in {"sampler", "both"}
    use_pos_weight = args.reweight_mode in {"bce", "both"}

    sampler = train_ds.get_weighted_sampler() if use_sampler else None
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size,
        sampler=sampler,
        shuffle=(sampler is None),
        num_workers=4, pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size,
        shuffle=False, num_workers=4, pin_memory=True,
    )

    # 4. Model + Optimizer
    model     = GoreDetector(args.unfreeze_from_layer).to(device)
    optimizer = get_optimizer(model, args.lr_backbone, args.lr_head)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs,
    )

    # pos_weight: computed from actual ratio (not hardcoded)
    pos_train = sum(1 for _, l, _ in train_samples if l == 1)
    neg_train = sum(1 for _, l, _ in train_samples if l == 0)
    actual_pos_weight = neg_train / max(pos_train, 1)
    logging.info(f"pos_weight (auto): {actual_pos_weight:.2f}  "
                 f"(pos={pos_train:,}, neg={neg_train:,})")

    if use_pos_weight:
        criterion = nn.BCEWithLogitsLoss(
            pos_weight=torch.tensor([actual_pos_weight]).to(device),
        )
    else:
        criterion = nn.BCEWithLogitsLoss()

    logging.info(
        "reweight_mode=%s | sampler=%s | bce_pos_weight=%s",
        args.reweight_mode,
        "ON" if use_sampler else "OFF",
        "ON" if use_pos_weight else "OFF",
    )

    # 5. Training loop
    best_val_auc = 0.0
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        # ── Train ──────────────────────────────────────────────────────────
        model.train()
        train_loss = 0.0
        train_probs, train_labels = [], []
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Train]")
        for images, labels, _ in pbar:
            images = images.to(device)
            labels = labels.to(device)

            optimizer.zero_grad()
            logits = model(images)
            loss   = criterion(logits, labels)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            train_loss += loss.item()
            train_probs.extend(torch.sigmoid(logits).detach().cpu().squeeze(1).numpy())
            train_labels.extend(labels.detach().cpu().squeeze(1).numpy())
            pbar.set_postfix(loss=f"{loss.item():.4f}")

        train_loss /= len(train_loader)
        scheduler.step()

        train_probs = np.array(train_probs)
        train_labels = np.array(train_labels)
        train_preds = (train_probs >= 0.5).astype(int)
        train_acc = accuracy_score(train_labels, train_preds) if len(train_labels) else 0.0
        train_prec = precision_score(train_labels, train_preds, zero_division=0) if len(train_labels) else 0.0
        train_rec = recall_score(train_labels, train_preds, zero_division=0) if len(train_labels) else 0.0
        train_f1 = f1_score(train_labels, train_preds, zero_division=0) if len(train_labels) else 0.0
        try:
            train_auc = roc_auc_score(train_labels, train_probs)
        except ValueError:
            train_auc = 0.0
        try:
            train_pr_auc = average_precision_score(train_labels, train_probs)
        except ValueError:
            train_pr_auc = 0.0

        # ── Validation ─────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        all_probs, all_labels_val = [], []
        with torch.no_grad():
            for images, labels, _ in tqdm(
                val_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Val]",
            ):
                images = images.to(device)
                labels = labels.to(device)
                logits = model(images)
                loss = criterion(logits, labels)
                val_loss += loss.item()
                probs = torch.sigmoid(logits).cpu().squeeze(1)
                all_probs.extend(probs.numpy())
                all_labels_val.extend(labels.detach().cpu().squeeze(1).numpy())

        val_loss /= len(val_loader)
        all_probs      = np.array(all_probs)
        all_labels_val = np.array(all_labels_val)

        try:
            val_auc = roc_auc_score(all_labels_val, all_probs)
        except ValueError:
            val_auc = 0.0

        preds      = (all_probs >= 0.5).astype(int)
        val_acc    = accuracy_score(all_labels_val, preds)
        val_prec   = precision_score(all_labels_val, preds, zero_division=0)
        val_f1     = f1_score(all_labels_val, preds, zero_division=0)
        val_recall = recall_score(all_labels_val, preds, zero_division=0)
        try:
            val_pr_auc = average_precision_score(all_labels_val, all_probs)
        except ValueError:
            val_pr_auc = 0.0

        logging.info(
            f"Epoch {epoch+1:3d} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} Prec: {train_prec:.4f} Rec: {train_rec:.4f} "
            f"F1: {train_f1:.4f} AUC: {train_auc:.4f} PR-AUC: {train_pr_auc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f} Prec: {val_prec:.4f} Rec: {val_recall:.4f} "
            f"F1: {val_f1:.4f} AUC: {val_auc:.4f} PR-AUC: {val_pr_auc:.4f}"
        )

        append_epoch_metrics(
            out_dir / "metrics" / "gore_metrics.csv",
            {
                "epoch": epoch + 1,
                "lr_backbone": optimizer.param_groups[0]["lr"],
                "lr_head": optimizer.param_groups[1]["lr"],
                "train_loss": train_loss,
                "train_acc": train_acc,
                "train_prec": train_prec,
                "train_rec": train_rec,
                "train_f1": train_f1,
                "train_auc": train_auc,
                "train_pr_auc": train_pr_auc,
                "val_loss": val_loss,
                "val_acc": val_acc,
                "val_prec": val_prec,
                "val_rec": val_recall,
                "val_f1": val_f1,
                "val_auc": val_auc,
                "val_pr_auc": val_pr_auc,
            },
        )

        if val_auc > best_val_auc:
            best_val_auc = val_auc
            ckpt_path = out_dir / "gore_detector_v6_best.pth"
            torch.save(model.state_dict(), ckpt_path)
            logging.info(f"  ✅ Saved best model (AUC={val_auc:.4f}) → {ckpt_path}")

    # 6. Gate 1 evaluation on held-out test set
    logging.info("\nLoading best checkpoint for Gate 1 evaluation...")
    model.load_state_dict(
        torch.load(out_dir / "gore_detector_v6_best.pth", map_location=device)
    )
    test_auc, test_recall = evaluate_gore(model, test_ds, device)

    return best_val_auc, test_auc, test_recall


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Train GoreDetector V6.1 with ImageNet ResNet18"
    )

    # ── Data directories ──────────────────────────────────────────────────
    parser.add_argument(
        '--blood_violence_dir', required=True,
        help='Root of Blood_Violence.v1 dataset (contains train/valid/test)'
    )
    parser.add_argument(
        '--hod_blood_dir', required=True,
        help='HOD blood directory (contains normal_cases/jpg and hard_cases/jpg)'
    )
    parser.add_argument(
        '--hod_gun_dir', required=True,
        help='HOD gun directory (hard negatives)'
    )
    parser.add_argument(
        '--hod_knife_dir', required=True,
        help='HOD knife directory (hard negatives, sampled)'
    )
    parser.add_argument(
        '--wound_dir', default='',
        help='Wound_dataset root (Surgical/Diabetic Wounds subdirs, optional)'
    )
    parser.add_argument(
        '--ucf101_dir', required=True,
        help='UCF-101 pre-extracted frames directory (.jpg)'
    )

    # ── Training ──────────────────────────────────────────────────────────
    parser.add_argument('--output_dir',          default='/kaggle/working/trong_so')
    parser.add_argument('--unfreeze_from_layer', type=int,   default=4)
    parser.add_argument('--batch_size',          type=int,   default=64)
    parser.add_argument('--epochs',              type=int,   default=25)
    parser.add_argument('--lr_backbone',         type=float, default=1e-4)
    parser.add_argument('--lr_head',             type=float, default=1e-3)
    parser.add_argument(
        '--reweight_mode',
        choices=['sampler', 'bce', 'both', 'none'],
        default='sampler',
        help='Class reweight strategy. Default sampler to reduce over-confidence from double reweight.',
    )
    parser.add_argument('--device',              default='cuda')

    args = parser.parse_args()

    best_val_auc, test_auc, test_recall = train_gore_detector(args)
    logging.info(
        f"\nFINAL RESULTS: "
        f"best_val_AUC={best_val_auc:.4f} | "
        f"test_AUC={test_auc:.4f} | "
        f"test_Recall={test_recall:.4f}"
    )


if __name__ == '__main__':
    main()
