"""
train_v7_videomae_lora.py
=========================
Train V7 video-native model:
  - Backbone: VideoMAE (raw video)
  - Adaptation: LoRA on q/v of last N transformer blocks
  - Fusion: aux summary from existing expert features (.npy)
  - Outputs: violence/self-harm/nsfw logits

Notes:
  - Violence is supervised from manifest labels.
  - Self-harm / NSFW use pseudo teachers from aux feature sequence (event-based noisy-or).
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import math
from dataclasses import asdict

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    fbeta_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader, WeightedRandomSampler
from tqdm import tqdm

from scripts._common import append_epoch_metrics
from src.data.video_moderation_v7_dataset import VideoModerationV7Dataset, _resolve_path
from src.models.v7_videomae_lora import V7Config, VideoModerationV7

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def find_threshold_by_fbeta(probs, labels, beta=2.0, n_thresh=100):
    thresholds = np.linspace(0.05, 0.95, n_thresh)
    best_t, best_fb = 0.5, 0.0
    for t in thresholds:
        preds = (probs >= t).astype(int)
        fb = fbeta_score(labels, preds, beta=beta, zero_division=0)
        if fb > best_fb:
            best_fb, best_t = fb, t
    return best_t, best_fb


def count_params(model: torch.nn.Module) -> tuple[int, int]:
    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    return total, trainable


def build_model(args) -> VideoModerationV7:
    cfg = V7Config(
        model_name=args.model_name,
        d_aux=7,
        d_fuse=args.d_fuse,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        lora_last_n_layers=args.lora_last_n_layers,
        dropout=args.dropout,
    )
    model = VideoModerationV7(cfg)
    return model


def train(args):
    device = torch.device(args.device if torch.cuda.is_available() else "cpu")
    logging.info("Using device: %s", device)

    train_ds = VideoModerationV7Dataset(
        manifest_path=Path(args.train_manifest),
        features_dir=Path(args.features_dir) if args.features_dir else None,
        num_frames=args.num_frames,
        image_size=args.image_size,
        is_train=True,
        sn_topk_ratio=args.sn_topk_ratio,
        sn_topk_min=args.sn_topk_min,
        quality_aug_prob=args.quality_aug_prob,
        quality_blur_prob=args.quality_blur_prob,
        quality_noise_prob=args.quality_noise_prob,
        quality_jpeg_prob=args.quality_jpeg_prob,
        quality_noise_std_min=args.quality_noise_std_min,
        quality_noise_std_max=args.quality_noise_std_max,
        quality_jpeg_qmin=args.quality_jpeg_qmin,
        quality_jpeg_qmax=args.quality_jpeg_qmax,
    )
    val_ds = VideoModerationV7Dataset(
        manifest_path=Path(args.val_manifest),
        features_dir=Path(args.features_dir) if args.features_dir else None,
        num_frames=args.num_frames,
        image_size=args.image_size,
        is_train=False,
        sn_topk_ratio=args.sn_topk_ratio,
        sn_topk_min=args.sn_topk_min,
    )

    def _estimate_teacher_coverage(ds: VideoModerationV7Dataset, max_rows: int = 1200) -> float:
        if ds.features_dir is None or "feature_path" not in ds.df.columns:
            return 0.0
        col = ds.df["feature_path"].dropna().astype(str)
        if len(col) == 0:
            return 0.0
        if len(col) > max_rows:
            col = col.sample(n=max_rows, random_state=42)
        hit = 0
        for raw_fp in col:
            fp = _resolve_path(raw_fp, ds.features_dir)
            if not fp.exists():
                fp = _resolve_path(raw_fp, ds.base_dir)
            if fp.exists():
                hit += 1
        return float(hit / max(len(col), 1))

    teacher_coverage = _estimate_teacher_coverage(train_ds)
    logging.info("Estimated teacher feature coverage on train manifest: %.1f%%", teacher_coverage * 100.0)

    use_pseudo_teachers = bool(args.features_dir) and ("feature_path" in train_ds.df.columns)
    use_pseudo_teachers = use_pseudo_teachers and (teacher_coverage >= float(args.min_teacher_coverage))
    effective_lambda_s = float(args.lambda_s)
    effective_lambda_n = float(args.lambda_n)
    if not use_pseudo_teachers and (effective_lambda_s > 0.0 or effective_lambda_n > 0.0):
        logging.warning(
            "features_dir/feature_path unavailable or low coverage -> forcing lambda_s=lambda_n=0. "
            "This prevents S/N collapsing toward zero from dummy teachers."
        )
        effective_lambda_s = 0.0
        effective_lambda_n = 0.0

    setattr(args, "effective_lambda_s", effective_lambda_s)
    setattr(args, "effective_lambda_n", effective_lambda_n)

    # Violence-only sampler (same spirit as V6).
    violence_labels = train_ds.df["violence"].astype(float).values
    pos_count = int((violence_labels > 0.5).sum())
    neg_count = int(len(violence_labels) - pos_count)
    imbalance = float(neg_count / max(pos_count, 1))

    if args.sampler_pos_weight > 0:
        effective_sampler_pos_weight = float(args.sampler_pos_weight)
    else:
        # sqrt-ratio to avoid extreme recall bias from very large imbalance.
        effective_sampler_pos_weight = float(np.clip(math.sqrt(imbalance), 1.5, 6.0))

    if args.violence_pos_weight > 0:
        effective_violence_pos_weight = float(args.violence_pos_weight)
    else:
        # Cap ratio to stabilize calibration and reduce over-confident violence logits.
        effective_violence_pos_weight = float(np.clip(imbalance, 2.0, 12.0))

    setattr(args, "effective_sampler_pos_weight", effective_sampler_pos_weight)
    setattr(args, "effective_violence_pos_weight", effective_violence_pos_weight)
    logging.info(
        "Train imbalance: pos=%d neg=%d ratio=%.2f | sampler_pos_weight=%.2f | violence_pos_weight=%.2f | "
        "lambda_s=%.3f lambda_n=%.3f",
        pos_count,
        neg_count,
        imbalance,
        effective_sampler_pos_weight,
        effective_violence_pos_weight,
        effective_lambda_s,
        effective_lambda_n,
    )

    weights = np.where(violence_labels > 0.5, effective_sampler_pos_weight, 1.0)
    sampler = WeightedRandomSampler(
        weights=torch.tensor(weights, dtype=torch.double),
        num_samples=len(weights),
        replacement=True,
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        sampler=sampler,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
    )

    model = build_model(args).to(device)
    total_params, trainable_params = count_params(model)
    logging.info("Model params: total=%d, trainable=%d (%.2f%%)",
                 total_params, trainable_params, 100.0 * trainable_params / max(total_params, 1))
    logging.info("LoRA patched modules: %d", len(model.lora_patched_modules))

    # Optimizer with separate LR for LoRA vs heads.
    lora_params, head_params = [], []
    for name, p in model.named_parameters():
        if not p.requires_grad:
            continue
        if "lora_A" in name or "lora_B" in name:
            lora_params.append(p)
        else:
            head_params.append(p)

    optimizer = torch.optim.AdamW(
        [
            {"params": lora_params, "lr": args.lr_lora},
            {"params": head_params, "lr": args.lr_head},
        ],
        weight_decay=args.weight_decay,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    scaler = torch.cuda.amp.GradScaler(enabled=(device.type == "cuda" and args.amp))
    criterion_v = torch.nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor([effective_violence_pos_weight], device=device)
    )
    criterion_aux = torch.nn.BCEWithLogitsLoss()
    label_smoothing = float(np.clip(args.violence_label_smoothing, 0.0, 0.49))

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    best_v_f2 = -1.0
    patience = 0

    for epoch in range(args.epochs):
        model.train()
        train_loss = 0.0
        n_batches = 0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Train]")
        optimizer.zero_grad(set_to_none=True)
        for step, batch in enumerate(pbar, start=1):
            pixel_values = batch["pixel_values"].to(device)    # [B,T,3,H,W]
            aux_summary = batch["aux_summary"].to(device)      # [B,7]
            y_v = batch["violence"].to(device)                 # [B]
            y_s = batch["s_teacher"].to(device)                # [B]
            y_n = batch["n_teacher"].to(device)                # [B]

            with torch.cuda.amp.autocast(enabled=(device.type == "cuda" and args.amp)):
                v_logit, s_logit, n_logit = model(pixel_values, aux_summary)
                if label_smoothing > 0.0:
                    y_v_target = y_v * (1.0 - label_smoothing) + 0.5 * label_smoothing
                else:
                    y_v_target = y_v
                loss_v = criterion_v(v_logit, y_v_target)

                if effective_lambda_s > 0.0:
                    loss_s = criterion_aux(s_logit, y_s)
                else:
                    loss_s = torch.zeros((), device=device)
                if effective_lambda_n > 0.0:
                    loss_n = criterion_aux(n_logit, y_n)
                else:
                    loss_n = torch.zeros((), device=device)

                loss = loss_v + effective_lambda_s * loss_s + effective_lambda_n * loss_n
                loss = loss / max(args.grad_accum_steps, 1)

            scaler.scale(loss).backward()
            if step % args.grad_accum_steps == 0:
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                scaler.step(optimizer)
                scaler.update()
                optimizer.zero_grad(set_to_none=True)

            train_loss += float(loss.item()) * max(args.grad_accum_steps, 1)
            n_batches += 1
            pbar.set_postfix(
                loss=f"{(train_loss / max(n_batches,1)):.4f}",
                lv=f"{float(loss_v.item()):.4f}",
                ls=f"{float(loss_s.item()):.4f}",
                ln=f"{float(loss_n.item()):.4f}",
            )

        # Flush leftover gradients when number of batches is not divisible by grad_accum_steps.
        if n_batches > 0 and (n_batches % args.grad_accum_steps) != 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

        scheduler.step()
        train_loss /= max(n_batches, 1)

        # Validation
        model.eval()
        all_v_probs, all_v_labels = [], []
        all_s_scores, all_n_scores = [], []
        val_loss = 0.0
        val_batches = 0
        with torch.no_grad():
            for batch in tqdm(val_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Val]"):
                pixel_values = batch["pixel_values"].to(device)
                aux_summary = batch["aux_summary"].to(device)
                y_v = batch["violence"].to(device)
                y_s = batch["s_teacher"].to(device)
                y_n = batch["n_teacher"].to(device)

                v_logit, s_logit, n_logit = model(pixel_values, aux_summary)
                loss_v = criterion_v(v_logit, y_v)
                if effective_lambda_s > 0.0:
                    loss_s = criterion_aux(s_logit, y_s)
                else:
                    loss_s = torch.zeros((), device=device)
                if effective_lambda_n > 0.0:
                    loss_n = criterion_aux(n_logit, y_n)
                else:
                    loss_n = torch.zeros((), device=device)
                loss = loss_v + effective_lambda_s * loss_s + effective_lambda_n * loss_n
                val_loss += float(loss.item())
                val_batches += 1

                all_v_probs.extend(torch.sigmoid(v_logit).cpu().numpy())
                all_v_labels.extend(y_v.cpu().numpy())
                all_s_scores.extend(torch.sigmoid(s_logit).cpu().numpy())
                all_n_scores.extend(torch.sigmoid(n_logit).cpu().numpy())

        val_loss /= max(val_batches, 1)
        all_v_probs = np.array(all_v_probs, dtype=np.float32)
        all_v_labels = np.array(all_v_labels, dtype=np.float32)
        all_s_scores = np.array(all_s_scores, dtype=np.float32)
        all_n_scores = np.array(all_n_scores, dtype=np.float32)

        thresh_v, v_f2 = find_threshold_by_fbeta(all_v_probs, all_v_labels, beta=2.0)
        v_preds = (all_v_probs >= thresh_v).astype(int)
        v_acc = accuracy_score(all_v_labels, v_preds)
        v_prec = precision_score(all_v_labels, v_preds, zero_division=0)
        v_rec = recall_score(all_v_labels, v_preds, zero_division=0)
        v_f1 = f1_score(all_v_labels, v_preds, zero_division=0)
        try:
            v_auc = roc_auc_score(all_v_labels, all_v_probs)
        except ValueError:
            v_auc = 0.0
        try:
            v_pr_auc = average_precision_score(all_v_labels, all_v_probs)
        except ValueError:
            v_pr_auc = 0.0

        logging.info(
            "Epoch %d | TrainLoss=%.4f ValLoss=%.4f | V: Acc=%.4f Prec=%.4f Rec=%.4f F1=%.4f F2=%.4f AUC=%.4f PR-AUC=%.4f thresh=%.3f | S_mean=%.4f N_mean=%.4f",
            epoch + 1, train_loss, val_loss,
            v_acc, v_prec, v_rec, v_f1, v_f2, v_auc, v_pr_auc, thresh_v,
            float(all_s_scores.mean()) if len(all_s_scores) else 0.0,
            float(all_n_scores.mean()) if len(all_n_scores) else 0.0,
        )

        append_epoch_metrics(
            out_dir / "metrics" / "v7_videomae_lora_metrics.csv",
            {
                "epoch": epoch + 1,
                "lr_lora": optimizer.param_groups[0]["lr"],
                "lr_head": optimizer.param_groups[1]["lr"],
                "train_loss": train_loss,
                "val_loss": val_loss,
                "val_v_acc": v_acc,
                "val_v_prec": v_prec,
                "val_v_rec": v_rec,
                "val_v_f1": v_f1,
                "val_v_f2": v_f2,
                "val_v_auc": v_auc,
                "val_v_pr_auc": v_pr_auc,
                "val_thresh_v": thresh_v,
                "val_s_mean": float(all_s_scores.mean()) if len(all_s_scores) else 0.0,
                "val_n_mean": float(all_n_scores.mean()) if len(all_n_scores) else 0.0,
            },
        )

        if v_f2 > best_v_f2:
            best_v_f2 = v_f2
            patience = 0
            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "v_f2": float(v_f2),
                    "v_auc": float(v_auc),
                    "thresh_v": float(thresh_v),
                    "args": vars(args),
                    "model_cfg": asdict(model.cfg),
                },
                out_dir / "v7_videomae_lora_best.pth",
            )
            logging.info("  --> Saved best checkpoint (V_F2=%.4f)", v_f2)
        else:
            patience += 1
            if patience >= args.patience:
                logging.info("Early stopping at epoch %d", epoch + 1)
                break

    logging.info("Training done. best_v_f2=%.4f", best_v_f2)


def parse_args():
    parser = argparse.ArgumentParser(description="Train V7 VideoMAE + LoRA")
    parser.add_argument("--train_manifest", required=True)
    parser.add_argument("--val_manifest", required=True)
    parser.add_argument("--features_dir", default="", help="Directory containing .npy features for aux summary/pseudo teachers")
    parser.add_argument("--output_dir", default="/kaggle/working/trong_so_v7")

    parser.add_argument("--model_name", default="MCG-NJU/videomae-small-finetuned-ssv2")
    parser.add_argument("--num_frames", type=int, default=16)
    parser.add_argument("--image_size", type=int, default=224)

    parser.add_argument("--lora_r", type=int, default=8)
    parser.add_argument("--lora_alpha", type=float, default=16.0)
    parser.add_argument("--lora_dropout", type=float, default=0.05)
    parser.add_argument("--lora_last_n_layers", type=int, default=4)
    parser.add_argument("--d_fuse", type=int, default=384)
    parser.add_argument("--dropout", type=float, default=0.2)

    parser.add_argument("--sn_topk_ratio", type=float, default=0.2)
    parser.add_argument("--sn_topk_min", type=int, default=3)
    parser.add_argument("--quality_aug_prob", type=float, default=0.35)
    parser.add_argument("--quality_blur_prob", type=float, default=0.35)
    parser.add_argument("--quality_noise_prob", type=float, default=0.35)
    parser.add_argument("--quality_jpeg_prob", type=float, default=0.35)
    parser.add_argument("--quality_noise_std_min", type=float, default=0.01)
    parser.add_argument("--quality_noise_std_max", type=float, default=0.06)
    parser.add_argument("--quality_jpeg_qmin", type=int, default=25)
    parser.add_argument("--quality_jpeg_qmax", type=int, default=55)

    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--grad_accum_steps", type=int, default=8)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--patience", type=int, default=6)
    parser.add_argument("--num_workers", type=int, default=2)
    parser.add_argument("--lr_lora", type=float, default=3e-4)
    parser.add_argument("--lr_head", type=float, default=1e-3)
    parser.add_argument("--weight_decay", type=float, default=1e-4)
    parser.add_argument(
        "--violence_pos_weight",
        type=float,
        default=-1.0,
        help="<=0 means auto from class imbalance (clamped).",
    )
    parser.add_argument(
        "--sampler_pos_weight",
        type=float,
        default=-1.0,
        help="<=0 means auto from sqrt(class imbalance).",
    )
    parser.add_argument(
        "--violence_label_smoothing",
        type=float,
        default=0.02,
        help="Binary label smoothing for violence target to reduce over-confidence.",
    )
    parser.add_argument("--lambda_s", type=float, default=0.3)
    parser.add_argument("--lambda_n", type=float, default=0.3)
    parser.add_argument("--min_teacher_coverage", type=float, default=0.8)

    parser.add_argument("--device", default="cuda")
    parser.add_argument("--amp", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(args)
