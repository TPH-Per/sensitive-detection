"""
train_selfharm_v6.py — V6.1
=============================
Huấn luyện SelfHarmDetector — Teacher mới cho S_Gate (thay GoreDetector).

Dataset Design:
  Positive (~1,014 ảnh):
    - Self Harm Detection.v1i.yolov8/train/images (618) — cắt cổ tay, súng kề đầu, bầm tím
    - Suicide Detection.v1i.yolov8/train/images (396) — treo cổ, noose
    ⚠️ KHÔNG re-split! Dùng nguyên split gốc Roboflow.

  Hard Negative (~3,085 ảnh):
    - HOD/gun/ (1,565): "Súng thường ≠ súng kề đầu" — đúng mục tiêu nhất
    - Blood_Violence sample (800): "Máu đánh nhau ≠ tự làm hại"
    - Wound_dataset medical (720 optional): "Vết thương y tế ≠ tự làm hại"

  Soft Negative (~1,000 ảnh):
    - UCF-101 random frames — chỉ để balance class

  Val Set: Self Harm valid/images (58 ảnh gốc)
  Test Set: Self Harm test/images (29 ảnh gốc) — Gate 1 dùng val+test=87 ảnh

Evaluation (Gate 1 S Token):
  AUC ≥ 0.80 trên val (n=87, CI 95% ≈ ±0.08)
  Recall ≥ 0.75
  Nếu FAIL → Option A: unfreeze_last_n_layers=2, lr=5e-5
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import random
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from tqdm import tqdm
import numpy as np
from sklearn.metrics import roc_auc_score, recall_score, accuracy_score, precision_score, f1_score, average_precision_score

from scripts._common import append_epoch_metrics

from src.models.selfharm_detector import (
    SelfHarmDetector, SelfHarmDataset,
    selfharm_train_transform, selfharm_val_transform
)
from src.data.split_utils import get_split_from_id

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


import glob

def sample_from_yolo(yolo_dir: str, split: str, n: int) -> list:
    paths = list(Path(yolo_dir).rglob(f"{split}/images/*.jpg"))
    random.shuffle(paths)
    return [str(p) for p in paths[:n]]

def sample_frames_from_videos(video_dir: str, n: int, split_name: str = None, seed: int = 42) -> list:
    paths = list(Path(video_dir).rglob("*.jpg"))
    if split_name:
        paths = [p for p in paths if get_split_from_id(str(p), train_ratio=0.7, val_ratio=0.15) == split_name]
    paths.sort()  # Deterministic truớc khi shuffle (rglob thu tu phu thuoc OS)
    rng = random.Random(seed)
    rng.shuffle(paths)
    return [str(p) for p in paths[:n]]

def build_selfharm_splits(selfharm_dir, suicide_dir,
                          hod_gun_dir, blood_violence_dir,
                          wound_dir, ucf101_dir):
    train_samples, val_samples, test_samples = [], [], []

    # ── TRAIN POSITIVE ──
    for p in glob.glob(f"{selfharm_dir}/train/images/*.jpg"):
        train_samples.append((p, 1.0))
    for p in glob.glob(f"{suicide_dir}/train/images/*.jpg"):
        train_samples.append((p, 1.0))

    # ── VAL POSITIVE (ảnh gốc) ──
    for p in glob.glob(f"{selfharm_dir}/valid/images/*.jpg"):
        val_samples.append((p, 1.0))

    # ── TEST POSITIVE: combine val+test của Roboflow ──
    # (n=29 quá nhỏ để AUC reliable → combine với val)
    for p in glob.glob(f"{selfharm_dir}/valid/images/*.jpg"):
        test_samples.append((p, 1.0))
    for p in glob.glob(f"{selfharm_dir}/test/images/*.jpg"):
        test_samples.append((p, 1.0))
    # test_samples: 87 positive ảnh gốc

    # ── TRAIN HARD NEGATIVE ──
    for p in glob.glob(f"{hod_gun_dir}/normal_cases/jpg/*.jpg"):
        train_samples.append((p, 0.0))
    for p in glob.glob(f"{hod_gun_dir}/hard_cases/jpg/*.jpg"):
        train_samples.append((p, 0.0))
    for p in sample_from_yolo(blood_violence_dir, "train", n=800):
        train_samples.append((p, 0.0))
    if wound_dir and Path(wound_dir).exists():
        for p in glob.glob(f"{wound_dir}/Surgical Wounds/*.jpg"):
            train_samples.append((p, 0.0))
        diabetic = glob.glob(f"{wound_dir}/Diabetic Wounds/*.jpg")
        for p in random.sample(diabetic, min(300, len(diabetic))):
            train_samples.append((p, 0.0))

    # ── TRAIN SOFT NEGATIVE ──
    for p in sample_frames_from_videos(ucf101_dir, n=1000, split_name="train", seed=42):
        train_samples.append((p, 0.0))

    # ── VAL/TEST NEGATIVE ──
    val_neg  = sample_frames_from_videos(ucf101_dir, n=120, split_name="val", seed=43)
    test_neg = sample_frames_from_videos(ucf101_dir, n=180, split_name="test", seed=44)
    val_samples  += [(p, 0.0) for p in val_neg]
    test_samples += [(p, 0.0) for p in test_neg]

    return train_samples, val_samples, test_samples


def train_one_epoch(model, loader, optimizer, device, pos_weight_tensor=None):
    model.train()
    if pos_weight_tensor is None:
        criterion = nn.BCEWithLogitsLoss()
    else:
        criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight_tensor.to(device))
    total_loss, n = 0.0, 0
    all_probs, all_labels = [], []

    pbar = tqdm(loader, desc="Train", leave=False)
    for x, y in pbar:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item() * x.size(0)
        n += x.size(0)
        all_probs.extend(torch.sigmoid(logits).detach().cpu().squeeze(1).numpy())
        all_labels.extend(y.detach().cpu().squeeze(1).numpy())
        pbar.set_postfix(loss=f"{loss.item():.4f}")

    all_probs = np.array(all_probs)
    all_labels = np.array(all_labels)
    preds = (all_probs >= 0.5).astype(int)
    return {
        "loss": total_loss / max(n, 1),
        "acc": accuracy_score(all_labels, preds) if len(all_labels) else 0.0,
        "prec": precision_score(all_labels, preds, zero_division=0) if len(all_labels) else 0.0,
        "rec": recall_score(all_labels, preds, zero_division=0) if len(all_labels) else 0.0,
        "f1": f1_score(all_labels, preds, zero_division=0) if len(all_labels) else 0.0,
        "auc": roc_auc_score(all_labels, all_probs) if len(set(all_labels)) > 1 else 0.0,
        "pr_auc": average_precision_score(all_labels, all_probs) if len(set(all_labels)) > 1 else 0.0,
    }


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    criterion = nn.BCEWithLogitsLoss()
    all_probs, all_labels = [], []
    total_loss, n = 0.0, 0
    for x, y in loader:
        x = x.to(device)
        y = y.to(device)
        logits = model(x)
        loss = criterion(logits, y)
        total_loss += loss.item() * x.size(0)
        n += x.size(0)
        probs = torch.sigmoid(logits).squeeze(-1).cpu().numpy()
        all_probs.extend(probs)
        all_labels.extend(y.squeeze(-1).cpu().numpy())
    all_probs  = np.array(all_probs)
    all_labels = np.array(all_labels)

    auc = roc_auc_score(all_labels, all_probs) if len(set(all_labels)) > 1 else 0.0
    preds = (all_probs >= 0.5).astype(int)
    return {
        "loss": total_loss / max(n, 1),
        "acc": accuracy_score(all_labels, preds) if len(all_labels) else 0.0,
        "prec": precision_score(all_labels, preds, zero_division=0) if len(all_labels) else 0.0,
        "rec": recall_score(all_labels, preds, zero_division=0),
        "f1": f1_score(all_labels, preds, zero_division=0) if len(all_labels) else 0.0,
        "auc": auc,
        "pr_auc": average_precision_score(all_labels, all_probs) if len(set(all_labels)) > 1 else 0.0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--selfharm_dir',      required=True, help='Self Harm Detection dataset root')
    parser.add_argument('--suicide_dir',       required=True, help='Suicide Detection dataset root')
    parser.add_argument('--hod_gun_dir',       required=True, help='HOD/gun dir')
    parser.add_argument('--blood_violence_dir',required=True, help='Blood Violence dataset dir')
    parser.add_argument('--ucf101_dir',        required=True, help='UCF-101 dir (frames)')
    parser.add_argument('--wound_dir',         default='',   help='Medical wounds dir (optional)')
    parser.add_argument('--output_dir',        default='/kaggle/working/trong_so')
    parser.add_argument('--unfreeze_from_layer', type=int, default=0, help='0=frozen, 4=layer4 unfreezed')
    parser.add_argument('--batch_size',        type=int,   default=64)
    parser.add_argument('--epochs',            type=int,   default=20)
    parser.add_argument('--lr',                type=float, default=1e-3)
    parser.add_argument(
        '--reweight_mode',
        choices=['sampler', 'bce', 'both', 'none'],
        default='sampler',
        help='Class reweight strategy. Default sampler to reduce over-confidence from double reweight.',
    )
    parser.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu')
    args = parser.parse_args()

    device     = torch.device(args.device)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Seed
    random.seed(42); np.random.seed(42); torch.manual_seed(42)

    # Data collection
    logging.info("Building dataset splits...")
    train_samples, val_samples, test_samples = build_selfharm_splits(
        args.selfharm_dir, args.suicide_dir,
        args.hod_gun_dir, args.blood_violence_dir,
        args.wound_dir, args.ucf101_dir
    )

    train_pos = [p for p, l in train_samples if l == 1.0]
    train_neg = [p for p, l in train_samples if l == 0.0]
    val_pos = [p for p, l in val_samples if l == 1.0]
    val_neg = [p for p, l in val_samples if l == 0.0]
    
    logging.info(f"\nDataset: {len(train_pos)} pos / {len(train_neg)} neg")

    train_ds = SelfHarmDataset(train_pos, train_neg, selfharm_train_transform())
    val_ds  = SelfHarmDataset(val_pos, val_neg, selfharm_val_transform())

    # Reweight strategy
    pos_w = SelfHarmDataset.recommended_pos_weight(len(train_pos), len(train_neg))
    use_sampler = args.reweight_mode in {"sampler", "both"}
    use_pos_weight = args.reweight_mode in {"bce", "both"}
    sampler = None
    if use_sampler:
        weights = [pos_w if lbl == 1.0 else 1.0 for lbl in train_ds.labels]
        sampler = WeightedRandomSampler(weights, len(weights))

    train_loader = DataLoader(train_ds, batch_size=args.batch_size,
                              sampler=sampler, shuffle=(sampler is None), num_workers=2, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch_size,
                              shuffle=False, num_workers=2)

    # Model
    model = SelfHarmDetector(args.unfreeze_from_layer).to(device)

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logging.info(f"Trainable params: {trainable:,}")

    if args.unfreeze_from_layer > 0:
        backbone_params = [p for n, p in model.backbone.named_parameters() if p.requires_grad]
        head_params = list(model.head.parameters())
        optimizer = torch.optim.AdamW([
            {"params": backbone_params, "lr": 5e-5},
            {"params": head_params, "lr": args.lr},
        ], weight_decay=1e-4)
    else:
        optimizer = torch.optim.AdamW(
            filter(lambda p: p.requires_grad, model.parameters()),
            lr=args.lr, weight_decay=1e-4
        )
        
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    pos_weight_tensor = torch.tensor([pos_w]) if use_pos_weight else None
    logging.info(
        "reweight_mode=%s | sampler=%s | bce_pos_weight=%s | pos_weight=%.2f",
        args.reweight_mode,
        "ON" if use_sampler else "OFF",
        "ON" if use_pos_weight else "OFF",
        pos_w,
    )

    # Train
    best_auc, best_recall = 0.0, 0.0
    logging.info("\n" + "="*60)
    logging.info("  TRAINING SELFHARM DETECTOR V6.1")
    logging.info("="*60)

    for epoch in range(1, args.epochs + 1):
        train_metrics = train_one_epoch(model, train_loader, optimizer, device, pos_weight_tensor)
        val_metrics = evaluate(model, val_loader, device)
        scheduler.step()

        logging.info(
            f"Epoch {epoch:2d}/{args.epochs} | "
            f"train_loss={train_metrics['loss']:.4f} train_acc={train_metrics['acc']:.4f} train_prec={train_metrics['prec']:.4f} "
            f"train_rec={train_metrics['rec']:.4f} train_F1={train_metrics['f1']:.4f} train_AUC={train_metrics['auc']:.4f} "
            f"train_PR_AUC={train_metrics['pr_auc']:.4f} | "
            f"val_loss={val_metrics['loss']:.4f} val_acc={val_metrics['acc']:.4f} val_prec={val_metrics['prec']:.4f} "
            f"val_rec={val_metrics['rec']:.4f} val_F1={val_metrics['f1']:.4f} val_AUC={val_metrics['auc']:.4f} "
            f"val_PR_AUC={val_metrics['pr_auc']:.4f}"
        )

        append_epoch_metrics(
            output_dir / "metrics" / "selfharm_metrics.csv",
            {
                "epoch": epoch,
                "lr_backbone": optimizer.param_groups[0]["lr"],
                "lr_head": optimizer.param_groups[-1]["lr"],
                "train_loss": train_metrics["loss"],
                "train_acc": train_metrics["acc"],
                "train_prec": train_metrics["prec"],
                "train_rec": train_metrics["rec"],
                "train_f1": train_metrics["f1"],
                "train_auc": train_metrics["auc"],
                "train_pr_auc": train_metrics["pr_auc"],
                "val_loss": val_metrics["loss"],
                "val_acc": val_metrics["acc"],
                "val_prec": val_metrics["prec"],
                "val_rec": val_metrics["rec"],
                "val_f1": val_metrics["f1"],
                "val_auc": val_metrics["auc"],
                "val_pr_auc": val_metrics["pr_auc"],
            },
        )

        # Gate 1 check
        if val_metrics["auc"] >= 0.80 and val_metrics["rec"] >= 0.75:
            logging.info(f"  ✅ GATE 1 PASS: AUC={val_metrics['auc']:.4f}, Recall={val_metrics['rec']:.4f}")

        if val_metrics["auc"] > best_auc:
            best_auc = val_metrics["auc"]
            best_recall = val_metrics["rec"]
            ckpt_path = output_dir / "selfharm_detector_v6_best.pth"
            torch.save({
                'model_state': model.state_dict(),
                'epoch': epoch,
                'val_auc': val_metrics["auc"],
                'val_recall': val_metrics["rec"],
            }, ckpt_path)
            logging.info(f"  💾 Saved best → {ckpt_path}")

    logging.info("\n" + "="*60)
    logging.info(f"  DONE — Best AUC={best_auc:.4f}, Recall={best_recall:.4f}")

    # Gate 1 Final Decision
    if best_auc < 0.80:
        logging.warning("\n⚠️  GATE 1 FAIL: AUC < 0.80")
        logging.warning("  → Option A: python train_selfharm_v6.py --unfreeze_from_layer 2 --lr 5e-5")
        logging.warning("  → Option B: Thêm Wound/Cut + Bruises dataset (464 ảnh)")
        logging.warning("  → Option C: Ghi limitation AUC ~ 0.75 vào báo cáo")
    else:
        logging.info("  ✅ GATE 1 PASS — SelfHarmDetector sẵn sàng làm Teacher cho S_Gate!")
    logging.info("="*60)


if __name__ == '__main__':
    main()
