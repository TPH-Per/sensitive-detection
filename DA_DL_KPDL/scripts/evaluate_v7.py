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
from sklearn.metrics import (
    auc,
    confusion_matrix,
    fbeta_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from torch.utils.data import DataLoader
from tqdm import tqdm

from src.data.video_moderation_v7_dataset import VideoModerationV7Dataset
from src.models.v7_videomae_lora import V7Config, VideoModerationV7

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def load_model(ckpt_path: Path, device: torch.device) -> VideoModerationV7:
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
    return model


def main():
    parser = argparse.ArgumentParser(description="Evaluate V7 on test video manifest")
    parser.add_argument("--test_manifest", required=True)
    parser.add_argument("--features_dir", default="")
    parser.add_argument("--model_weight", required=True)
    parser.add_argument("--thresh_v", type=float, default=0.5)
    parser.add_argument("--thresh_s", type=float, default=0.3)
    parser.add_argument("--thresh_n", type=float, default=0.5)
    parser.add_argument("--calibration_json", default="")
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--num_workers", type=int, default=2)
    parser.add_argument("--num_frames", type=int, default=16)
    parser.add_argument("--image_size", type=int, default=224)
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    device = torch.device(args.device if torch.cuda.is_available() else "cpu")
    ds = VideoModerationV7Dataset(
        manifest_path=Path(args.test_manifest),
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

    model = load_model(Path(args.model_weight), device)

    if args.calibration_json:
        cal_path = Path(args.calibration_json)
        if not cal_path.exists():
            raise FileNotFoundError(f"Calibration JSON not found: {cal_path}")
        cal = json.loads(cal_path.read_text(encoding="utf-8"))
        args.thresh_v = float(cal.get("thresh_v", args.thresh_v))
        args.thresh_s = float(cal.get("thresh_s", args.thresh_s))
        args.thresh_n = float(cal.get("thresh_n", args.thresh_n))
        logging.info(
            "Loaded thresholds from %s -> V=%.4f S=%.4f N=%.4f",
            cal_path, args.thresh_v, args.thresh_s, args.thresh_n
        )

    if args.thresh_v < 0.10:
        logging.warning(
            "Violence threshold is very low (%.4f). This usually maximizes recall but can inflate FP heavily.",
            args.thresh_v,
        )

    all_v_probs, all_v_labels = [], []
    all_s_scores, all_n_scores = [], []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Evaluating V7 on Test"):
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

    v_preds = (all_v_probs >= args.thresh_v).astype(int)
    v_auc = roc_auc_score(all_v_labels, all_v_probs)
    v_f2 = fbeta_score(all_v_labels, v_preds, beta=2.0, zero_division=0)
    v_prec = precision_score(all_v_labels, v_preds, zero_division=0)
    v_rec = recall_score(all_v_labels, v_preds, zero_division=0)
    p, r, _ = precision_recall_curve(all_v_labels, all_v_probs)
    v_pr_auc = auc(r, p)

    print("\n" + "=" * 60)
    print("  V7 FINAL EVALUATION REPORT (TEST SET)")
    print("=" * 60)
    print(f"TASK: VIOLENCE (Threshold={args.thresh_v})")
    print(f"  ROC-AUC:  {v_auc:.4f}")
    print(f"  PR-AUC:   {v_pr_auc:.4f}")
    print(f"  F2-score: {v_f2:.4f}")
    print(f"  Precision:{v_prec:.4f}")
    print(f"  Recall:   {v_rec:.4f}")
    print(f"  Confusion Matrix:\n{confusion_matrix(all_v_labels, v_preds)}")

    print(f"\nTASK: SELF-HARM (Threshold={args.thresh_s})")
    s_flagged = int((all_s_scores >= args.thresh_s).sum())
    print(f"  Flagged: {s_flagged}/{len(all_s_scores)} ({s_flagged/max(len(all_s_scores),1)*100:.1f}%)")
    print(f"  Score Mean/Std: {all_s_scores.mean():.4f} / {all_s_scores.std():.4f}")

    print(f"\nTASK: NSFW (Threshold={args.thresh_n})")
    n_flagged = int((all_n_scores >= args.thresh_n).sum())
    print(f"  Flagged: {n_flagged}/{len(all_n_scores)} ({n_flagged/max(len(all_n_scores),1)*100:.1f}%)")
    print(f"  Score Mean/Std: {all_n_scores.mean():.4f} / {all_n_scores.std():.4f}")

    print("\n" + "=" * 60)
    print("  [DONE] Pipeline V7 Evaluation Complete.")
    print("=" * 60)


if __name__ == "__main__":
    main()
