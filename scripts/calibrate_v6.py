"""
calibrate_v6.py — V6.0
======================
Tìm ngưỡng (threshold) tối ưu cho Violence (F2), Self-harm (Recall) và NSFW (F1)
trên tập Validation sau khi huấn luyện E2E.
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
from sklearn.metrics import fbeta_score

from src.models.task_gated_model import TaskGatedModelV6
from src.data.manifest_dataset import ManifestFeatureDataset
from scripts.train_e2e_v6 import find_threshold_by_fbeta

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')


def _has_both_classes(y: np.ndarray) -> bool:
    vals = np.unique(y.astype(int))
    return len(vals) >= 2


def _find_best_threshold_fbeta(scores: np.ndarray, labels: np.ndarray, beta: float = 1.0) -> tuple[float, float]:
    thresholds = np.linspace(0.01, 0.99, 199)
    best_t, best_fb = 0.5, -1.0
    for t in thresholds:
        preds = (scores >= t).astype(int)
        try:
            fb = fbeta_score(labels, preds, beta=beta, zero_division=0)
        except ValueError:
            fb = 0.0
        if fb > best_fb:
            best_fb, best_t = fb, float(t)
    return best_t, float(best_fb)


def _quantile_threshold(scores: np.ndarray, q: float, lo: float = 0.05, hi: float = 0.99) -> float:
    if scores.size == 0:
        return 0.5
    t = float(np.quantile(scores, q))
    return float(np.clip(t, lo, hi))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--val_manifest', required=True)
    parser.add_argument('--features_dir', required=True)
    parser.add_argument('--model_weight', required=True)
    parser.add_argument('--batch_size',   type=int, default=32)
    parser.add_argument('--s_quantile', type=float, default=0.90,
                        help='Quantile cho Self-harm khi khong co label tin cay (mac dinh q90).')
    parser.add_argument('--n_quantile', type=float, default=0.99,
                        help='Quantile cho NSFW khi khong co label tin cay (mac dinh q99).')
    parser.add_argument('--output_json', default='',
                        help='Neu set, se luu threshold vao JSON de evaluate doc lai.')
    parser.add_argument('--device',       default='cuda' if torch.cuda.is_available() else 'cpu')
    args = parser.parse_args()

    device = torch.device(args.device)

    # 1. Load Data
    ds = ManifestFeatureDataset(
        manifest_path=Path(args.val_manifest),
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
    model.load_state_dict(ckpt.get("model_state_dict", ckpt))
    model.eval()

    # 3. Inference
    all_v_probs, all_v_labels = [], []
    all_s_labels, all_n_labels = [], []
    all_s_scores, all_n_scores = [], []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Inference on Val Set"):
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
            all_s_labels.extend(y[:, 1].cpu().numpy())
            all_n_labels.extend(y[:, 2].cpu().numpy())
            all_s_scores.extend(S_score.cpu().numpy())
            all_n_scores.extend(N_score.cpu().numpy())

    all_v_probs  = np.array(all_v_probs)
    all_v_labels = np.array(all_v_labels)
    all_s_labels = np.array(all_s_labels)
    all_n_labels = np.array(all_n_labels)
    all_s_scores = np.array(all_s_scores)
    all_n_scores = np.array(all_n_scores)

    print("\n" + "="*60)
    print("  V6.0 CALIBRATION RESULTS (VAL SET)")
    print("="*60)

    # --- Task 1: Violence (Optimize F2) ---
    best_thresh_v, best_f2 = find_threshold_by_fbeta(all_v_probs, all_v_labels, beta=2.0)
    print(f"Violence:  Best Threshold = {best_thresh_v:.4f} | F2-score = {best_f2:.4f}")

    # --- Task 2: Self-harm ---
    # Neu co label thuc (2 class), toi uu theo label; neu khong, dung quantile policy.
    s_has_labels = _has_both_classes(all_s_labels)
    if s_has_labels:
        s_thresh, s_metric = _find_best_threshold_fbeta(all_s_scores, all_s_labels, beta=1.0)
        print(f"Self-harm: Best Threshold = {s_thresh:.4f} | F1={s_metric:.4f} (supervised)")
    else:
        if sn_pooling == "topk_noisy_or":
            s_thresh = _quantile_threshold(all_s_scores, q=float(args.s_quantile), lo=0.10, hi=0.995)
            print(f"Self-harm: Suggested Threshold = {s_thresh:.4f} (q{int(args.s_quantile*100)} policy, no labels)")
        else:
            s_thresh = 0.3
            print(f"Self-harm: Suggested Threshold = {s_thresh:.4f} (legacy weighted_mean policy)")

    # --- Task 3: NSFW ---
    n_has_labels = _has_both_classes(all_n_labels)
    if n_has_labels:
        n_thresh, n_metric = _find_best_threshold_fbeta(all_n_scores, all_n_labels, beta=1.0)
        print(f"NSFW:      Best Threshold = {n_thresh:.4f} | F1={n_metric:.4f} (supervised)")
    else:
        if sn_pooling == "topk_noisy_or":
            n_thresh = _quantile_threshold(all_n_scores, q=float(args.n_quantile), lo=0.20, hi=0.999)
            print(f"NSFW:      Suggested Threshold = {n_thresh:.4f} (q{int(args.n_quantile*100)} policy, no labels)")
        else:
            n_thresh = 0.5
            print(f"NSFW:      Suggested Threshold = {n_thresh:.4f} (legacy weighted_mean policy)")

    s_flag_rate = float((all_s_scores >= s_thresh).mean()) if all_s_scores.size else 0.0
    n_flag_rate = float((all_n_scores >= n_thresh).mean()) if all_n_scores.size else 0.0
    print(f"\nSelf-harm flagged rate on VAL: {s_flag_rate*100:.2f}%")
    print(f"NSFW flagged rate on VAL:      {n_flag_rate*100:.2f}%")

    payload = {
        "thresh_v": float(best_thresh_v),
        "thresh_s": float(s_thresh),
        "thresh_n": float(n_thresh),
        "sn_pooling": sn_pooling,
        "sn_topk_ratio": float(sn_topk_ratio),
        "sn_topk_min": int(sn_topk_min),
        "val_stats": {
            "s_mean": float(all_s_scores.mean()) if all_s_scores.size else 0.0,
            "s_std": float(all_s_scores.std()) if all_s_scores.size else 0.0,
            "n_mean": float(all_n_scores.mean()) if all_n_scores.size else 0.0,
            "n_std": float(all_n_scores.std()) if all_n_scores.size else 0.0,
            "s_flag_rate": s_flag_rate,
            "n_flag_rate": n_flag_rate,
        },
    }

    if args.output_json:
        out_json = Path(args.output_json)
    else:
        out_json = Path(args.model_weight).resolve().parent / "calibration_v6.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\n[INFO] Saved calibration JSON: {out_json}")
    print(
        f"[INFO] Evaluate command: --thresh_v {best_thresh_v:.4f} "
        f"--thresh_s {s_thresh:.4f} --thresh_n {n_thresh:.4f}"
    )

if __name__ == '__main__':
    main()
