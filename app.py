"""
app.py — Video & Image Moderation Debug Lab (V2 MHCM-MIL Pipeline)
====================================================================
V2 pipeline: VideoMAE-Small encoder + ViT teachers + MultiTaskMILModel
with independent LoRA adapters, Auxiliary-Gated Frame Weighting, and Gated Attention MIL.

Tasks: Violence (V), NSFW (N). Self-harm removed. YOLO removed.
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import cv2
import gradio as gr
import numpy as np
import torch
from PIL import Image
from transformers import pipeline as hf_pipeline

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from nsfw_classifier_v2 import classify_nsfw_v2
from activity_context import get_activity_classifier

ARTIFACTS_DIR = ROOT / "trongso"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# V2 weight files
WEIGHT_FILES = {
    "gore": "best_gore_resnet18.pth",
    "nsfw": "best_nsfw_resnet18.pth",
    "model": "best_model.pth",
    "lora": "best_lora_only.pth",
}

# VideoMAE checkpoint
VIDEOMAE_CHECKPOINT = "MCG-NJU/videomae-small-finetuned-kinetics"

# V2 pipeline config (from train.yaml / model.yaml)
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

# Default thresholds (from V2 training logs — Session 1 best epoch)
DEFAULT_THRESHOLDS = {
    "violence": 0.5,
    "nsfw": 0.5,
}

MODEL_CACHE: dict = {}

# ═══════════════════════════════════════════════════════════════
# MODEL LOADING
# ═══════════════════════════════════════════════════════════════

def load_vit_models():
    """Load ViT violence + NSFW classifiers for image moderation."""
    if MODEL_CACHE.get("vit_loaded", False):
        return

    from transformers import ViTForImageClassification, ViTImageProcessor
    from safetensors.torch import load_file as st_load_file
    from huggingface_hub import hf_hub_download

    VIT_VIOLENCE_MODEL = "jaranohaal/vit-base-violence-detection"
    VIT_NSFW_MODEL = "AdamCodd/vit-base-nsfw-detector"

    print("  [ViT] Loading ViT Violence classifier (with key remapping)...")
    violence_model = ViTForImageClassification.from_pretrained(
        VIT_VIOLENCE_MODEL, ignore_mismatched_sizes=True
    )
    ckpt_path = hf_hub_download(repo_id=VIT_VIOLENCE_MODEL, filename="model.safetensors")
    raw_ckpt = st_load_file(ckpt_path)

    remapped = {}
    for k, v in raw_ckpt.items():
        if k.startswith("blocks."):
            parts = k.split(".", 2)
            idx = parts[1]
            rest = parts[2]
            if rest.startswith("attn.qkv."):
                suffix = rest.replace("attn.qkv.", "")
                dim = v.shape[0] // 3
                remapped[f"vit.encoder.layer.{idx}.attention.attention.query.{suffix}"] = v[:dim]
                remapped[f"vit.encoder.layer.{idx}.attention.attention.key.{suffix}"] = v[dim:2*dim]
                remapped[f"vit.encoder.layer.{idx}.attention.attention.value.{suffix}"] = v[2*dim:]
            elif rest.startswith("attn.proj."):
                remapped[f"vit.encoder.layer.{idx}.attention.output.dense.{rest.replace('attn.proj.', '')}"] = v
            elif rest.startswith("norm1."):
                remapped[f"vit.encoder.layer.{idx}.layernorm_before.{rest.replace('norm1.', '')}"] = v
            elif rest.startswith("norm2."):
                remapped[f"vit.encoder.layer.{idx}.layernorm_after.{rest.replace('norm2.', '')}"] = v
            elif rest.startswith("mlp.fc1."):
                remapped[f"vit.encoder.layer.{idx}.intermediate.dense.{rest.replace('mlp.fc1.', '')}"] = v
            elif rest.startswith("mlp.fc2."):
                remapped[f"vit.encoder.layer.{idx}.output.dense.{rest.replace('mlp.fc2.', '')}"] = v
        elif k == "patch_embed.proj.weight":
            remapped["vit.embeddings.patch_embeddings.projection.weight"] = v
        elif k == "patch_embed.proj.bias":
            remapped["vit.embeddings.patch_embeddings.projection.bias"] = v
        elif k == "cls_token":
            remapped["vit.embeddings.cls_token"] = v
        elif k == "pos_embed":
            remapped["vit.embeddings.position_embeddings"] = v
        elif k == "norm.weight":
            remapped["vit.layernorm.weight"] = v
        elif k == "norm.bias":
            remapped["vit.layernorm.bias"] = v
        elif k == "head.weight":
            remapped["classifier.weight"] = v
        elif k == "head.bias":
            remapped["classifier.bias"] = v

    missing, unexpected = violence_model.load_state_dict(remapped, strict=False)
    violence_model.to(DEVICE)
    violence_model.eval()
    violence_processor = ViTImageProcessor.from_pretrained(VIT_VIOLENCE_MODEL)
    print(f"  [ViT] Violence model loaded: {len(remapped)} keys, {len(missing)} missing")

    print("  [ViT] Loading ViT NSFW classifier...")
    nsfw_pipe = hf_pipeline("image-classification", model=VIT_NSFW_MODEL, device=DEVICE)

    print("  [NudeNet] Loading NudeNet detector...")
    from nudenet import NudeDetector
    nude_detector = NudeDetector()

    MODEL_CACHE.update({
        "vit_loaded": True,
        "vit_violence_model": violence_model,
        "vit_violence_processor": violence_processor,
        "vit_nsfw": nsfw_pipe,
        "nude_detector": nude_detector,
    })


# ═══════════════════════════════════════════════════════════════
# VIDEO HELPERS
# ═══════════════════════════════════════════════════════════════


def _sample_indices(total: int, num_frames: int) -> np.ndarray:
    if total <= 0:
        return np.zeros((num_frames,), dtype=np.int64)
    return np.linspace(0, total - 1, num_frames, dtype=np.int64)


def read_video_frames(video_path: str, num_frames: int, image_size: int) -> torch.Tensor:
    """Read and sample frames from video. Returns [T, C, H, W] tensor in [0,1]."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        # Count manually
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
    return torch.from_numpy(arr).permute(0, 3, 1, 2)  # [T, C, H, W]


def _resample_1d(arr: np.ndarray, target_len: int) -> np.ndarray:
    """Resample 1D array to target length via linear interpolation."""
    if len(arr) == target_len:
        return arr.astype(np.float32)
    if len(arr) <= 1:
        return np.full((target_len,), float(arr[0]) if len(arr) else 0.0, dtype=np.float32)
    src = np.linspace(0.0, 1.0, num=len(arr), dtype=np.float64)
    dst = np.linspace(0.0, 1.0, num=target_len, dtype=np.float64)
    return np.interp(dst, src, arr).astype(np.float32)


def normalize01(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float32)
    if x.size == 0:
        return x
    mn, mx = float(x.min()), float(x.max())
    if mx - mn < 1e-8:
        return np.zeros_like(x, dtype=np.float32)
    return (x - mn) / (mx - mn)


# ═══════════════════════════════════════════════════════════════
# SPIKE PATTERN DETECTOR: VIOLENCE EVIDENCE ANALYSIS
# ═══════════════════════════════════════════════════════════════


def compute_violence_evidence(scores: np.ndarray) -> tuple:
    """Analyze score curve shape around peak to distinguish real violence from noise.

    Real violence creates a characteristic pattern: high peak with warm neighbors
    (windup/follow-through). Noise/flash creates isolated spikes with cold neighbors.

    Args:
        scores: gore_scores_resampled [16]

    Returns:
        (evidence_score 0-1, pattern_type string)
    """
    peak = float(scores.max())
    peak_idx = int(scores.argmax())
    T = len(scores)

    # Neighborhood ±2 frames around peak
    left = scores[max(0, peak_idx - 2):peak_idx]
    right = scores[peak_idx + 1:min(T, peak_idx + 3)]
    neighbors = np.concatenate([left, right])

    if len(neighbors) == 0:
        return peak * 0.3, "no_context"

    neighbor_mean = float(neighbors.mean())
    neighbor_max = float(neighbors.max())

    # Pattern 1 — Fast action violence (quick strike)
    # Extremely high peak + at least 1 neighbor > 0.12 (windup / follow-through)
    if peak >= 0.78 and neighbor_max >= 0.12:
        return peak * 0.65, "fast_action"

    # Pattern 2 — Sustained action (prolonged fight, many frames)
    elif peak >= 0.65 and neighbor_mean >= 0.18:
        return peak * 0.80, "sustained_action"

    # Pattern 3 — Isolated spike (camera flash, compression artifact)
    # High peak but neighbors are ice cold
    elif peak >= 0.65 and neighbor_max < 0.12:
        return peak * 0.25, "isolated_spike"

    # Pattern 4 — Weak signal (insufficient evidence)
    else:
        return peak * 0.40, "weak_signal"


# ═══════════════════════════════════════════════════════════════
# HEURISTIC GATES: FALSE POSITIVE REDUCTION
# ═══════════════════════════════════════════════════════════════


def _get_resolution_penalty(w: int, h: int) -> tuple:
    """Tiered resolution penalty. Higher penalty for lower resolution."""
    pixels = w * h
    if pixels <= 144 * 176:
        return 0.20, "extreme_low_res_144p"
    elif pixels <= 360 * 480:
        return 0.12, "low_res_360p"
    elif pixels <= 640 * 480:
        return 0.08, "low_res_480p"
    return 0.0, "normal_res"


import torch.nn.functional as F

@torch.no_grad()
def run_heuristics_gpu(frames_tensor: torch.Tensor) -> dict:
    """
    Run heuristics purely on GPU using PyTorch tensors.
    Replaces analyze_luminance, analyze_red_distribution, and detect_composite_video.
    frames_tensor: [T, 3, H, W] in range [0, 1]
    """
    T = frames_tensor.shape[0]
    
    # Use max 8 frames for luma & red
    step = max(1, T // 8)
    sampled = frames_tensor[::step][:8].to(DEVICE) * 255.0  # scale to [0, 255]
    
    # Convert to grayscale: 0.299 R + 0.587 G + 0.114 B
    r = sampled[:, 0]
    g = sampled[:, 1]
    b = sampled[:, 2]
    gray = 0.299 * r + 0.587 * g + 0.114 * b  # [T, H, W]
    
    # 1. Luminance & Contrast
    gray_64 = F.interpolate(gray.unsqueeze(1), size=(64, 64), mode='area').squeeze(1)
    mean_luma = float(gray_64.mean().item())
    
    gray_16 = F.interpolate(gray.unsqueeze(1), size=(16, 16), mode='area').squeeze(1)
    stds = gray_16.view(gray_16.shape[0], -1).std(dim=1)
    mean_contrast = float(stds.mean().item())
    
    # 2. Red distribution
    r_64 = F.interpolate(r.unsqueeze(1), size=(64, 64), mode='area').squeeze(1)
    g_64 = F.interpolate(g.unsqueeze(1), size=(64, 64), mode='area').squeeze(1)
    b_64 = F.interpolate(b.unsqueeze(1), size=(64, 64), mode='area').squeeze(1)
    
    red_dominant = (r_64 > g_64 + 30) & (r_64 > b_64 + 30) & (r_64 > 100)
    mean_red_ratio = float(red_dominant.float().mean().item())
    
    r_8 = F.interpolate(r.unsqueeze(1), size=(8, 8), mode='area').view(-1, 64)
    r_8_mean = r_8.mean(dim=1)
    r_8_std = r_8.std(dim=1)
    cv_reds = r_8_std / (r_8_mean + 1e-8)
    mean_cv_red = float(cv_reds.mean().item())
    
    # 3. Composite/split-screen
    # Use max 6 frames
    step_comp = max(1, T // 6)
    sampled_comp = frames_tensor[::step_comp][:6].to(DEVICE) * 255.0
    gray_comp = 0.299 * sampled_comp[:, 0] + 0.587 * sampled_comp[:, 1] + 0.114 * sampled_comp[:, 2]
    gray_128 = F.interpolate(gray_comp.unsqueeze(1), size=(128, 128), mode='area').squeeze(1) # [T, 128, 128]
    
    # Sobel Y filter
    sobel_kernel = torch.tensor([[-1., -2., -1.],
                                 [ 0.,  0.,  0.],
                                 [ 1.,  2.,  1.]], device=DEVICE).view(1, 1, 3, 3)
    sobel_y = F.conv2d(gray_128.unsqueeze(1), sobel_kernel, padding=1).squeeze(1)
    
    sobel_abs = sobel_y.abs()
    row_gradient = sobel_abs.mean(dim=2) # [T, 128]
    
    composite_scores = []
    for i in range(len(gray_128)):
        rg = row_gradient[i]
        threshold = rg.mean() + 2.5 * rg.std()
        strong_rows = torch.where(rg > threshold)[0]
        
        found = False
        for r_idx in strong_rows:
            row_pixels = sobel_abs[i, r_idx]
            if (row_pixels > row_pixels.mean()).float().mean() > 0.7:
                composite_scores.append(1)
                found = True
                break
        if not found:
            composite_scores.append(0)
            
    ratio = float(sum(composite_scores) / len(composite_scores)) if composite_scores else 0.0
    
    return {
        "luma": {
            "mean_luma": mean_luma,
            "mean_local_contrast": mean_contrast,
            "is_dark_ambient": (mean_luma < 55) and (mean_contrast < 25)
        },
        "red": {
            "mean_red_ratio": mean_red_ratio,
            "mean_cv_red": mean_cv_red,
            "is_social_warm": (mean_red_ratio < 0.15) and (mean_cv_red < 0.35)
        },
        "composite": {
            "composite_frame_ratio": ratio,
            "is_composite": ratio > 0.4
        }
    }


# ═══════════════════════════════════════════════════════════════
# AUTO-CROP: 5-SECOND STATIC BACKGROUND DETECTION
# ═══════════════════════════════════════════════════════════════


def _detect_static_background_crop(video_path: str, window_sec: float = 5.0) -> tuple:
    """Detect static background regions using a continuous 5-second buffer.

    Algorithm (5-Second Continuous Buffer):
    1. Extract a continuous 5-second segment (e.g., 150 frames at 30fps)
    2. Use the first frame as baseline, compare all subsequent frames against it
    3. Pixels that remain identical (or below microscopic noise threshold) across
       ALL 5 seconds are flagged as static background (letterboxing, black padding,
       fixed CCTV timestamps, static overlays)
    4. Pixels that exhibit any change (motion, lighting shifts) are the active ROI
    5. Generate bounding box tightly wrapping only the dynamic area
    6. Permanently discard outer static pixels for the rest of the pipeline

    The 5-second requirement prevents false crops on subjects standing still briefly.

    Returns:
        (x, y, w, h) crop coordinates in original resolution, or None if no crop needed.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None

    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    if total_frames <= 0 or orig_w <= 0 or orig_h <= 0:
        cap.release()
        return None

    # Step 1: Extract continuous 5-second buffer
    window_frames = int(fps * window_sec)
    # Take from the start of the video (where letterboxing/watermarks are most consistent)
    # If video is shorter than 5 seconds, use all frames
    frames_to_read = min(window_frames, total_frames)
    if frames_to_read < int(fps * 2):  # need at least 2 seconds for meaningful detection
        cap.release()
        return None

    # Downscale for speed while maintaining pixel-level comparison validity
    scale = 256.0 / max(orig_w, orig_h)
    if scale >= 1.0:
        scale = 0.5
    ds_w = int(orig_w * scale)
    ds_h = int(orig_h * scale)

    # Step 1: Read all frames in the 5-second buffer (continuous, no gaps)
    buffer_frames = []
    for i in range(frames_to_read):
        ok, frame = cap.read()
        if not ok:
            break
        small = cv2.resize(frame, (ds_w, ds_h), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        buffer_frames.append(gray)
    cap.release()

    if len(buffer_frames) < int(fps * 2):
        return None

    # Step 2: Sequential frame comparison — use first frame as baseline
    baseline = buffer_frames[0].astype(np.float32)

    # Accumulate absolute difference against baseline across all frames
    # A pixel is "static" only if it barely changes across ALL frames in 5 seconds
    max_diff_map = np.zeros((ds_h, ds_w), dtype=np.float32)

    for i in range(1, len(buffer_frames)):
        diff = np.abs(buffer_frames[i].astype(np.float32) - baseline)
        max_diff_map = np.maximum(max_diff_map, diff)

    # Step 3: Absolute static validation — strict microscopic noise threshold
    # If a pixel's max deviation across 5 seconds is <= 3 gray levels, it's static
    STATIC_THRESHOLD = 3.0
    content_mask = (max_diff_map > STATIC_THRESHOLD).astype(np.uint8)

    # Morphological cleanup: close small gaps in content, remove isolated noise
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    content_mask = cv2.morphologyEx(content_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    content_mask = cv2.morphologyEx(content_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    # Step 4: Bounding box generation — tight wrap around active ROI
    contours, _ = cv2.findContours(content_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    all_points = np.vstack(contours)
    x, y, w, h = cv2.boundingRect(all_points)

    # Scale back to original resolution
    x_orig = max(0, int(x / scale))
    y_orig = max(0, int(y / scale))
    w_orig = max(1, min(int(w / scale), orig_w - x_orig))
    h_orig = max(1, min(int(h / scale), orig_h - y_orig))

    # Only crop if it actually removes meaningful static area (at least 5% of frame)
    content_ratio = (w_orig * h_orig) / (orig_w * orig_h)
    if content_ratio >= 0.95:
        return None  # virtually no static area to remove

    return (x_orig, y_orig, w_orig, h_orig)


def auto_crop_frames(frames_tensor: torch.Tensor, video_path: str) -> torch.Tensor:
    """Apply auto-crop to frames tensor if static background is detected.

    The crop coordinates from the 5-second static detection are mapped to the
    model's input resolution (224x224), applied to all frames, then resized back.
    This effectively "zooms in" on the active ROI, giving the ViT denser signal.

    Args:
        frames_tensor: [T, C, H, W] tensor in [0, 1]
        video_path: path to original video for resolution detection

    Returns:
        Cropped and re-resized frames tensor [T, C, H, W]
    """
    crop = _detect_static_background_crop(video_path)
    if crop is None:
        return frames_tensor

    x, y, w, h = crop
    T, C, H, W = frames_tensor.shape

    # Get original video dimensions once
    cap = cv2.VideoCapture(video_path)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    # Convert to numpy for cropping
    frames_np = frames_tensor.permute(0, 2, 3, 1).cpu().numpy()  # [T, H, W, C]
    frames_np = (frames_np * 255).clip(0, 255).astype(np.uint8)

    # Scale crop coordinates from original resolution to tensor space (224x224)
    sx = W / orig_w
    sy = H / orig_h
    cx = max(0, int(x * sx))
    cy = max(0, int(y * sy))
    cw = max(1, min(int(w * sx), W - cx))
    ch = max(1, min(int(h * sy), H - cy))

    # Apply crop to all frames and resize back to model input size
    cropped_frames = []
    for i in range(T):
        cropped = frames_np[i, cy:cy+ch, cx:cx+cw]
        resized = cv2.resize(cropped, (W, H), interpolation=cv2.INTER_LINEAR)
        cropped_frames.append(resized)

    result = np.stack(cropped_frames, axis=0).astype(np.float32) / 255.0
    return torch.from_numpy(result).permute(0, 3, 1, 2)


# ═══════════════════════════════════════════════════════════════
# VIT TEACHER INFERENCE (replaces ResNet teachers)
# ═══════════════════════════════════════════════════════════════


@torch.no_grad()
def run_vit_on_frames(frames_tensor: torch.Tensor) -> tuple:
    """Run ViT violence + NSFW classifiers on video frames.
    Returns (violence_scores, nsfw_scores) arrays of shape [T].
    """
    load_vit_models()
    violence_model = MODEL_CACHE["vit_violence_model"]
    violence_proc = MODEL_CACHE["vit_violence_processor"]
    nsfw_pipe = MODEL_CACHE["vit_nsfw"]

    T = frames_tensor.shape[0]

    # Convert all frames to PIL Images for the processors
    pil_images = []
    for i in range(T):
        frame_np = (frames_tensor[i].permute(1, 2, 0).cpu().numpy().clip(0, 1) * 255).astype(np.uint8)
        pil_images.append(Image.fromarray(frame_np))

    # 1. GPU Batch Violence
    v_inputs = violence_proc(images=pil_images, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        v_logits = violence_model(**v_inputs).logits
        v_probs = torch.softmax(v_logits, dim=1)
    v_scores = v_probs[:, 1].cpu().numpy().astype(np.float32)

    # 2. GPU Batch NSFW
    n_scores = np.zeros(T, dtype=np.float32)
    nsfw_batch_results = nsfw_pipe(pil_images, batch_size=T)
    for i, img_result in enumerate(nsfw_batch_results):
        nsfw_map = {r["label"].lower(): r["score"] for r in img_result}
        n_scores[i] = nsfw_map.get("nsfw", 0.0)

    return v_scores, n_scores

# ═══════════════════════════════════════════════════════════════
# V2 VIDEO INFERENCE
# ═══════════════════════════════════════════════════════════════


@torch.no_grad()
def run_v2_inference(
    video_path: str,
    thresholds: dict,
    top_k: int = 6,
) -> tuple:
    """Run pure ViT + GPU Heuristics pipeline on a video."""
    t0 = time.time()
    load_vit_models()

    # 1. Read video frames
    frames_tensor = read_video_frames(video_path, V2_SAMPLING_FRAMES, V2_IMAGE_SIZE)

    # 1b. Auto-crop static background (borders, watermarks, overlays)
    frames_tensor = auto_crop_frames(frames_tensor, video_path)

    # 3. Run ViT teachers
    gore_scores_raw, nsfw_scores_raw = run_vit_on_frames(frames_tensor)

    # Resample teacher scores to match model's num_frames
    gore_scores_resampled = _resample_1d(gore_scores_raw, V2_NUM_FRAMES)
    nsfw_scores_resampled = _resample_1d(nsfw_scores_raw, V2_NUM_FRAMES)

    # ViT-only mode: use ViT scores as attention proxies
    v_attn = gore_scores_resampled.copy()
    n_attn = nsfw_scores_resampled.copy()

    # 5. CLIP activity context: classify peak violence frames as sports or violence
    top_k_indices = np.argsort(gore_scores_raw)[-6:]  # top 6 highest violence frames
    peak_frames_pil = []
    for idx in top_k_indices:
        frame_np = (
            frames_tensor[idx].permute(1, 2, 0).cpu().numpy().clip(0, 1) * 255
        ).astype(np.uint8)
        peak_frames_pil.append(Image.fromarray(frame_np))

    activity = get_activity_classifier().classify(peak_frames_pil)

    # 5a. CLIP violence subtype verification: real violence vs staged/mild action
    violence_subtype = get_activity_classifier().classify_violence_subtype(peak_frames_pil)

    # Apply context-aware suppression to violence scores
    gore_scores_suppressed = gore_scores_raw * activity["suppress_factor"]
    v_peak_raw = float(gore_scores_raw.max())
    v_peak = float(gore_scores_suppressed.max())

    # 5b. CLIP-based NSFW score adjustments (sport only — anime NSFW is already accurate)
    nsfw_scores_adjusted = nsfw_scores_raw.copy()
    nsfw_adj_detail = []
    if activity.get("is_sports", False):
        sport_nsfw_adj = round(1.0 - activity["suppress_factor"], 2)
        nsfw_scores_adjusted = np.maximum(0.0, nsfw_scores_adjusted - sport_nsfw_adj)
        nsfw_adj_detail.append(f"sport -{sport_nsfw_adj}")

    # 5e. ALL heuristic gates in ONE GPU pass — no video re-read, no CPU loops
    h_gpu = run_heuristics_gpu(frames_tensor)
    luma_info = h_gpu["luma"]
    red_info = h_gpu["red"]
    composite_info = h_gpu["composite"]

    # Resolution from original video (for penalty — source quality, not crop)
    cap_res = cv2.VideoCapture(video_path)
    vid_w = int(cap_res.get(cv2.CAP_PROP_FRAME_WIDTH))
    vid_h = int(cap_res.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap_res.release()

    # 5f. Heuristic penalty chain (stacking all applicable penalties)
    v_peak_adjusted = v_peak_raw
    v_peak_adj_detail = [f"raw_peak={v_peak_raw:.3f}"]
    penalty_applied = []

    # H4 — Resolution tier penalty
    res_penalty, res_label = _get_resolution_penalty(vid_w, vid_h)
    if res_penalty > 0:
        v_peak_adjusted = max(0.0, v_peak_adjusted - res_penalty)
        v_peak_adj_detail.append(f"{res_label} -{res_penalty}")

    # Anime penalty
    if activity.get("is_anime", False):
        v_peak_adjusted = max(0.0, v_peak_adjusted - 0.15)
        v_peak_adj_detail.append("anime -0.15")

    # H1 — Luminance gate (dark ambient: birthday, bar, club)
    if luma_info["is_dark_ambient"]:
        v_peak_adjusted = max(0.0, v_peak_adjusted - 0.12)
        v_peak_adj_detail.append(f"dark_ambient -0.12 (luma={luma_info['mean_luma']:.0f})")
        penalty_applied.append("dark")

    # H2 — Red distribution gate (social warm tone vs blood)
    if red_info["is_social_warm"] and luma_info["mean_luma"] < 80:
        v_peak_adjusted = max(0.0, v_peak_adjusted - 0.10)
        v_peak_adj_detail.append(f"social_warm -0.10 (cv_red={red_info['mean_cv_red']:.2f})")
        penalty_applied.append("warm")

    # H3 — Composite/split-screen detection (TikTok style)
    if composite_info["is_composite"]:
        v_peak_adjusted = max(0.0, v_peak_adjusted - 0.20)
        v_peak_adj_detail.append(f"composite -0.20 (ratio={composite_info['composite_frame_ratio']:.2f})")
        penalty_applied.append("composite")

    # Sports: raise the bar — penalty + higher threshold
    thresh_v = thresholds.get("violence", 0.5)
    thresh_n = thresholds.get("nsfw", 0.5)
    if activity.get("is_sports", False):
        v_peak_adjusted = max(0.0, v_peak_adjusted - 0.15)
        v_peak_adj_detail.append("sport -0.15")
        thresh_v = 0.65

    # Safety bypass: sustained high scores override penalties
    v_high_frames_raw = int(np.sum(gore_scores_resampled > 0.7))
    penalties_bypassed = False
    if v_high_frames_raw >= 6 and penalty_applied:
        v_peak_adjusted = v_peak_raw  # restore pre-penalty
        v_peak_adj_detail.append(f"SAFETY BYPASS ({v_high_frames_raw} high frames)")
        penalties_bypassed = True

    # Verdict: simple threshold — pattern detector handles frame quality
    v_peak = v_peak_adjusted
    v_prob = v_peak
    v_flag = (v_peak >= thresh_v)

    # Violence action: three-tier with CLIP gore/brawl verification
    v_action = "safe"
    if v_flag:
        if activity.get("is_sports", False):
            v_action = "safe"  # sports misclassified as violence → ignore
        elif activity.get("is_anime", False):
            v_action = "blur"  # anime violence → max blur, never ban
        elif violence_subtype["is_gore"]:
            v_action = "ban"   # blood, weapons, graphic → delete
        elif violence_subtype["is_brawl"]:
            v_action = "blur"  # street fight, physical altercation → blur
        else:
            v_action = "blur"  # fallback: CLIP unsure, play safe → blur

    # NSFW: fall back to ViT NSFW scores (max over frames)
    n_prob = float(nsfw_scores_adjusted.max())
    n_action = "safe"
    if n_prob >= 0.80:
        n_action = "ban"
    elif n_prob >= 0.70:
        n_action = "blur"
    n_flag = n_action != "safe"

    verdict_flags = []
    if v_action == "ban":
        verdict_flags.append("Violence (BAN)")
    elif v_action == "blur":
        verdict_flags.append("Violence (BLUR)")
    if n_flag:
        verdict_flags.append(f"NSFW ({n_action})")

    is_flagged = bool(verdict_flags)
    verdict = "FLAGGED" if is_flagged else "SAFE"
    reasons = ", ".join(verdict_flags) if verdict_flags else "No label exceeds threshold"

    elapsed = time.time() - t0

    # Build outputs
    v_attn_clipped = np.clip(v_attn, 0.0, 1.0)
    n_attn_clipped = np.clip(n_attn, 0.0, 1.0)

    # Read frames for gallery (at model resolution)
    frames_for_gallery = read_video_frames(video_path, V2_NUM_FRAMES, V2_IMAGE_SIZE)
    frames_uint8 = (
        frames_for_gallery.permute(0, 2, 3, 1).cpu().numpy().clip(0, 1) * 255
    ).astype(np.uint8)

    # Gallery: top-k frames by attention
    def make_gallery(attn, scores, tag):
        k = min(top_k, len(attn))
        idx = np.argsort(attn)[::-1][:k]
        gallery = []
        for i in idx:
            caption = (
                f"{tag} frame={int(i)} | attn={attn[i]:.4f} | "
                f"vit_v={gore_scores_raw[i]:.4f} | vit_n={nsfw_scores_raw[i]:.4f}"
            )
            gallery.append((frames_uint8[i], caption))
        return gallery

    v_gallery = make_gallery(v_attn_clipped, gore_scores_resampled, "V")
    n_gallery = make_gallery(n_attn_clipped, nsfw_scores_resampled, "N")

    verdict_md = f"## {verdict}\n**Reason:** {reasons}"
    # CLIP context info
    context_info = ""
    if activity["is_sports"]:
        context_info = (
            f"\n- **Sports context detected** "
            f"(sports_p={activity['sports_probability']:.2f}, "
            f"suppress={activity['suppress_factor']:.2f}) — "
            f"threshold raised to {thresh_v:.2f}"
        )
    elif activity["violence_confidence"] > activity["sports_confidence"]:
        context_info = (
            f"\n- **Violence context confirmed** "
            f"(violence_p={1 - activity['sports_probability']:.2f})"
        )
    if activity.get("is_anime", False):
        context_info += (
            f"\n- **Anime detected** "
            f"(anime_p={activity['anime_probability']:.2f})"
        )
    # CLIP violence subtype verification
    if v_flag:
        vs = violence_subtype
        subtype_label = "GORE (ban)" if vs["is_gore"] else "BRAWL (blur)" if vs["is_brawl"] else "uncertain (blur)"
        context_info += (
            f"\n- **Violence subtype:** {subtype_label} "
            f"(gore_p={vs['gore_prob']:.2f}, "
            f"gore_conf={vs['gore_confidence']:.3f}, brawl_conf={vs['brawl_confidence']:.3f}) → {v_action}"
        )
    # Heuristic gate diagnostics
    if luma_info.get("is_dark_ambient"):
        context_info += (
            f"\n- **Dark ambient** (luma={luma_info['mean_luma']:.0f}, "
            f"contrast={luma_info['mean_local_contrast']:.0f})"
        )
    if red_info.get("is_social_warm"):
        context_info += (
            f"\n- **Social warm tone** (red_ratio={red_info['mean_red_ratio']:.3f}, "
            f"cv_red={red_info['mean_cv_red']:.2f})"
        )
    if composite_info.get("is_composite"):
        context_info += (
            f"\n- **Composite/split-screen** (ratio={composite_info['composite_frame_ratio']:.2f})"
        )
    if v_peak_adj_detail:
        context_info += f"\n- **ViT peak adj:** {', '.join(v_peak_adj_detail)}"
    if nsfw_adj_detail:
        context_info += f"\n- **NSFW score adj:** {', '.join(nsfw_adj_detail)}"
    if penalties_bypassed:
        context_info += f"\n- **SAFETY BYPASS** — {v_high_frames_raw} high frames override all penalties"
    context_info += f"\n- **Resolution:** {vid_w}x{vid_h}"
    score_md = (
        "### V2 Pipeline (ViT + CLIP context)\n"
        f"- Violence peak: **{v_peak:.4f}** (raw peak={v_peak_raw:.4f}, threshold={thresh_v:.4f}) {'FLAGGED' if v_flag else 'OK'}\n"
        f"- NSFW prob: **{n_prob:.4f}** → {n_action.upper()} (ban>=0.80, blur>=0.70)\n"
        f"- V peak frame: **{int(np.argmax(v_attn_clipped))}** (attn={v_attn_clipped.max():.4f})\n"
        f"- N peak frame: **{int(np.argmax(n_attn_clipped))}** (attn={n_attn_clipped.max():.4f})\n"
        f"- ViT violence max: **{v_peak_raw:.4f}** | ViT NSFW max: **{nsfw_scores_raw.max():.4f}**\n"
        f"- V high frames (>0.7): **{v_high_frames_raw}** (resampled)\n"
        f"- Frames used: **{V2_NUM_FRAMES}** (sampled from {V2_SAMPLING_FRAMES})\n"
        f"- Device: **{DEVICE.type}**\n"
        f"- Runtime: **{elapsed:.2f}s**"
        f"{context_info}"
    )

    # Timeline plot data
    import pandas as pd
    timeline = pd.DataFrame({
        "frame": np.arange(V2_NUM_FRAMES),
        "v_attn": v_attn_clipped,
        "n_attn": n_attn_clipped,
        "vit_violence": _resample_1d(gore_scores_raw, V2_NUM_FRAMES),
        "vit_nsfw": _resample_1d(nsfw_scores_raw, V2_NUM_FRAMES),
    })

    # Free GPU VRAM after inference
    del frames_tensor, gore_scores_raw, nsfw_scores_raw
    if 'feats_t' in dir():
        del feats_t, aux_t
    torch.cuda.empty_cache()

    return verdict_md, score_md, timeline, v_gallery, n_gallery


# ═══════════════════════════════════════════════════════════════
# IMAGE MODERATION (ViT-based)
# ═══════════════════════════════════════════════════════════════


@torch.no_grad()
def process_image_vit(image_path: str):
    """Process image with ViT pipeline: Violence + NSFW."""
    empty = ("### Error\nImage is invalid or processing failed.", "", None)
    if isinstance(image_path, dict):
        image_path = image_path.get("path") or image_path.get("name") or image_path.get("url")
    if not image_path:
        return empty

    try:
        t0 = time.time()
        load_vit_models()
        img = Image.open(image_path).convert("RGB")

        # Violence detection
        violence_model = MODEL_CACHE["vit_violence_model"]
        violence_proc = MODEL_CACHE["vit_violence_processor"]
        v_inputs = violence_proc(images=img, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            v_logits = violence_model(**v_inputs).logits
            v_probs = torch.softmax(v_logits, dim=1).squeeze()
        v_prob = float(v_probs[1].item())

        # NSFW detection: ViT first, then NudeNet if high confidence
        nsfw_result = classify_nsfw_v2(img, MODEL_CACHE["vit_nsfw"])
        nsfw_score = nsfw_result["nsfw_score"]
        nsfw_action = nsfw_result["action"]
        nudenet_detail = ""

        # If ViT NSFW >= 0.9, run NudeNet for ban/blur decision
        if nsfw_score >= 0.90:
            import tempfile, os
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            img.save(tmp.name)
            tmp.close()
            detections = MODEL_CACHE["nude_detector"].detect(tmp.name)
            os.unlink(tmp.name)

            ban_parts = []
            for det in detections:
                label = det["class"].lower()
                score = det["score"]
                if "breast" in label and score >= 0.80:
                    ban_parts.append(f"{label}={score:.2f}")
                if "pussy" in label or "vagina" in label or "genitalia_f" in label or "genitalia" in label:
                    ban_parts.append(f"{label}={score:.2f}")

            if ban_parts:
                nsfw_action = "ban"
                nudenet_detail = f"NudeNet ban: {', '.join(ban_parts)}"
            else:
                nsfw_action = "blur"
                nudenet_detail = f"NudeNet blur (no ban trigger, {len(detections)} detections)"

        # Violence thresholds
        thresh_v_ban = 0.80
        thresh_v_blur = 0.60

        # Build verdict
        verdict_parts = []
        if v_prob >= thresh_v_ban:
            verdict_parts.append("Violence (ban)")
        elif v_prob >= thresh_v_blur:
            verdict_parts.append("Violence (blur)")

        if nsfw_action == "ban":
            verdict_parts.append("NSFW (ban)")
        elif nsfw_action == "blur":
            verdict_parts.append("NSFW (blur)")
        elif nsfw_action == "review":
            verdict_parts.append("NSFW (review)")

        verdict_str = "FLAGGED" if verdict_parts else "SAFE"
        reasons = ", ".join(verdict_parts) if verdict_parts else "No label exceeds threshold"
        verdict_md = f"## {verdict_str}\n**Reason:** {reasons}"

        violence_detail = "\n".join(f"  - {r['label']}: {r['score']:.4f}" for r in [
            {"label": "non-violence", "score": float(v_probs[0].item())},
            {"label": "violence", "score": v_prob},
        ])
        nsfw_scores_str = "\n".join(
            f"  - {label}: {score:.4f}" for label, score in nsfw_result["scores"].items()
        )

        score_md = (
            "### Image Moderation (ViT + NudeNet Pipeline)\n"
            f"- **Violence: {v_prob:.4f}** (ban={thresh_v_ban}, blur={thresh_v_blur})\n"
            f"- **NSFW action: {nsfw_action}** — {nsfw_result['reason']}\n"
            f"- NSFW score: {nsfw_result['nsfw_score']:.3f}\n"
            + (f"- **NudeNet:** {nudenet_detail}\n" if nudenet_detail else "")
            + f"- ViT: {nsfw_result['sfw_score']:.3f} sfw | "
            f"SFW: {nsfw_result['sfw_score']:.3f}\n"
            "### Violence detail\n"
            f"{violence_detail}\n"
            "### NSFW scores (all labels)\n"
            f"{nsfw_scores_str}\n"
            f"- Runtime: **{time.time() - t0:.2f}s**"
        )

        # Free GPU VRAM after inference
        torch.cuda.empty_cache()

        return verdict_md, score_md, img

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return (f"## Processing Error\n`{exc}`", "", None)


@torch.no_grad()
def process_images_batch(image_paths: list[str], batch_size: int = 64) -> list[tuple[int, str]]:
    """Batch process images through ViT models. Returns list of (level, reason)."""
    load_vit_models()
    violence_model = MODEL_CACHE["vit_violence_model"]
    violence_proc = MODEL_CACHE["vit_violence_processor"]
    nsfw_pipe = MODEL_CACHE["vit_nsfw"]

    thresh_v_ban = 0.80
    thresh_n_ban = 0.90
    thresh_blur = 0.60

    results = []
    valid_indices = []
    valid_images = []

    for i, path in enumerate(image_paths):
        try:
            img = Image.open(path).convert("RGB")
            valid_images.append(img)
            valid_indices.append(i)
        except Exception:
            results.append((0, ""))

    if not valid_images:
        while len(results) < len(image_paths):
            results.append((0, ""))
        return results

    # Optimize: Process both models in large chunks to saturate VRAM (15GB can hold massive batches)
    v_probs_list = []
    nsfw_actions_list = []
    
    for start in range(0, len(valid_images), batch_size):
        batch = valid_images[start:start + batch_size]
        
        # 1. GPU Batch Violence
        inputs = violence_proc(images=batch, return_tensors="pt").to(DEVICE)
        with torch.no_grad():
            logits = violence_model(**inputs).logits
            probs = torch.softmax(logits, dim=1)
        v_probs_list.extend(probs[:, 1].cpu().tolist())

        # 2. GPU Batch NSFW (HuggingFace pipeline can handle lists of images natively and batch them)
        nsfw_batch_results = nsfw_pipe(batch, batch_size=batch_size)
        
        for idx, img_result in enumerate(nsfw_batch_results):
            # nsfw_batch_results is a list of lists of dicts: [[{'label': 'nsfw', 'score': 0.99}, {'label': 'sfw', 'score': 0.01}], ...]
            nsfw_score = 0.0
            sfw_score = 0.0
            for item in img_result:
                if item['label'] == 'nsfw':
                    nsfw_score = item['score']
                elif item['label'] == 'sfw':
                    sfw_score = item['score']
                    
            nsfw_result = {
                "action": "safe",
                "reason": "",
                "nsfw_score": nsfw_score,
                "sfw_score": sfw_score
            }
            
            if nsfw_score >= 0.80:
                nsfw_result["action"] = "ban"
                nsfw_result["reason"] = f"Banned (nsfw={nsfw_score:.3f})"
            elif nsfw_score >= 0.55:
                nsfw_result["action"] = "blur"
                nsfw_result["reason"] = f"Blurred (nsfw={nsfw_score:.3f})"
            elif nsfw_score >= 0.35:
                nsfw_result["action"] = "review"
                nsfw_result["reason"] = f"Review (nsfw={nsfw_score:.3f})"
                
            # Integration with NudeNet for high-confidence SFW/NSFW overlaps
            nude_detector = MODEL_CACHE.get("nude_detector")
            if nsfw_score >= 0.90 and nude_detector is not None:
                try:
                    import tempfile
                    import os
                    import cv2
                    import numpy as np
                    
                    temp_path = os.path.join(tempfile.gettempdir(), f"temp_nudenet_{os.getpid()}_{idx}.jpg")
                    img_cv = cv2.cvtColor(np.array(batch[idx]), cv2.COLOR_RGB2BGR)
                    cv2.imwrite(temp_path, img_cv)
                    
                    nude_results = nude_detector.detect(temp_path)
                    
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                        
                    ban_triggers = []
                    if nude_results:
                        for res in nude_results:
                            label = res['class']
                            score = res['score']
                            if score >= 0.80 and label in ["FEMALE_BREAST_EXPOSED", "MALE_BREAST_EXPOSED"]:
                                ban_triggers.append(label)
                            elif label in ["FEMALE_GENITALIA_EXPOSED", "MALE_GENITALIA_EXPOSED", "ANUS_EXPOSED"]:
                                ban_triggers.append(label)
                    
                    if ban_triggers:
                        nsfw_result["action"] = "ban"
                    else:
                        nsfw_result["action"] = "blur"
                        
                except Exception as e:
                    print(f"  [NudeNet] Error running detector on image: {e}")
            
            nsfw_actions_list.append(nsfw_result)

    valid_idx = 0
    final_results = []
    for i in range(len(image_paths)):
        if i in valid_indices:
            v_prob = v_probs_list[valid_idx]
            nsfw_result = nsfw_actions_list[valid_idx]
            valid_idx += 1

            level = 0
            reasons = []
            nsfw_action = nsfw_result["action"]
            if nsfw_action == "ban":
                level = 2
                reasons.append("khỏa thân / khiêu dâm")
            elif nsfw_action == "blur":
                level = max(level, 1)
                reasons.append("nhạy cảm / sexy / bikini")
            if v_prob >= thresh_v_ban:
                level = 2
                reasons.append("bạo lực")
            elif v_prob >= thresh_blur:
                level = max(level, 1)
                reasons.append("bạo lực nhẹ")

            if level == 2:
                reason = "Phát hiện nội dung: " + ", ".join(reasons)
            elif level == 1:
                reason = "Nội dung có yếu tố: " + ", ".join(reasons)
            else:
                reason = ""
            final_results.append((level, reason))
        else:
            final_results.append((0, ""))

    return final_results


# ═══════════════════════════════════════════════════════════════
# PARALLEL VIDEO PROCESSING
# ═══════════════════════════════════════════════════════════════


def _process_single_video_wrapper(video_path: str, thresholds: dict) -> dict:
    """Wrapper for single video processing — returns compact result dict."""
    try:
        t0 = time.time()
        result = run_v2_inference(video_path, thresholds, top_k=6)
        elapsed = time.time() - t0
        return {
            "path": video_path,
            "verdict": result[0],
            "scores": result[1],
            "elapsed": elapsed,
            "error": None,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "path": video_path,
            "verdict": f"## Error\n`{e}`",
            "scores": "",
            "elapsed": 0,
            "error": str(e),
        }


def process_videos_parallel(video_paths: list, thresholds: dict, max_workers: int = 4) -> list:
    """Process multiple videos in parallel using thread pool.

    GPU inference is sequential per thread (CUDA doesn't benefit from concurrent kernels),
    but frame reading + CPU preprocessing runs in parallel. With 4 workers:
    - Worker 1: GPU inference on video A
    - Worker 2: Reading + preprocessing frames for video B
    - Worker 3: Heuristic analysis for video C
    - Worker 4: Reading frames for video D

    This keeps the GPU fed at all times instead of waiting for I/O.
    """
    if not video_paths:
        return []

    # Pre-load models so all threads share cached models
    load_vit_models()

    results = [None] * len(video_paths)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(_process_single_video_wrapper, path, thresholds): i
            for i, path in enumerate(video_paths)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                results[idx] = {
                    "path": video_paths[idx],
                    "verdict": f"## Error\n`{e}`",
                    "scores": "",
                    "elapsed": 0,
                    "error": str(e),
                }

    # Free GPU VRAM after batch processing
    torch.cuda.empty_cache()

    return results


def _run_batch_videos(video_files, thresh_v, thresh_n, max_workers):
    """Gradio handler for batch video processing."""
    if not video_files:
        return "### No videos uploaded", ""

    # Normalize paths
    paths = []
    for f in video_files:
        p = f if isinstance(f, str) else f.get("path", "") or f.get("name", "")
        if p:
            paths.append(p)

    if not paths:
        return "### No valid video files", ""

    thresholds = {"violence": float(thresh_v), "nsfw": float(thresh_n)}
    t0 = time.time()
    results = process_videos_parallel(paths, thresholds, max_workers=int(max_workers))
    total_time = time.time() - t0

    # Build summary table
    summary_lines = [
        f"## Batch Results ({len(results)} videos, {total_time:.1f}s total)\n",
        "| # | File | Verdict | Violence | NSFW | Pattern | Time |",
        "|---|------|---------|----------|------|---------|------|",
    ]

    detail_lines = ["\n---\n## Detailed Results\n"]
    for i, r in enumerate(results):
        name = Path(r["path"]).name
        # Parse key info from score markdown
        score_text = r["scores"]
        v_peak = "?"
        n_prob = "?"
        pattern = "?"
        for line in score_text.split("\n"):
            if "Violence peak:" in line:
                parts = line.split("**")
                if len(parts) >= 2:
                    v_peak = parts[1]
            if "NSFW prob:" in line:
                parts = line.split("**")
                if len(parts) >= 2:
                    n_prob = parts[1]
            if "Spike pattern:" in line:
                parts = line.split("**")
                if len(parts) >= 2:
                    pattern = parts[1]

        verdict_short = "SAFE" if "SAFE" in r["verdict"] else "FLAGGED" if "FLAGGED" in r["verdict"] else "ERROR"
        emoji = "OK" if verdict_short == "SAFE" else "!!" if verdict_short == "FLAGGED" else "??"

        summary_lines.append(
            f"| {i+1} | `{name}` | {emoji} {verdict_short} | {v_peak} | {n_prob} | {pattern} | {r['elapsed']:.1f}s |"
        )

        detail_lines.append(f"### Video {i+1}: `{name}`")
        detail_lines.append(r["verdict"])
        detail_lines.append(r["scores"])
        detail_lines.append("")

    summary_md = "\n".join(summary_lines) + "\n" + "\n".join(detail_lines)
    throughput = len(results) / total_time if total_time > 0 else 0
    stats_md = (
        f"### Batch Statistics\n"
        f"- Videos processed: **{len(results)}**\n"
        f"- Total time: **{total_time:.1f}s**\n"
        f"- Throughput: **{throughput:.2f} videos/sec**\n"
        f"- Workers: **{int(max_workers)}**\n"
        f"- Device: **{DEVICE.type}**\n"
        f"- Errors: **{sum(1 for r in results if r['error'])}**"
    )

    return summary_md, stats_md


# ═══════════════════════════════════════════════════════════════
# GRADIO UI
# ═══════════════════════════════════════════════════════════════


with gr.Blocks(title="Video & Image Moderation (V2 MHCM-MIL)") as demo:
    gr.Markdown("# Video & Image Moderation (V2 MHCM-MIL Pipeline)")
    gr.Markdown(
        "V2 pipeline: VideoMAE-Small + Gore/NSFW ResNet teachers + MultiTaskMILModel "
        "with independent LoRA adapters. Tasks: Violence (V), NSFW (N)."
    )

    with gr.Tabs():
        # ─── VIDEO TAB ──────────────────────────────────────────────
        with gr.Tab("Video Analysis (V2)"):
            with gr.Row():
                with gr.Column(scale=1):
                    video_input = gr.Video(label="Input video", include_audio=False)
                    vid_thresh_v = gr.Slider(0.0, 1.0, value=0.5, step=0.01, label="Violence threshold")
                    vid_thresh_n = gr.Slider(0.0, 1.0, value=0.5, step=0.01, label="NSFW threshold")
                    vid_top_k = gr.Slider(2, 12, value=6, step=1, label="Top-K key frames")
                    vid_run_btn = gr.Button("Run V2 Inference", variant="primary")

                with gr.Column(scale=1):
                    vid_verdict_out = gr.Markdown()
                    vid_score_out = gr.Markdown()

            vid_timeline_out = gr.Dataframe(label="Per-frame scores", interactive=False)

            with gr.Row():
                vid_v_gallery_out = gr.Gallery(label="Top Violence frames (by attention)", columns=3, height=400)
                vid_n_gallery_out = gr.Gallery(label="Top NSFW frames (by attention)", columns=3, height=400)

            def _run_video(video, thresh_v, thresh_n, top_k):
                if not video:
                    return "### No video", "", None, [], []
                video_path = video if isinstance(video, str) else video.get("path", "")
                if not video_path:
                    return "### No video", "", None, [], []
                thresholds = {"violence": float(thresh_v), "nsfw": float(thresh_n)}
                return run_v2_inference(video_path, thresholds, int(top_k))

            vid_run_btn.click(
                fn=_run_video,
                inputs=[video_input, vid_thresh_v, vid_thresh_n, vid_top_k],
                outputs=[vid_verdict_out, vid_score_out, vid_timeline_out, vid_v_gallery_out, vid_n_gallery_out],
            )

        # ─── IMAGE TAB (ViT) ────────────────────────────────────────
        with gr.Tab("Image Analysis (ViT)"):
            with gr.Row():
                with gr.Column(scale=1):
                    image_input = gr.Image(label="Input image", type="filepath")
                    img_run_btn = gr.Button("Run Image Inference", variant="primary")

                with gr.Column(scale=1):
                    img_verdict_out = gr.Markdown()
                    img_score_out = gr.Markdown()

            with gr.Row():
                img_preview_out = gr.Image(label="Input preview", type="pil")

            img_run_btn.click(
                fn=process_image_vit,
                inputs=[image_input],
                outputs=[img_verdict_out, img_score_out, img_preview_out],
            )

        # ─── BATCH VIDEO TAB ──────────────────────────────────────
        with gr.Tab("Batch Video (Parallel)"):
            gr.Markdown("Upload multiple videos for parallel GPU processing.")
            with gr.Row():
                with gr.Column(scale=1):
                    batch_video_input = gr.File(
                        label="Upload videos", file_count="multiple",
                        file_types=["video"],
                    )
                    batch_thresh_v = gr.Slider(0.0, 1.0, value=0.5, step=0.01, label="Violence threshold")
                    batch_thresh_n = gr.Slider(0.0, 1.0, value=0.5, step=0.01, label="NSFW threshold")
                    batch_workers = gr.Slider(1, 8, value=4, step=1, label="Parallel workers")
                    batch_run_btn = gr.Button("Run Batch Inference", variant="primary")

                with gr.Column(scale=1):
                    batch_stats_out = gr.Markdown()

            batch_results_out = gr.Markdown()

            batch_run_btn.click(
                fn=_run_batch_videos,
                inputs=[batch_video_input, batch_thresh_v, batch_thresh_n, batch_workers],
                outputs=[batch_results_out, batch_stats_out],
            )


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", share=False, theme=gr.themes.Soft())
