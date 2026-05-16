import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import json

import numpy as np
import torch
from sklearn.metrics import fbeta_score, f1_score, precision_score, recall_score
from torch.utils.data import DataLoader
from tqdm import tqdm

from src.data.video_moderation_v7_dataset import VideoModerationV7Dataset
from src.models.v7_videomae_lora import V7Config, VideoModerationV7

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _threshold_grid(n_thresh: int = 199):
    return np.linspace(0.01, 0.99, n_thresh)


def _metrics_at_threshold(probs: np.ndarray, labels: np.ndarray, t: float) -> dict:
    preds = (probs >= t).astype(int)
    prec = precision_score(labels, preds, zero_division=0)
    rec = recall_score(labels, preds, zero_division=0)
    f1 = f1_score(labels, preds, zero_division=0)
    f2 = fbeta_score(labels, preds, beta=2.0, zero_division=0)
    return {"threshold": float(t), "precision": float(prec), "recall": float(rec), "f1": float(f1), "f2": float(f2)}


def find_threshold_for_objective(
    probs: np.ndarray,
    labels: np.ndarray,
    objective: str = "f2",
    precision_min: float = 0.65,
    n_thresh: int = 199,
) -> dict:
    thresholds = _threshold_grid(n_thresh=n_thresh)

    if objective == "precision_floor":
        candidates = []
        for t in thresholds:
            m = _metrics_at_threshold(probs, labels, float(t))
            if m["precision"] >= precision_min:
                candidates.append(m)
        if candidates:
            # Max recall first, then F2, then precision.
            candidates.sort(key=lambda m: (m["recall"], m["f2"], m["precision"]), reverse=True)
            best = candidates[0]
            best["selection"] = f"precision_floor(precision>={precision_min:.2f})"
            return best
        # Fallback when precision floor cannot be reached.
        objective = "f1"

    best_m = None
    best_key = -1.0
    for t in thresholds:
        m = _metrics_at_threshold(probs, labels, float(t))
        key = m["f2"] if objective == "f2" else m["f1"]
        if key > best_key:
            best_key = key
            best_m = m
    best_m["selection"] = objective
    return best_m


def load_model(ckpt_path: Path, device: torch.device) -> tuple[VideoModerationV7, dict]:
    try:
        ckpt = torch.load(ckpt_path, map_location=device, weights_only=False)
    except TypeError:
        ckpt = torch.load(ckpt_path, map_location=device)

    model_cfg_dict = ckpt.get("model_cfg", None)
    if model_cfg_dict:
        cfg = V7Config(**model_cfg_dict)
    else:
        args = ckpt.get("args", {})
        cfg = V7Config(
            model_name=args.get("model_name", "MCG-NJU/videomae-small-finetuned-ssv2"),
            d_fuse=int(args.get("d_fuse", 384)),
            lora_r=int(args.get("lora_r", 8)),
            lora_alpha=float(args.get("lora_alpha", 16.0)),
            lora_dropout=float(args.get("lora_dropout", 0.05)),
            lora_last_n_layers=int(args.get("lora_last_n_layers", 4)),
            dropout=float(args.get("dropout", 0.2)),
        )

    model = VideoModerationV7(cfg).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()
    return model, ckpt


def main():
    parser = argparse.ArgumentParser(description="Calibrate V7 thresholds")
    parser.add_argument("--val_manifest", required=True)
    parser.add_argument("--features_dir", default="")
    parser.add_argument("--model_weight", required=True)
    parser.add_argument("--v_objective", choices=["f2", "f1", "precision_floor"], default="precision_floor")
    parser.add_argument("--v_precision_min", type=float, default=0.65)
    parser.add_argument("--s_quantile", type=float, default=0.98)
    parser.add_argument("--n_quantile", type=float, default=0.995)
    parser.add_argument("--output_json", default="")
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--num_workers", type=int, default=2)
    parser.add_argument("--num_frames", type=int, default=16)
    parser.add_argument("--image_size", type=int, default=224)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    device = torch.device(args.device if torch.cuda.is_available() else "cpu")

    ds = VideoModerationV7Dataset(
        manifest_path=Path(args.val_manifest),
        features_dir=Path(args.features_dir) if args.features_dir else None,
        num_frames=args.num_frames,
        image_size=args.image_size,
        is_train=False,
    )
    loader = DataLoader(
        ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"),
    )

    model, ckpt = load_model(Path(args.model_weight), device)

    all_v_probs, all_v_labels = [], []
    all_s_scores, all_n_scores = [], []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Calibrating V7 on Val"):
            x = batch["pixel_values"].to(device)
            aux = batch["aux_summary"].to(device)
            y = batch["violence"].to(device)
            v_logit, s_logit, n_logit = model(x, aux)
            all_v_probs.extend(torch.sigmoid(v_logit).cpu().numpy())
            all_v_labels.extend(y.cpu().numpy())
            all_s_scores.extend(torch.sigmoid(s_logit).cpu().numpy())
            all_n_scores.extend(torch.sigmoid(n_logit).cpu().numpy())

    all_v_probs = np.array(all_v_probs)
    all_v_labels = np.array(all_v_labels)
    all_s_scores = np.array(all_s_scores)
    all_n_scores = np.array(all_n_scores)

    best_v = find_threshold_for_objective(
        probs=all_v_probs,
        labels=all_v_labels,
        objective=args.v_objective,
        precision_min=args.v_precision_min,
    )
    t_v = float(best_v["threshold"])

    # Event policy: choose conservative upper-tail thresholds for S/N.
    t_s = float(np.quantile(all_s_scores, args.s_quantile)) if len(all_s_scores) else 0.30
    t_n = float(np.quantile(all_n_scores, args.n_quantile)) if len(all_n_scores) else 0.50
    t_s = float(np.clip(t_s, 0.20, 0.999))
    t_n = float(np.clip(t_n, 0.20, 0.999))
    s_flag_rate = float((all_s_scores >= t_s).mean()) if len(all_s_scores) else 0.0
    n_flag_rate = float((all_n_scores >= t_n).mean()) if len(all_n_scores) else 0.0

    print("\n" + "=" * 60)
    print("  V7 CALIBRATION RESULTS (VAL SET)")
    print("=" * 60)
    print(
        f"Violence:  Threshold = {t_v:.4f} | "
        f"objective={best_v['selection']} | "
        f"P={best_v['precision']:.4f} R={best_v['recall']:.4f} "
        f"F1={best_v['f1']:.4f} F2={best_v['f2']:.4f}"
    )
    print(f"Self-harm: Suggested Threshold = {t_s:.4f} (q{int(args.s_quantile*1000)/10:.1f} policy)")
    print(f"NSFW:      Suggested Threshold = {t_n:.4f} (q{int(args.n_quantile*1000)/10:.1f} policy)")
    print(f"S flagged on VAL: {s_flag_rate*100:.2f}%")
    print(f"N flagged on VAL: {n_flag_rate*100:.2f}%")
    print("=" * 60)

    payload = {
        "thresh_v": t_v,
        "thresh_s": t_s,
        "thresh_n": t_n,
        "v_objective": best_v["selection"],
        "v_metrics": {
            "precision": best_v["precision"],
            "recall": best_v["recall"],
            "f1": best_v["f1"],
            "f2": best_v["f2"],
        },
        "policy": {
            "s_quantile": float(args.s_quantile),
            "n_quantile": float(args.n_quantile),
        },
        "val_stats": {
            "s_mean": float(all_s_scores.mean()) if len(all_s_scores) else 0.0,
            "s_std": float(all_s_scores.std()) if len(all_s_scores) else 0.0,
            "n_mean": float(all_n_scores.mean()) if len(all_n_scores) else 0.0,
            "n_std": float(all_n_scores.std()) if len(all_n_scores) else 0.0,
            "s_flag_rate": s_flag_rate,
            "n_flag_rate": n_flag_rate,
        },
    }

    if args.output_json:
        out_json = Path(args.output_json)
    else:
        out_json = Path(args.model_weight).resolve().parent / "calibration_v7.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[INFO] Saved calibration JSON: {out_json}")
    print(
        f"[INFO] Evaluate command: --thresh_v {t_v:.4f} --thresh_s {t_s:.4f} --thresh_n {t_n:.4f}"
    )


if __name__ == "__main__":
    main()
