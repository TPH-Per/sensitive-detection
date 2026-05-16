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

from src.models.mil_v2 import MultiTaskMILModel
from src.models.v2_videomae_encoder import VideoMAESmallEncoder
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


def load_v2_models():
    """Load V2 pipeline models: VideoMAE encoder + main MIL model.
    ViT teachers are loaded separately via load_vit_models().
    """
    if MODEL_CACHE.get("v2_loaded", False):
        return

    print("[LOAD] Loading V2 pipeline models...")

    # 1. VideoMAE encoder
    print(f"  [VideoMAE] Loading {VIDEOMAE_CHECKPOINT}...")
    encoder = VideoMAESmallEncoder(
        checkpoint=VIDEOMAE_CHECKPOINT, device=DEVICE, frozen=True
    )

    # 2. Main MIL model
    model_path = ARTIFACTS_DIR / WEIGHT_FILES["model"]
    print(f"  [MIL] Loading {model_path.name}...")
    mil_model = MultiTaskMILModel(
        dim=V2_FEATURE_DIM,
        attn_dim=V2_ATTN_DIM,
        lora_rank=V2_LORA_RANK,
        lora_alpha=V2_LORA_ALPHA,
        lora_dropout=V2_LORA_DROPOUT,
    ).to(DEVICE)
    state = torch.load(model_path, map_location=DEVICE, weights_only=False)
    if isinstance(state, dict) and "model" in state and isinstance(state["model"], dict):
        state = state["model"]
    elif isinstance(state, dict) and "model_state" in state:
        state = state["model_state"]
    elif isinstance(state, dict) and "model_state_dict" in state:
        state = state["model_state_dict"]

    if not state:
        print("  [WARNING] Loaded empty state dict. This is a dummy weight.")
    else:
        mil_model.load_state_dict(state, strict=True)
        
    mil_model.eval()

    # 3. Load LoRA-only checkpoint (optional — merges into model)
    lora_path = ARTIFACTS_DIR / WEIGHT_FILES["lora"]
    if lora_path.exists():
        print(f"  [LoRA] Loading {lora_path.name}...")
        lora_state = torch.load(lora_path, map_location=DEVICE, weights_only=False)
        if isinstance(lora_state, dict):
            mil_model.load_state_dict(lora_state, strict=False)

    MODEL_CACHE.update({
        "v2_loaded": True,
        "encoder": encoder,
        "mil": mil_model,
    })
    print("[OK] V2 models loaded (VideoMAE + MIL). ViT teachers loaded on first use.")


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
    """Run V2 MHCM-MIL pipeline on a video."""
    t0 = time.time()
    load_v2_models()

    encoder = MODEL_CACHE["encoder"]
    mil_model = MODEL_CACHE["mil"]

    # 1. Read video frames
    frames_tensor = read_video_frames(video_path, V2_SAMPLING_FRAMES, V2_IMAGE_SIZE)

    # 2. Extract VideoMAE features
    features_np = encoder.encode_sequence(
        frames=frames_tensor,
        clip_frames=V2_CLIP_FRAMES,
        clip_stride=V2_CLIP_STRIDE,
        target_frames=V2_NUM_FRAMES,
    )

    # 3. Run ViT teachers (replaces ResNet gore/NSFW)
    gore_scores_raw, nsfw_scores_raw = run_vit_on_frames(frames_tensor)

    # Resample teacher scores to match model's num_frames
    gore_scores_resampled = _resample_1d(gore_scores_raw, V2_NUM_FRAMES)
    nsfw_scores_resampled = _resample_1d(nsfw_scores_raw, V2_NUM_FRAMES)
    aux_np = np.stack([gore_scores_resampled, nsfw_scores_resampled], axis=1).astype(np.float32)

    # 4. Run MIL model (for attention visualization only)
    feats_t = torch.from_numpy(features_np).unsqueeze(0).to(DEVICE)
    aux_t = torch.from_numpy(aux_np).unsqueeze(0).to(DEVICE)
    out = mil_model(feats_t, aux_t)

    v_attn = out["v_attn"].squeeze(0).squeeze(-1).cpu().numpy().astype(np.float32)
    n_attn = out["n_attn"].squeeze(0).squeeze(-1).cpu().numpy().astype(np.float32)

    # 5. CLIP activity context: classify peak violence frames as sports or violence
    top_k_indices = np.argsort(gore_scores_raw)[-6:]  # top 6 highest violence frames
    peak_frames_pil = []
    for idx in top_k_indices:
        frame_np = (
            frames_tensor[idx].permute(1, 2, 0).cpu().numpy().clip(0, 1) * 255
        ).astype(np.uint8)
        peak_frames_pil.append(Image.fromarray(frame_np))

    activity = get_activity_classifier().classify(peak_frames_pil)

    # Apply context-aware suppression to violence scores
    gore_scores_suppressed = gore_scores_raw * activity["suppress_factor"]
    v_peak_raw = float(gore_scores_raw.max())
    v_peak = float(gore_scores_suppressed.max())

    # 6. Final verdict using ViT scores + CLIP context
    thresh_v = thresholds.get("violence", 0.5)
    thresh_n = thresholds.get("nsfw", 0.5)

    # Violence: peak (suppressed) ViT score + multi-frame requirement
    v_high_frames_raw = int(np.sum(gore_scores_raw > 0.7))
    v_high_frames = int(np.sum(gore_scores_suppressed > 0.7))
    v_prob = v_peak
    v_flag = (v_peak >= thresh_v) and (v_high_frames >= 2)

    # NSFW: use MIL model output with ban/blur thresholds
    n_prob = float(torch.sigmoid(out["n_logit"]).squeeze(0).item())
    n_action = "safe"
    if n_prob >= 0.80:
        n_action = "ban"
    elif n_prob >= 0.70:
        n_action = "blur"
    n_flag = n_action != "safe"

    verdict_flags = []
    if v_flag:
        verdict_flags.append("Violence")
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
            f"suppress={activity['suppress_factor']:.2f})"
        )
    elif activity["violence_confidence"] > activity["sports_confidence"]:
        context_info = (
            f"\n- **Violence context confirmed** "
            f"(violence_p={1 - activity['sports_probability']:.2f})"
        )
    score_md = (
        "### V2 Pipeline (ViT + CLIP context)\n"
        f"- Violence peak: **{v_prob:.4f}** (raw={v_peak_raw:.4f}, threshold={thresh_v:.4f}) {'FLAGGED' if v_flag else 'OK'}\n"
        f"- NSFW prob: **{n_prob:.4f}** → {n_action.upper()} (ban>=0.80, blur>=0.70)\n"
        f"- V peak frame: **{int(np.argmax(v_attn_clipped))}** (attn={v_attn_clipped.max():.4f})\n"
        f"- N peak frame: **{int(np.argmax(n_attn_clipped))}** (attn={n_attn_clipped.max():.4f})\n"
        f"- ViT violence max: **{v_peak_raw:.4f}** | ViT NSFW max: **{nsfw_scores_raw.max():.4f}**\n"
        f"- V high frames (>0.7): **{v_high_frames}** raw={v_high_frames_raw} (need >=2 to flag)\n"
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


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7870, share=False, theme=gr.themes.Soft())
