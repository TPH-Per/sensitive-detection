"""
evaluate_v6.py — V6.0
====================
Đánh giá cuối cùng trên tập TEST sử dụng các ngưỡng đã được Calibrate.
Xuất báo cáo chi tiết: PR-AUC, F2, Precision, Recall, Confusion Matrix.
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import json
import torch
import numpy as np
import pandas as pd
from torch.utils.data import DataLoader
from tqdm import tqdm
from sklearn.metrics import (
    precision_score, recall_score, f1_score, fbeta_score,
    roc_auc_score, precision_recall_curve, auc, confusion_matrix
)

from src.models.task_gated_model import TaskGatedModelV6
from src.data.manifest_dataset import ManifestFeatureDataset

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--test_manifest', required=True)
    parser.add_argument('--features_dir', required=True)
    parser.add_argument('--model_weight', required=True)
    parser.add_argument('--thresh_v',     type=float, default=0.5)
    parser.add_argument('--thresh_s',     type=float, default=0.3)
    parser.add_argument('--thresh_n',     type=float, default=0.5)
    parser.add_argument('--calibration_json', default='',
                        help='Optional: JSON tu calibrate_v6.py de override threshold.')
    parser.add_argument('--batch_size',   type=int, default=32)
    parser.add_argument('--device',       default='cuda' if torch.cuda.is_available() else 'cpu')
    args = parser.parse_args()

    device = torch.device(args.device)

    # 1. Load Data
    ds = ManifestFeatureDataset(
        manifest_path=Path(args.test_manifest),
        data_root=Path(args.features_dir),
        label_columns=['violence', 'self_harm', 'nsfw'],
        default_aux_dim=7,
    )
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=False)

    # 2. Load checkpoint first (để lấy model args nếu có)
    # PyTorch >=2.6 defaults to weights_only=True, which may fail for
    # training checkpoints that store optimizer/args metadata.
    try:
        ckpt = torch.load(args.model_weight, map_location=device, weights_only=False)
    except TypeError:
        # Backward compatibility for older torch versions without weights_only.
        ckpt = torch.load(args.model_weight, map_location=device)

    ckpt_args = ckpt.get("args", {}) if isinstance(ckpt, dict) else {}
    has_v7_quick_cfg = "sn_pooling" in ckpt_args
    sn_pooling = ckpt_args.get("sn_pooling", "weighted_mean")
    sn_topk_ratio = float(ckpt_args.get("sn_topk_ratio", 0.2))
    sn_topk_min = int(ckpt_args.get("sn_topk_min", 3))
    if has_v7_quick_cfg:
        modality_balance = not bool(ckpt_args.get("disable_modality_balance", False))
        v_clip_scale = float(ckpt_args.get("v_clip_scale", 0.35))
        s_clip_scale = float(ckpt_args.get("s_clip_scale", 0.45))
        n_clip_scale = float(ckpt_args.get("n_clip_scale", 0.65))
    else:
        # Legacy checkpoint: giữ hành vi cũ để tái lập metric cũ.
        modality_balance = False
        v_clip_scale = 1.0
        s_clip_scale = 1.0
        n_clip_scale = 1.0

    model = TaskGatedModelV6(
        clip_dim=768,
        d_model=256,
        sn_pooling=sn_pooling,
        sn_topk_ratio=sn_topk_ratio,
        sn_topk_min=sn_topk_min,
        modality_balance=modality_balance,
        v_clip_scale=v_clip_scale,
        s_clip_scale=s_clip_scale,
        n_clip_scale=n_clip_scale,
    ).to(device)
    logging.info(
        "Model cfg | sn_pooling=%s topk_ratio=%.3f topk_min=%d modality_balance=%s "
        "clip_scales(v/s/n)=(%.2f/%.2f/%.2f)",
        sn_pooling, sn_topk_ratio, sn_topk_min, modality_balance,
        v_clip_scale, s_clip_scale, n_clip_scale,
    )

    # Threshold override from calibration JSON if provided.
    if args.calibration_json:
        cal_path = Path(args.calibration_json)
        if not cal_path.exists():
            raise FileNotFoundError(f"Calibration JSON not found: {cal_path}")
        cal = json.loads(cal_path.read_text(encoding='utf-8'))
        args.thresh_v = float(cal.get("thresh_v", args.thresh_v))
        args.thresh_s = float(cal.get("thresh_s", args.thresh_s))
        args.thresh_n = float(cal.get("thresh_n", args.thresh_n))
        logging.info(
            "Loaded thresholds from %s -> V=%.4f S=%.4f N=%.4f",
            cal_path, args.thresh_v, args.thresh_s, args.thresh_n,
        )
    elif sn_pooling == "topk_noisy_or" and abs(args.thresh_s - 0.3) < 1e-9 and abs(args.thresh_n - 0.5) < 1e-9:
        logging.warning(
            "Using legacy thresholds (S=0.3, N=0.5) with sn_pooling=topk_noisy_or can over-trigger badly. "
            "Run calibrate_v6.py and pass --calibration_json."
        )

    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.eval()

    # 3. Inference
    all_v_probs, all_v_labels = [], []
    all_s_scores, all_n_scores = [], []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Testing on Test Set"):
            if len(batch) == 2:
                x, y = batch
                aux = torch.zeros((x.size(0), x.size(1), 7), dtype=x.dtype)
            else:
                x, aux, y = batch
            x, aux, y = x.to(device), aux.to(device), y.to(device)

            flow_feat = aux[:, :, 0:3]
            yolo_feat = aux[:, :, 3:4]
            gore_feat = aux[:, :, 4:5]
            # Backward compatibility:
            # - V6.1 features (775-dim): aux=7 -> selfharm idx5, nsfw idx6
            # - V6.0 features (774-dim): aux=6 -> nsfw idx5, selfharm=None (fallback in model)
            if aux.shape[-1] >= 7:
                selfharm_feat = aux[:, :, 5:6]
                nsfw_feat = aux[:, :, 6:7]
            else:
                selfharm_feat = None
                nsfw_feat = aux[:, :, 5:6]

            v_logit, S_score, N_score, _ = model(
                x, flow_feat, yolo_feat, gore_feat, nsfw_feat, selfharm_feat
            )
            v_prob = torch.sigmoid(v_logit).squeeze(-1)
            
            all_v_probs.extend(v_prob.cpu().numpy())
            all_v_labels.extend(y[:, 0].cpu().numpy())
            all_s_scores.extend(S_score.cpu().numpy())
            all_n_scores.extend(N_score.cpu().numpy())

    all_v_probs  = np.array(all_v_probs)
    all_v_labels = np.array(all_v_labels)
    all_s_scores = np.array(all_s_scores)
    all_n_scores = np.array(all_n_scores)

    # 4. Metrics
    v_preds = (all_v_probs >= args.thresh_v).astype(int)
    
    print("\n" + "="*60)
    print("  V6.0 FINAL EVALUATION REPORT (TEST SET)")
    print("="*60)

    # VIOLENCE
    v_auc = roc_auc_score(all_v_labels, all_v_probs)
    v_f2  = fbeta_score(all_v_labels, v_preds, beta=2.0, zero_division=0)
    v_prec = precision_score(all_v_labels, v_preds, zero_division=0)
    v_rec  = recall_score(all_v_labels, v_preds, zero_division=0)
    
    # PR-AUC
    precision, recall, _ = precision_recall_curve(all_v_labels, all_v_probs)
    v_pr_auc = auc(recall, precision)

    print(f"TASK: VIOLENCE (Threshold={args.thresh_v})")
    print(f"  ROC-AUC:  {v_auc:.4f}")
    print(f"  PR-AUC:   {v_pr_auc:.4f}")
    print(f"  F2-score: {v_f2:.4f}")
    print(f"  Precision:{v_prec:.4f}")
    print(f"  Recall:   {v_rec:.4f}")
    print(f"  Confusion Matrix:\n{confusion_matrix(all_v_labels, v_preds)}")

    # SELF-HARM / NSFW (Weakly Supervised - Reporting Distributions)
    print(f"\nTASK: SELF-HARM (Threshold={args.thresh_s})")
    s_flagged = (all_s_scores >= args.thresh_s).sum()
    print(f"  Flagged: {s_flagged}/{len(all_s_scores)} ({s_flagged/len(all_s_scores)*100:.1f}%)")
    print(f"  Score Mean/Std: {all_s_scores.mean():.4f} / {all_s_scores.std():.4f}")

    print(f"\nTASK: NSFW (Threshold={args.thresh_n})")
    n_flagged = (all_n_scores >= args.thresh_n).sum()
    print(f"  Flagged: {n_flagged}/{len(all_n_scores)} ({n_flagged/len(all_n_scores)*100:.1f}%)")
    print(f"  Score Mean/Std: {all_n_scores.mean():.4f} / {all_n_scores.std():.4f}")

    print("\n" + "="*60)
    print("  [DONE] Pipeline V6.0 Evaluation Complete.")
    print("="*60)

if __name__ == '__main__':
    main()
