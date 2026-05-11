"""
train_e2e_v6.py — V6.0 (Architecture Overhaul)
================================================
Loss Function Mới:
  - Violence: BCEWithLogitsLoss(pos_weight cấu hình)  [có label thật]
  - S/N Gate:  KL Distillation từ GoreDetector/NSFWClassifier teacher [Weak Supervision]
  - Warm-up: epochs 1-4 chỉ train Violence, epoch 5+ bật KL Distillation

Kiến trúc model mới:
  - forward() trả về (v_logit, S_score, N_score, saliency)
  - ffn_s và ffn_n đã bị xóa khỏi model

EarlyStopping: theo Violence F2-score (recall quan trọng hơn precision)
WeightedSampler: chỉ dùng violence weight (S/N label = 0 toàn bộ, weight cấu hình)
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import os
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, WeightedRandomSampler
from sklearn.metrics import (
    f1_score, roc_auc_score, precision_score, recall_score, accuracy_score,
    fbeta_score, average_precision_score
)
from tqdm import tqdm
import numpy as np

from scripts._common import append_epoch_metrics
from src.models.task_gated_model import TaskGatedModelV6
from src.data.manifest_dataset import ManifestFeatureDataset

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


# ─────────────────────────────────────────────────────────────────────────────
# Loss Function
# ─────────────────────────────────────────────────────────────────────────────

def total_loss_v6(
    v_logit,      # [B, 1]  — Violence logit
    v_label,      # [B, 1]  — Ground truth violence
    v_attn,       # [B, T]  — V attention
    s_attn,       # [B, T]  — S attention
    n_attn,       # [B, T]  — N attention
    gore_scores,  # [B, T, 1] — GoreDetector per-frame proba
    nsfw_scores,  # [B, T, 1] — NSFWClassifier per-frame proba
    epoch: int,
    warmup_epochs: int = 5,
    T: float = 2.0,
    lambda_dist: float = 0.5,
    lambda_ent: float = 0.1,
    pos_weight_v: float = 44.0,
) -> tuple[torch.Tensor, dict]:
    """
    Hàm loss tổng hợp cho V6.0:
      L = L_bce_V + lambda_dist_eff * (L_dist_S + L_dist_N) + lambda_ent * L_ent

    Warm-up: epochs 0 đến (warmup-1) chỉ có L_bce_V
    """
    eps = 1e-6

    # === Loss 1: Violence BCE ===
    L_bce_V = F.binary_cross_entropy_with_logits(
        v_logit, v_label,
        pos_weight=torch.tensor([pos_weight_v], device=v_logit.device)
    )

    # === Loss 2: KL Distillation — chỉ bật sau warm-up ===
    lambda_dist_eff = 0.0 if epoch < warmup_epochs else lambda_dist

    # Guard numerics: tránh nan/inf từ feature extraction hoặc underflow.
    s_attn_safe = torch.clamp(torch.nan_to_num(s_attn, nan=0.0, posinf=0.0, neginf=0.0), min=eps)
    n_attn_safe = torch.clamp(torch.nan_to_num(n_attn, nan=0.0, posinf=0.0, neginf=0.0), min=eps)
    s_attn_safe = s_attn_safe / s_attn_safe.sum(dim=1, keepdim=True).clamp_min(eps)
    n_attn_safe = n_attn_safe / n_attn_safe.sum(dim=1, keepdim=True).clamp_min(eps)

    gore_scores_safe = torch.nan_to_num(gore_scores.squeeze(-1), nan=0.5, posinf=1.0, neginf=0.0)
    nsfw_scores_safe = torch.nan_to_num(nsfw_scores.squeeze(-1), nan=0.5, posinf=1.0, neginf=0.0)

    # Warm-up thật sự: KHÔNG tính KL để tránh 0 * nan = nan.
    if epoch < warmup_epochs:
        L_dist_S = torch.zeros((), device=v_logit.device)
        L_dist_N = torch.zeros((), device=v_logit.device)
    else:
        # Teacher signal từ expert detectors — .detach() bắt buộc
        gore_soft = F.softmax(gore_scores_safe / T, dim=1).detach().clamp_min(eps)
        nsfw_soft = F.softmax(nsfw_scores_safe / T, dim=1).detach().clamp_min(eps)
        gore_soft = gore_soft / gore_soft.sum(dim=1, keepdim=True).clamp_min(eps)
        nsfw_soft = nsfw_soft / nsfw_soft.sum(dim=1, keepdim=True).clamp_min(eps)

        # KL(student_attn || teacher_soft)
        L_dist_S = F.kl_div(s_attn_safe.log(), gore_soft, reduction='batchmean')
        L_dist_N = F.kl_div(n_attn_safe.log(), nsfw_soft, reduction='batchmean')

    # === Loss 3: Entropy Regularization ===
    # Ép attention tập trung, không bị phẳng đều
    def H(attn):
        attn = torch.clamp(torch.nan_to_num(attn, nan=0.0, posinf=0.0, neginf=0.0), min=eps)
        attn = attn / attn.sum(dim=-1, keepdim=True).clamp_min(eps)
        return -(attn * torch.log(attn)).sum(dim=-1).mean()

    L_ent = (H(v_attn) + H(s_attn_safe) + H(n_attn_safe)) / 3.0

    # === Tổng hợp ===
    L_total = (L_bce_V
               + lambda_dist_eff * (L_dist_S + L_dist_N)
               + lambda_ent * L_ent)
    L_total = torch.nan_to_num(L_total, nan=0.0, posinf=1e6, neginf=-1e6)

    return L_total, {
        "bce_v":           L_bce_V.item(),
        "dist_s":          L_dist_S.item(),
        "dist_n":          L_dist_N.item(),
        "entropy":         L_ent.item(),
        "lambda_dist_eff": lambda_dist_eff,
        "total":           L_total.item(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Training Health Monitor (Gate 4)
# ─────────────────────────────────────────────────────────────────────────────

def check_training_health(epoch, warmup_epochs, loss_dict, v_probs, s_scores, n_scores):
    """
    Phát hiện các dấu hiệu collapse sau mỗi epoch.
    Ghi log cảnh báo nếu phát hiện vấn đề.
    """
    issues = []

    if not torch.isfinite(v_probs).all():
        issues.append("V_Gate output có NaN/Inf")
    if not torch.isfinite(s_scores).all():
        issues.append("S_score có NaN/Inf")
    if not torch.isfinite(n_scores).all():
        issues.append("N_score có NaN/Inf")
    for key in ("bce_v", "dist_s", "dist_n", "entropy", "total"):
        value = loss_dict.get(key, 0.0)
        if not np.isfinite(value):
            issues.append(f"Loss {key} = {value} (NaN/Inf)")

    # V_Gate collapse: toàn bộ predict về 1 giá trị
    if v_probs.std() < 0.05:
        issues.append(f"V_Gate COLLAPSE: std={v_probs.std():.4f} (need > 0.05)")

    # KL Distillation quá lớn → teacher overwhelm violence signal
    if loss_dict["dist_s"] > loss_dict["bce_v"] * 10:
        issues.append(
            f"L_dist_S quá lớn ({loss_dict['dist_s']:.4f}) > 10x L_bce_V ({loss_dict['bce_v']:.4f})"
        )

    # S/N scores không có variance sau warm-up
    if epoch >= warmup_epochs:
        if s_scores.std() < 0.01:
            issues.append(f"S_Gate KHÔNG HỌC: s_scores std={s_scores.std():.4f}")
        if n_scores.std() < 0.01:
            issues.append(f"N_Gate KHÔNG HỌC: n_scores std={n_scores.std():.4f}")

    # Attention entropy check
    ent = loss_dict.get("entropy", -1)
    if ent > 4.0:
        issues.append(f"Attention PHẲNG HOÀN TOÀN: entropy={ent:.3f} > 4.0")
    elif ent < 0.5 and ent >= 0:
        issues.append(f"Attention OVERFIT 1 FRAME: entropy={ent:.3f} < 0.5")

    if issues:
        logging.warning(f"[Gate 4] Epoch {epoch} — Training issues detected:")
        for iss in issues:
            logging.warning(f"   -> {iss}")
    else:
        logging.info(f"[Gate 4] Epoch {epoch}: Healthy")

    return len(issues) == 0


def check_shortcut_proxy(epoch, v_probs, v_labels):
    """
    Proxy check TRONG TRAINING — không cần raw video.
    Phát hiện nếu model predict violence chủ yếu dựa vào distribution gap.
    """
    v_probs = np.array(v_probs)
    v_labels = np.array(v_labels)
    
    pos_mean = v_probs[v_labels == 1].mean() if (v_labels == 1).any() else 0.0
    neg_mean = v_probs[v_labels == 0].mean() if (v_labels == 0).any() else 0.0
    gap = pos_mean - neg_mean
    
    logging.info(
        f"[Shortcut Proxy] Epoch {epoch} | "
        f"V_pos_mean={pos_mean:.4f} | V_neg_mean={neg_mean:.4f} | gap={gap:.4f}"
    )
    
    # Gap > 0.70 sớm (epoch < 5) = shortcut quá dễ, model chưa học gì
    if epoch < 5 and gap > 0.70:
        logging.warning(
            f"[Shortcut Proxy] ⚠️  GAP={gap:.3f} > 0.70 tại epoch {epoch} "
            f"— Quá sớm để có gap lớn, nghi ngờ quality shortcut"
        )
    return {"pos_mean": pos_mean, "neg_mean": neg_mean, "gap": gap}


# ─────────────────────────────────────────────────────────────────────────────
# Threshold Calibration Utilities
# ─────────────────────────────────────────────────────────────────────────────

def find_threshold_by_fbeta(probs, labels, beta=2.0, n_thresh=100):
    """Tìm ngưỡng tối ưu theo F-beta score (Violence dùng F2)."""
    thresholds = np.linspace(0.05, 0.95, n_thresh)
    best_t, best_fb = 0.5, 0.0
    for t in thresholds:
        preds = (probs >= t).astype(int)
        fb = fbeta_score(labels, preds, beta=beta, zero_division=0)
        if fb > best_fb:
            best_fb, best_t = fb, t
    return best_t, best_fb


def find_threshold_by_recall(scores, recall_min=0.80, n_thresh=100):
    """Tìm ngưỡng thấp nhất đạt Recall >= recall_min (S_score)."""
    thresholds = np.linspace(0.01, 0.99, n_thresh)
    best_t = 0.3  # default
    for t in sorted(thresholds, reverse=True):
        preds = (scores >= t).astype(int)
        r = recall_score(np.ones(len(scores)), preds, zero_division=0)
        if r >= recall_min:
            best_t = t
            break
    return best_t


# ─────────────────────────────────────────────────────────────────────────────
# Main Training Function
# ─────────────────────────────────────────────────────────────────────────────

def train_e2e(args):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    logging.info(f"Using device: {device}")

    # 1. Datasets
    label_cols = ['violence', 'self_harm', 'nsfw']
    train_ds = ManifestFeatureDataset(
        manifest_path=Path(args.train_manifest),
        data_root=Path(args.features_dir),
        label_columns=label_cols,
        frames_per_clip=args.max_frames,
        default_aux_dim=7  # Flow(3) + YOLO(1) + Gore(1) + SelfHarm(1) + NSFW(1)
    )
    val_ds = ManifestFeatureDataset(
        manifest_path=Path(args.val_manifest),
        data_root=Path(args.features_dir),
        label_columns=label_cols,
        frames_per_clip=args.max_frames,
        default_aux_dim=7
    )

    # WeightedRandomSampler — CHỈ dùng violence weight
    # (S/N label = 0 toàn bộ trong video dataset → không weight)
    import pandas as pd
    train_manifest_df = pd.read_csv(args.train_manifest)
    sample_weights = train_manifest_df['violence'].apply(
        lambda v: float(args.sampler_pos_weight) if v == 1 else 1.0
    ).values
    sampler = WeightedRandomSampler(
        weights=torch.DoubleTensor(sample_weights),
        num_samples=len(train_ds),
        replacement=True
    )

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, sampler=sampler,
        num_workers=args.num_workers, pin_memory=(device.type == 'cuda')
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False,
        num_workers=args.num_workers, pin_memory=(device.type == 'cuda')
    )

    # 2. Model
    model = TaskGatedModelV6(
        clip_dim=768,
        d_model=256,
        max_frames=args.max_frames,
        dropout=0.2,
        sn_pooling=args.sn_pooling,
        sn_topk_ratio=args.sn_topk_ratio,
        sn_topk_min=args.sn_topk_min,
        modality_balance=(not args.disable_modality_balance),
        v_clip_scale=args.v_clip_scale,
        s_clip_scale=args.s_clip_scale,
        n_clip_scale=args.n_clip_scale,
    ).to(device)

    # Optimizer: chỉ train V_Gate FFN + tất cả attention gates
    optimizer = torch.optim.AdamW([
        {"params": model.attention_gate.parameters(), "lr": args.lr},
        {"params": model.ffn_v.parameters(),          "lr": args.lr},
    ], weight_decay=1e-4)

    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    # 3. Train Loop
    best_v_f2 = 0.0
    patience_cnt = 0
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        model.train()
        epoch_losses = {"bce_v": 0, "dist_s": 0, "dist_n": 0, "entropy": 0, "total": 0}
        n_batches = 0
        train_v_probs, train_v_labels = [], []

        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Train]")
        for x, aux, y in pbar:
            x, aux, y = x.to(device), aux.to(device), y.to(device)

            # Unpack aux features V6.1: Flow(3)+YOLO(1)+Gore(1)+SelfHarm(1)+NSFW(1)=7
            # Supports both 774-dim (V6.0) and 775-dim (V6.1)
            flow_feat     = aux[:, :, 0:3]    # [B, T, 3]
            yolo_feat     = aux[:, :, 3:4]    # [B, T, 1]
            gore_feat     = aux[:, :, 4:5]    # [B, T, 1] — dùng trong V_pool
            # V6.1: selfharm_feat ở dim 5, nsfw ở dim 6; V6.0: nsfw ở dim 5
            if aux.shape[-1] >= 7:  # 775-dim (V6.1)
                selfharm_feat = aux[:, :, 5:6]  # [B, T, 1]
                nsfw_feat     = aux[:, :, 6:7]  # [B, T, 1]
            else:                   # 774-dim (V6.0 fallback)
                selfharm_feat = None
                nsfw_feat     = aux[:, :, 5:6]

            optimizer.zero_grad()

            v_logit, S_score, N_score, saliency = model(
                x, flow_feat, yolo_feat, gore_feat, nsfw_feat, selfharm_feat
            )

            v_label = y[:, 0:1]

            # L_dist_S teacher: selfharm_feat (V6.1) hoac gore_feat (V6.0 fallback)
            dist_s_teacher = selfharm_feat if selfharm_feat is not None else gore_feat

            loss, loss_dict = total_loss_v6(
                v_logit=v_logit,
                v_label=v_label,
                v_attn=saliency["violence"],
                s_attn=saliency["self_harm"],
                n_attn=saliency["nsfw"],
                gore_scores=dist_s_teacher,
                nsfw_scores=nsfw_feat,
                epoch=epoch,
                warmup_epochs=args.warmup_epochs,
                T=args.temperature,
                lambda_dist=args.lambda_dist,
                lambda_ent=args.lambda_ent,
                pos_weight_v=args.violence_pos_weight,
            )

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            for k in epoch_losses:
                epoch_losses[k] += loss_dict.get(k, 0)
            n_batches += 1
            train_v_probs.extend(torch.sigmoid(v_logit).detach().cpu().squeeze(-1).numpy())
            train_v_labels.extend(v_label.detach().cpu().squeeze(-1).numpy())
            pbar.set_postfix(
                bce_v=f"{loss_dict['bce_v']:.3f}",
                dist_s=f"{loss_dict['dist_s']:.3f}" if epoch >= args.warmup_epochs else "warmup",
                ent=f"{loss_dict['entropy']:.3f}",
            )

        for k in epoch_losses:
            epoch_losses[k] /= max(n_batches, 1)
        scheduler.step()

        # 4. Validation
        model.eval()
        val_losses = {"bce_v": 0, "dist_s": 0, "dist_n": 0, "entropy": 0, "total": 0}
        val_batches = 0
        all_v_probs, all_v_labels = [], []
        all_s_scores, all_n_scores = [], []

        with torch.no_grad():
            for x, aux, y in tqdm(val_loader, desc=f"Epoch {epoch+1}/{args.epochs} [Val]"):
                x, aux, y = x.to(device), aux.to(device), y.to(device)
                flow_feat  = aux[:, :, 0:3]
                yolo_feat  = aux[:, :, 3:4]
                gore_feat  = aux[:, :, 4:5]
                # Phân biệt 774-dim và 775-dim (có selfharm)
                if aux.shape[-1] >= 7:
                    selfharm_feat = aux[:, :, 5:6]
                    nsfw_feat     = aux[:, :, 6:7]
                else:
                    selfharm_feat = None
                    nsfw_feat     = aux[:, :, 5:6]

                v_logit, S_score, N_score, saliency = model(
                    x, flow_feat, yolo_feat, gore_feat, nsfw_feat, selfharm_feat
                )
                v_prob = torch.sigmoid(v_logit).squeeze(-1)

                v_label = y[:, 0:1]
                dist_s_teacher = selfharm_feat if selfharm_feat is not None else gore_feat
                val_loss, val_loss_dict = total_loss_v6(
                    v_logit=v_logit,
                    v_label=v_label,
                    v_attn=saliency["violence"],
                    s_attn=saliency["self_harm"],
                    n_attn=saliency["nsfw"],
                    gore_scores=dist_s_teacher,
                    nsfw_scores=nsfw_feat,
                    epoch=epoch,
                    warmup_epochs=args.warmup_epochs,
                    T=args.temperature,
                    lambda_dist=args.lambda_dist,
                    lambda_ent=args.lambda_ent,
                    pos_weight_v=args.violence_pos_weight,
                )

                for k in val_losses:
                    val_losses[k] += val_loss_dict.get(k, 0)
                val_batches += 1

                all_v_probs.extend(v_prob.cpu().numpy())
                all_v_labels.extend(y[:, 0].cpu().numpy())
                all_s_scores.extend(S_score.cpu().numpy())
                all_n_scores.extend(N_score.cpu().numpy())

        all_v_probs  = np.array(all_v_probs)
        all_v_labels = np.array(all_v_labels)
        all_s_scores = np.array(all_s_scores)
        all_n_scores = np.array(all_n_scores)
        train_v_probs = np.array(train_v_probs)
        train_v_labels = np.array(train_v_labels)

        if train_v_probs.size:
            train_preds = (train_v_probs >= 0.5).astype(int)
            train_acc = accuracy_score(train_v_labels, train_preds)
            train_prec = precision_score(train_v_labels, train_preds, zero_division=0)
            train_rec = recall_score(train_v_labels, train_preds, zero_division=0)
            train_f1 = f1_score(train_v_labels, train_preds, zero_division=0)
            train_f2 = fbeta_score(train_v_labels, train_preds, beta=2.0, zero_division=0)
            try:
                train_auc = roc_auc_score(train_v_labels, train_v_probs)
            except ValueError:
                train_auc = 0.0
            try:
                train_pr_auc = average_precision_score(train_v_labels, train_v_probs)
            except ValueError:
                train_pr_auc = 0.0
        else:
            train_acc = train_prec = train_rec = train_f1 = train_f2 = train_auc = train_pr_auc = 0.0

        for k in val_losses:
            val_losses[k] /= max(val_batches, 1)

        # Violence metrics
        thresh_v, v_f2 = find_threshold_by_fbeta(all_v_probs, all_v_labels, beta=2.0)
        v_preds = (all_v_probs >= thresh_v).astype(int)
        v_acc   = accuracy_score(all_v_labels, v_preds)
        v_prec  = precision_score(all_v_labels, v_preds, zero_division=0)
        v_rec   = recall_score(all_v_labels, v_preds, zero_division=0)
        v_f1    = f1_score(all_v_labels, v_preds, zero_division=0)
        try:
            v_auc = roc_auc_score(all_v_labels, all_v_probs)
        except ValueError:
            v_auc = 0.0
        try:
            v_pr_auc = average_precision_score(all_v_labels, all_v_probs)
        except ValueError:
            v_pr_auc = 0.0

        # Training health check (Gate 4)
        health_ok = check_training_health(
            epoch+1, args.warmup_epochs, epoch_losses,
            torch.tensor(all_v_probs),
            torch.tensor(all_s_scores),
            torch.tensor(all_n_scores),
        )

        # Quality Shortcut Proxy Check
        shortcut_info = check_shortcut_proxy(epoch+1, all_v_probs, all_v_labels)

        logging.info(
            f"Epoch {epoch+1} | TrainLoss: {epoch_losses['total']:.4f} | ValLoss: {val_losses['total']:.4f} "
            f"(bce={epoch_losses['bce_v']:.4f} "
            f"dist_s={epoch_losses['dist_s']:.4f} "
            f"dist_n={epoch_losses['dist_n']:.4f} "
            f"ent={epoch_losses['entropy']:.4f})"
        )
        logging.info(
            f"  Train V: Acc={train_acc:.4f} Prec={train_prec:.4f} Rec={train_rec:.4f} F1={train_f1:.4f} F2={train_f2:.4f} AUC={train_auc:.4f} PR-AUC={train_pr_auc:.4f}"
        )
        logging.info(
            f"  Violence: Acc={v_acc:.4f} Prec={v_prec:.4f} Rec={v_rec:.4f} F1={v_f1:.4f} F2={v_f2:.4f} "
            f"AUC={v_auc:.4f} PR-AUC={v_pr_auc:.4f} | thresh={thresh_v:.3f}"
        )
        logging.info(
            f"  S_score: mean={all_s_scores.mean():.4f} std={all_s_scores.std():.4f} | "
            f"  N_score: mean={all_n_scores.mean():.4f} std={all_n_scores.std():.4f}"
        )

        append_epoch_metrics(
            Path(args.output_dir) / "metrics" / "e2e_metrics.csv",
            {
                "epoch": epoch + 1,
                "lr": optimizer.param_groups[0]["lr"],
                "train_loss": epoch_losses["total"],
                "train_bce_v": epoch_losses["bce_v"],
                "train_dist_s": epoch_losses["dist_s"],
                "train_dist_n": epoch_losses["dist_n"],
                "train_entropy": epoch_losses["entropy"],
                "train_v_acc": train_acc,
                "train_v_prec": train_prec,
                "train_f1": train_f1,
                "train_v_rec": train_rec,
                "train_v_f2": train_f2,
                "train_v_pr_auc": train_pr_auc,
                "train_v_auc": train_auc,
                "val_v_acc": v_acc,
                "val_v_acc": accuracy_score(all_v_labels, v_preds),
                "val_v_prec": v_prec,
                "val_v_f1": v_f1,
                "val_v_rec": v_rec,
                "val_v_f2": v_f2,
                "val_v_pr_auc": v_pr_auc,
                "val_v_auc": v_auc,
                "val_s_mean": float(all_s_scores.mean()),
                "val_s_std": float(all_s_scores.std()),
                "val_n_mean": float(all_n_scores.mean()),
                "val_n_std": float(all_n_scores.std()),
                "shortcut_gap": shortcut_info["gap"],
            },
        )

        # EarlyStopping theo Violence F2
        if epoch == 0 or v_f2 > best_v_f2:
            best_v_f2 = v_f2
            patience_cnt = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "v_f2": best_v_f2,
                "v_auc": v_auc,
                "args": vars(args),
            }, out_dir / "task_gated_v6_best.pth")
            logging.info(f"  --> Saved best model: V_F2={best_v_f2:.4f}")
        else:
            patience_cnt += 1
            logging.info(f"  No improvement ({patience_cnt}/{args.patience})")
            if patience_cnt >= args.patience:
                logging.info(f"Early stopping at epoch {epoch+1}")
                break

    logging.info(f"\n=== Training Done === Best Violence F2: {best_v_f2:.4f}")


# ─────────────────────────────────────────────────────────────────────────────
# Ablation Runner (PHASE 6)
# ─────────────────────────────────────────────────────────────────────────────

def run_ablation(args):
    """
    Chạy ablation T ∈ {1.0, 2.0, 4.0} — mỗi cái 20 epochs.
    Chọn T cho V_F2 cao nhất + S/N entropy ∈ [1.5, 3.5].
    """
    results = {}
    for T in [1.0, 2.0, 4.0]:
        logging.info(f"\n{'='*50}\nAblation T={T}\n{'='*50}")
        args.temperature = T
        args.epochs = 20
        train_e2e(args)
        # Đọc kết quả từ checkpoint đã save
        ckpt = torch.load(Path(args.output_dir) / "task_gated_v6_best.pth", weights_only=False)
        results[T] = {
            "V_F2": ckpt.get("v_f2", 0.0),
            "V_AUC": ckpt.get("v_auc", 0.0),
        }
        logging.info(f"T={T}: V_F2={results[T]['V_F2']:.4f}")

    logging.info("\n=== Ablation Summary ===")
    for T, res in results.items():
        logging.info(f"T={T}: V_F2={res['V_F2']:.4f} | V_AUC={res['V_AUC']:.4f}")

    best_T = max(results, key=lambda t: results[t]["V_F2"])
    logging.info(f"\nBest T: {best_T} (V_F2={results[best_T]['V_F2']:.4f})")
    logging.info(f"=> Chạy lại với --temperature {best_T} --epochs 50 để train full")
    return best_T


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Train TaskGatedModelV6 E2E (V6.0 Architecture Overhaul)")
    parser.add_argument('--train_manifest', required=True)
    parser.add_argument('--val_manifest',   required=True)
    parser.add_argument('--features_dir',   required=True)
    parser.add_argument('--output_dir', default='/kaggle/working/trong_so')

    # Loss hyperparameters
    parser.add_argument('--temperature',  type=float, default=2.0,
                        help='KL Distillation temperature T (ablation: 1.0/2.0/4.0)')
    parser.add_argument('--lambda_dist',  type=float, default=0.5,
                        help='Weight for KL Distillation loss (bật từ epoch 5)')
    parser.add_argument('--lambda_ent',   type=float, default=0.1,
                        help='Weight for Attention Entropy regularization')
    parser.add_argument('--violence_pos_weight', type=float, default=44.0,
                        help='pos_weight cho BCE violence. Giam gia tri nay de giam recall cuc doan/FP cao.')
    parser.add_argument('--sampler_pos_weight', type=float, default=44.0,
                        help='Trong so positive trong WeightedRandomSampler cho violence.')

    # Training hyperparameters
    parser.add_argument('--max_frames', type=int,   default=64)
    parser.add_argument('--batch_size', type=int,   default=32)
    parser.add_argument('--lr',         type=float, default=1e-4)
    parser.add_argument('--epochs',     type=int,   default=50)
    parser.add_argument('--patience',   type=int,   default=10,
                        help='EarlyStopping patience theo Violence F2')
    parser.add_argument('--num_workers', type=int, default=(0 if os.name == 'nt' else 4),
                        help='DataLoader workers. Windows/local smoke test nen de 0; Kaggle Linux co the de 4.')

    parser.add_argument('--warmup_epochs', type=int, default=5,
                        help='Số epoch chỉ train Violence trước khi bật KL Distillation')
    parser.add_argument('--ablation', action='store_true',
                        help='Chạy ablation T ∈ {1.0, 2.0, 4.0} thay vì full training')

    # Quick-fix V7.0: pooling + fusion balancing
    parser.add_argument('--sn_pooling', choices=['weighted_mean', 'topk_noisy_or'],
                        default='topk_noisy_or',
                        help='Pooling cho S/N score. topk_noisy_or khuyen nghi cho moderation event ngắn.')
    parser.add_argument('--sn_topk_ratio', type=float, default=0.2,
                        help='Ti le top-k frame cho S/N khi sn_pooling=topk_noisy_or.')
    parser.add_argument('--sn_topk_min', type=int, default=3,
                        help='So frame toi thieu trong top-k pooling cho S/N.')
    parser.add_argument('--disable_modality_balance', action='store_true',
                        help='Tat can bang modality (debug ablation).')
    parser.add_argument('--v_clip_scale', type=float, default=0.35,
                        help='He so CLIP trong V_pool (nho hon 1.0 de giam shortcut).')
    parser.add_argument('--s_clip_scale', type=float, default=0.45,
                        help='He so CLIP trong S_pool.')
    parser.add_argument('--n_clip_scale', type=float, default=0.65,
                        help='He so CLIP trong N_pool.')

    args = parser.parse_args()

    if args.ablation:
        run_ablation(args)
    else:
        train_e2e(args)
