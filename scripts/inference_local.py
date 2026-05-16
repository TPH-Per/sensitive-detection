"""
Inference Pipeline — V2 MHCM-MIL (Local)
==========================================
Video → VideoMAE features + Gore/NSFW ResNet teachers → MultiTaskMILModel → V/N verdict

Usage:
  python scripts/inference_local.py --video path/to/video.mp4
  python scripts/inference_local.py --folder path/to/videos/
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from torchvision import transforms

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

WEIGHTS_DIR = ROOT / "trongso"
VIDEOMAE_CHECKPOINT = "MCG-NJU/videomae-small-finetuned-kinetics"

# V2 pipeline config
V2_NUM_FRAMES = 16
V2_SAMPLING_FRAMES = 32
V2_IMAGE_SIZE = 224
V2_CLIP_FRAMES = 16
V2_CLIP_STRIDE = 8
V2_FEATURE_DIM = 384
V2_ATTN_DIM = 128
V2_LORA_RANK = 8
V2_LORA_ALPHA = 16
V2_LORA_DROPOUT = 0.1


# ═══════════════════════════════════════════════════════════════
# VIDEO HELPERS
# ═══════════════════════════════════════════════════════════════

def _sample_indices(total: int, num_frames: int) -> np.ndarray:
    if total <= 0:
        return np.zeros((num_frames,), dtype=np.int64)
    return np.linspace(0, total - 1, num_frames, dtype=np.int64)


def read_video_frames(video_path: str, num_frames: int, image_size: int) -> torch.Tensor:
    """Read and sample frames from video. Returns [T, C, H, W] tensor in [0,1]."""
    video_path = str(video_path)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        total = 0
        while True:
            ok, _ = cap.read()
            if not ok:
                break
            total += 1
        cap.release()
        cap = cv2.VideoCapture(video_path)

    indices = _sample_indices(total, num_frames)
    frames = []
    last_valid = None

    for idx in indices.tolist():
        idx_i = int(max(0, min(total - 1, idx)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx_i)
        ok, frame = cap.read()
        if not ok:
            for _ in range(3):
                ok, frame = cap.read()
                if ok:
                    break
        if not ok:
            if last_valid is not None:
                frames.append(last_valid.copy())
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb = cv2.resize(rgb, (image_size, image_size), interpolation=cv2.INTER_LINEAR)
        frames.append(rgb)
        last_valid = rgb

    cap.release()
    if not frames:
        raise RuntimeError("No frames read from video.")

    while len(frames) < num_frames:
        frames.append(frames[-1].copy())

    arr = np.stack(frames[:num_frames], axis=0).astype(np.float32) / 255.0
    return torch.from_numpy(arr).permute(0, 3, 1, 2)


def _resample_1d(arr: np.ndarray, target_len: int) -> np.ndarray:
    if len(arr) == target_len:
        return arr.astype(np.float32)
    if len(arr) <= 1:
        return np.full((target_len,), float(arr[0]) if len(arr) else 0.0, dtype=np.float32)
    src = np.linspace(0.0, 1.0, num=len(arr), dtype=np.float64)
    dst = np.linspace(0.0, 1.0, num=target_len, dtype=np.float64)
    return np.interp(dst, src, arr).astype(np.float32)


# ═══════════════════════════════════════════════════════════════
# MODEL LOADING
# ═══════════════════════════════════════════════════════════════

def load_all_models(device: torch.device) -> dict:
    """Load all V2 pipeline models."""
    from src.models.mil_v2 import MultiTaskMILModel
    from src.models.v2_resnet_teacher import load_resnet_teacher
    from src.models.v2_videomae_encoder import VideoMAESmallEncoder

    print("[LOAD] Loading V2 pipeline models...")

    encoder = VideoMAESmallEncoder(checkpoint=VIDEOMAE_CHECKPOINT, device=device, frozen=True)

    gore_path = WEIGHTS_DIR / "best_gore_resnet18.pth"
    gore_model = load_resnet_teacher(str(gore_path))
    if gore_model is None:
        raise FileNotFoundError(f"Missing gore teacher: {gore_path}")
    gore_model = gore_model.to(device).eval()

    nsfw_path = WEIGHTS_DIR / "best_nsfw_resnet18.pth"
    nsfw_model = load_resnet_teacher(str(nsfw_path))
    if nsfw_model is None:
        raise FileNotFoundError(f"Missing NSFW teacher: {nsfw_path}")
    nsfw_model = nsfw_model.to(device).eval()

    model_path = WEIGHTS_DIR / "best_model.pth"
    mil_model = MultiTaskMILModel(
        dim=V2_FEATURE_DIM, attn_dim=V2_ATTN_DIM,
        lora_rank=V2_LORA_RANK, lora_alpha=V2_LORA_ALPHA, lora_dropout=V2_LORA_DROPOUT,
    ).to(device)
    state = torch.load(model_path, map_location=device, weights_only=False)
    if isinstance(state, dict) and "model" in state and isinstance(state["model"], dict):
        state = state["model"]
    elif isinstance(state, dict) and "model_state" in state:
        state = state["model_state"]
    mil_model.load_state_dict(state, strict=True)
    mil_model.eval()

    lora_path = WEIGHTS_DIR / "best_lora_only.pth"
    if lora_path.exists():
        lora_state = torch.load(lora_path, map_location=device, weights_only=False)
        if isinstance(lora_state, dict):
            mil_model.load_state_dict(lora_state, strict=False)

    normalize = transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])

    print("[OK] All models loaded.")
    return {
        "encoder": encoder,
        "gore": gore_model,
        "nsfw": nsfw_model,
        "mil": mil_model,
        "normalize": normalize,
    }


# ═══════════════════════════════════════════════════════════════
# INFERENCE
# ═══════════════════════════════════════════════════════════════

@torch.no_grad()
def run_inference(
    video_path: Path,
    models: dict,
    device: torch.device,
    thresholds: dict,
    debug: bool = False,
) -> dict:
    """Run V2 pipeline on a single video."""
    t0 = time.time()

    frames_tensor = read_video_frames(str(video_path), V2_SAMPLING_FRAMES, V2_IMAGE_SIZE)

    # VideoMAE features
    features_np = models["encoder"].encode_sequence(
        frames=frames_tensor,
        clip_frames=V2_CLIP_FRAMES,
        clip_stride=V2_CLIP_STRIDE,
        target_frames=V2_NUM_FRAMES,
    )

    # Teacher scores
    frames_norm = models["normalize"](frames_tensor).to(device)
    gore_scores = torch.sigmoid(models["gore"](frames_norm)).squeeze(-1).cpu().numpy()
    nsfw_scores = torch.sigmoid(models["nsfw"](frames_norm)).squeeze(-1).cpu().numpy()
    gore_scores = _resample_1d(gore_scores, V2_NUM_FRAMES)
    nsfw_scores = _resample_1d(nsfw_scores, V2_NUM_FRAMES)
    aux_np = np.stack([gore_scores, nsfw_scores], axis=1).astype(np.float32)

    # MIL model
    feats_t = torch.from_numpy(features_np).unsqueeze(0).to(device)
    aux_t = torch.from_numpy(aux_np).unsqueeze(0).to(device)
    out = models["mil"](feats_t, aux_t)

    v_prob = float(torch.sigmoid(out["v_logit"]).squeeze(0).item())
    n_prob = float(torch.sigmoid(out["n_logit"]).squeeze(0).item())
    v_attn = out["v_attn"].squeeze(0).squeeze(-1).cpu().numpy().astype(np.float32)
    n_attn = out["n_attn"].squeeze(0).squeeze(-1).cpu().numpy().astype(np.float32)

    thresh_v = thresholds.get("violence", 0.5)
    thresh_n = thresholds.get("nsfw", 0.5)

    scores = {"violence": round(v_prob, 4), "nsfw": round(n_prob, 4)}
    flags = {
        "violence": v_prob >= thresh_v,
        "nsfw": n_prob >= thresh_n,
    }

    if debug:
        print(f"  [DEBUG] V={v_prob:.4f} (thr={thresh_v}) | N={n_prob:.4f} (thr={thresh_n})")
        print(f"  [DEBUG] Gore max={gore_scores.max():.4f} | NSFW max={nsfw_scores.max():.4f}")
        print(f"  [DEBUG] V peak frame={int(np.argmax(v_attn))} | N peak frame={int(np.argmax(n_attn))}")

    any_flagged = any(flags.values())
    flagged_labels = [k for k, v in flags.items() if v]

    return {
        "video": str(video_path),
        "scores": scores,
        "thresholds": {k: round(v, 4) for k, v in thresholds.items()},
        "flags": flags,
        "verdict": "FLAGGED" if any_flagged else "SAFE",
        "flagged_labels": flagged_labels,
        "n_frames": V2_NUM_FRAMES,
        "time_seconds": round(time.time() - t0, 2),
    }


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="V2 MHCM-MIL Video Moderation (Local)")
    parser.add_argument("--video", type=str, help="Path to a video file")
    parser.add_argument("--folder", type=str, help="Path to folder of videos")
    parser.add_argument("--output", type=str, default=None, help="Save results JSON")
    parser.add_argument("--debug", action="store_true", help="Print debug info")
    parser.add_argument("--thresh-v", type=float, default=0.5, help="Violence threshold")
    parser.add_argument("--thresh-n", type=float, default=0.5, help="NSFW threshold")
    args = parser.parse_args()

    if not args.video and not args.folder:
        parser.error("Provide --video or --folder")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    thresholds = {"violence": args.thresh_v, "nsfw": args.thresh_n}

    print("=" * 60)
    print("  V2 MHCM-MIL VIDEO MODERATION")
    print("=" * 60)
    print(f"  Device: {device}")
    print(f"  Thresholds: V={thresholds['violence']} | N={thresholds['nsfw']}")
    print()

    models = load_all_models(device)

    video_exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    videos = []
    if args.video:
        videos.append(Path(args.video))
    if args.folder:
        folder = Path(args.folder)
        videos.extend(sorted(p for p in folder.iterdir() if p.suffix.lower() in video_exts))

    if not videos:
        print("[ERR] No videos found!")
        return

    print(f"[VID] Processing {len(videos)} video(s)...\n")

    results = []
    for idx, vp in enumerate(videos, 1):
        print(f"--- [{idx}/{len(videos)}] {vp.name} ", end="", flush=True)
        try:
            result = run_inference(vp, models, device, thresholds, debug=args.debug)
            results.append(result)

            v = result.get("verdict", "?")
            symbol = "[VIOL]" if v == "FLAGGED" else "[SAFE]"
            s = result.get("scores", {})
            detail = f" V={s.get('violence', 0):.2f} N={s.get('nsfw', 0):.2f}"
            print(f"→ {symbol} {v}{detail} ({result.get('time_seconds', 0)}s)")

        except Exception as e:
            print(f"→ [ERR] {e}")
            results.append({"video": str(vp), "error": str(e)})

    # Summary
    print(f"\n{'=' * 60}")
    flagged = sum(1 for r in results if r.get("verdict") == "FLAGGED")
    safe = sum(1 for r in results if r.get("verdict") == "SAFE")
    errors = sum(1 for r in results if "error" in r)
    print(f"  Total: {len(results)} video(s)")
    print(f"  Flagged: {flagged} | Safe: {safe} | Errors: {errors}")
    print(f"{'=' * 60}")

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[SAVE] Results saved: {out_path}")


if __name__ == "__main__":
    main()
