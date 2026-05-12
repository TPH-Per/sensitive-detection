"""
Inference Pipeline — Chạy trên máy local (RTX 4050 6GB)
========================================================
Đưa video .mp4 vào → Nhận kết quả kiểm duyệt (Violence / Self-harm / NSFW)

Cách dùng:
  python scripts/inference_local.py --video path/to/video.mp4
  python scripts/inference_local.py --video path/to/video.mp4 --no-proxy   # Bỏ qua proxy gate
  python scripts/inference_local.py --folder path/to/videos/              # Chạy cả thư mục
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
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Đường dẫn mặc định đến thư mục trọng số
WEIGHTS_DIR = ROOT / "trong_so"

# ═══════════════════════════════════════════════════════════════
# 1. TIỆN ÍCH VIDEO
# ═══════════════════════════════════════════════════════════════

def sample_video_frames(video_path: Path, max_frames: int = 64) -> list[Image.Image]:
    """Lấy mẫu đều max_frames khung hình từ video."""
    # Resolve về absolute path để tránh nhầm lẫn CWD
    video_path = video_path.resolve()
    if not video_path.exists():
        raise FileNotFoundError(
            f"Không tìm thấy file video!\n"
            f"  Đường dẫn đang tìm: {video_path}\n"
            f"  Hãy dùng đường dẫn đầy đủ, ví dụ:\n"
            f"  python scripts/inference_local.py --video \"D:\\path\\to\\video.mp4\""
        )
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"OpenCV không thể mở video (file có thể bị hỏng): {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    duration = total / fps if fps > 0 else 0

    if total <= 0:
        total = max_frames
    indices = set(np.linspace(0, max(total - 1, 0), num=max_frames, dtype=np.int32).tolist())

    frames = []
    i = 0
    while cap.isOpened() and len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if i in indices:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(rgb))
        i += 1
    cap.release()

    return frames


def compute_flow_features(frames: list[Image.Image]) -> np.ndarray:
    """Tính Optical Flow features (mean, std, p90) cho từng cặp frame."""
    if len(frames) <= 1:
        return np.zeros((max(len(frames), 1), 3), dtype=np.float32)

    grayscale = [
        cv2.cvtColor(np.array(f.resize((224, 224))), cv2.COLOR_RGB2GRAY)
        for f in frames
    ]
    rows = [[0.0, 0.0, 0.0]]
    prev = grayscale[0]
    for curr in grayscale[1:]:
        flow = cv2.calcOpticalFlowFarneback(prev, curr, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
        rows.append([float(mag.mean()), float(mag.std()), float(np.percentile(mag, 90))])
        prev = curr

    arr = np.array(rows, dtype=np.float32)
    max_vals = arr.max(axis=0, keepdims=True)
    max_vals = np.where(max_vals > 0, max_vals, 1.0)
    return arr / max_vals


# ═══════════════════════════════════════════════════════════════
# 2. LOADER CÁC MODEL
# ═══════════════════════════════════════════════════════════════

def load_clip(device: torch.device):
    """Load CLIP ViT-B/32."""
    from transformers import CLIPImageProcessor, CLIPVisionModel
    print("  [CLIP] Dang tai CLIP ViT-B/32...")
    processor = CLIPImageProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model = CLIPVisionModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
    model.eval()
    return processor, model


def load_yolo(weights_path):
    """Load YOLOv8 detector."""
    weights_path = Path(weights_path)
    if not weights_path.exists():
        print(f"  [WARN]  YOLO weights không tìm thấy: {weights_path} → Bỏ qua")
        return None
    try:
        from ultralytics import YOLO
        print(f"  [YOLO] Đang tải YOLO: {weights_path.name}")
        return YOLO(str(weights_path))
    except ImportError:
        print("  [WARN]  ultralytics chưa cài → Bỏ qua YOLO")
        return None


def load_nsfw_scorer(weights_path, device: torch.device):
    """Load NSFW scorer (EfficientNet)."""
    weights_path = Path(weights_path)
    if not weights_path.exists():
        print(f"  [WARN]  NSFW scorer weights không tìm thấy → Bỏ qua")
        return None
    from src.models.proxy_efficientnet import build_proxy_efficientnet
    print(f"  [NSFW] Đang tải NSFW Scorer: {weights_path.name}")
    model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
    state = torch.load(weights_path, map_location=device, weights_only=False)
    model.load_state_dict(state.get("model_state", state))
    model.eval()
    return model


def load_proxy(weights_path, device: torch.device):
    """Load Proxy EfficientNet."""
    weights_path = Path(weights_path)
    if not weights_path.exists():
        print(f"  [WARN]  Proxy weights không tìm thấy → Bỏ qua proxy gate")
        return None
    from src.models.proxy_efficientnet import build_proxy_efficientnet
    print(f"  [PROXY]  Đang tải Proxy: {weights_path.name}")
    model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
    state = torch.load(weights_path, map_location=device, weights_only=False)
    model.load_state_dict(state.get("model_state", state))
    model.eval()
    return model


def _infer_ff_dim_from_checkpoint(model_state: dict) -> int:
    """Tự động phát hiện ff_dim từ trọng số checkpoint để tránh mismatch."""
    key = "frame_encoder.layers.0.linear1.weight"
    if key in model_state:
        return model_state[key].shape[0]  # [ff_dim, d_model]
    # Fallback: thử cross_blocks
    key2 = "cross_blocks.0.mlp.0.weight"
    if key2 in model_state:
        return model_state[key2].shape[0]
    return 3072  # default: 768 * 4


def load_multitask_model(weights_path: Path, device: torch.device, input_dim: int = 768):
    """Load TaskPromptedTemporalModel — tự detect ff_dim từ checkpoint."""
    from src.models.task_prompted_model import TaskPromptedTemporalModel
    print(f"  [MODEL] Đang tải Model chính: {weights_path.name} ({weights_path.stat().st_size / 1e6:.0f} MB)")
    state = torch.load(weights_path, map_location=device, weights_only=False)
    model_state = state.get("model_state", state)

    # Tự phát hiện ff_dim thực tế từ checkpoint
    ff_dim = _infer_ff_dim_from_checkpoint(model_state)
    print(f"     → Detected ff_dim={ff_dim} từ checkpoint")

    model = TaskPromptedTemporalModel(
        input_dim=input_dim, aux_dim=6, d_model=768,
        n_heads=8, n_layers=4, ff_dim=ff_dim,
        dropout=0.2, max_frames=64, qformer_layers=2,
    ).to(device)
    model.load_state_dict(model_state, strict=True)
    model.eval()
    return model


# ═══════════════════════════════════════════════════════════════
# 3. TRÍCH XUẤT ĐẶC TRƯNG
# ═══════════════════════════════════════════════════════════════

@torch.no_grad()
def extract_clip_features(frames, processor, clip_model, device, batch_size=8):
    """Trích xuất CLIP CLS tokens cho từng frame."""
    if not frames:
        return np.zeros((1, 768), dtype=np.float32)
    all_cls = []
    for i in range(0, len(frames), batch_size):
        chunk = frames[i:i + batch_size]
        inputs = processor(images=chunk, return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(device)
        outputs = clip_model(pixel_values=pixel_values)
        cls = outputs.last_hidden_state[:, 0, :]
        all_cls.append(cls.cpu().numpy())
    return np.concatenate(all_cls, axis=0).astype(np.float32)


@torch.no_grad()
def extract_yolo_features(frames, yolo_model):
    """Trích xuất YOLO weapon/medical detection scores."""
    if yolo_model is None or not frames:
        return np.zeros((max(len(frames), 1), 2), dtype=np.float32)
    arrays = [np.array(f) for f in frames]
    results = yolo_model.predict(arrays, verbose=False, imgsz=640)
    rows = []
    for r in results:
        if r.boxes is None or len(r.boxes.conf) == 0:
            rows.append([0.0, 0.0])
            continue
        confs = r.boxes.conf.cpu().numpy()
        classes = r.boxes.cls.cpu().numpy().astype(int)
        risky = confs[classes == 0].max() if (classes == 0).any() else 0.0
        medical = confs[classes == 1].max() if (classes == 1).any() else 0.0
        rows.append([float(risky), float(medical)])
    return np.array(rows, dtype=np.float32)


@torch.no_grad()
def extract_nsfw_features(frames, nsfw_model, device):
    """Trích xuất NSFW probability scores."""
    if nsfw_model is None or not frames:
        return np.zeros((max(len(frames), 1), 1), dtype=np.float32)
    mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
    batch = []
    for f in frames:
        arr = np.array(f.resize((224, 224)), dtype=np.float32) / 255.0
        t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
        batch.append(t)
    x = torch.cat(batch, 0)
    x = (x - mean) / std
    x = x.to(device)
    logits = nsfw_model(x)
    probs = torch.softmax(logits, dim=1)[:, 1:2]
    return probs.cpu().numpy().astype(np.float32)


@torch.no_grad()
def proxy_score(proxy_model, frames, device):
    """Tính proxy risky probability."""
    if proxy_model is None or not frames:
        return 1.0  # Nếu không có proxy → luôn pass
    from torchvision import transforms
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    x = torch.stack([transform(f) for f in frames[:8]], dim=0).to(device)
    logits = proxy_model(x)
    probs = torch.softmax(logits, dim=1)[:, 1]
    return float(probs.mean().item())


# ═══════════════════════════════════════════════════════════════
# 4. PIPELINE CHÍNH
# ═══════════════════════════════════════════════════════════════

def pad_to_match(arrays: list[np.ndarray]) -> list[np.ndarray]:
    """Pad tất cả arrays về cùng số hàng (frames)."""
    max_len = max(a.shape[0] for a in arrays)
    result = []
    for a in arrays:
        if a.shape[0] < max_len:
            pad = np.zeros((max_len - a.shape[0], a.shape[1]), dtype=np.float32)
            a = np.concatenate([a, pad], axis=0)
        result.append(a)
    return result


def run_inference(video_path: Path, models: dict, device: torch.device,
                  thresholds: dict, use_proxy: bool = True,
                  proxy_threshold: float = 0.2, debug: bool = False,
                  extractor: str = "clip") -> dict:
    """Chạy toàn bộ pipeline cho 1 video."""
    t0 = time.time()

    # Bước 1: Đọc video
    frames = sample_video_frames(video_path, max_frames=64)
    if not frames:
        return {"video": str(video_path), "error": "Không đọc được frame nào"}
    if debug:
        print(f"\n  [DEBUG] {len(frames)} frames đọc được")

    # Bước 2: Proxy Gate (lọc nhanh video an toàn)
    risky_prob = proxy_score(models.get("proxy"), frames, device)
    passed_proxy = (not use_proxy) or (risky_prob >= proxy_threshold)
    if debug:
        print(f"  [DEBUG] Proxy score: {risky_prob:.4f} → {'PASS [OK]' if passed_proxy else 'FILTERED [ERR]'}")

    if not passed_proxy:
        return {
            "video": str(video_path),
            "proxy_score": round(risky_prob, 4),
            "verdict": "SAFE",
            "reason": f"Proxy gate lọc: {risky_prob:.4f} < {proxy_threshold}",
            "time_seconds": round(time.time() - t0, 2),
        }

    # Bước 3: Trích xuất đặc trưng
    if extractor == "clip":
        clip_feat = extract_clip_features(frames, models["clip_processor"], models["clip_model"], device)
    else:
        from scripts.build_clip_features import encode_frames_swav
        clip_feat = encode_frames_swav(frames, models["swav"], device, batch_size=8)
        
    flow_feat = compute_flow_features(frames)
    yolo_feat = extract_yolo_features(frames, models.get("yolo"))
    nsfw_feat = extract_nsfw_features(frames, models.get("nsfw_scorer"), device)

    if debug:
        print(f"  [DEBUG] NSFW scorer output (mean): {nsfw_feat.mean():.4f}  (max: {nsfw_feat.max():.4f})")
        print(f"  [DEBUG] YOLO risky (max): {yolo_feat[:, 0].max():.4f}")
        print(f"  [DEBUG] Flow magnitude (mean): {flow_feat[:, 0].mean():.4f}")
        print(f"  [DEBUG] CLIP norm (mean): {np.linalg.norm(clip_feat, axis=1).mean():.2f}")

    # Bước 4: Ghép aux features (flow=3 + yolo=2 + nsfw=1 = 6)
    clip_feat, flow_feat, yolo_feat, nsfw_feat = pad_to_match([clip_feat, flow_feat, yolo_feat, nsfw_feat])
    aux = np.concatenate([flow_feat, yolo_feat, nsfw_feat], axis=1).astype(np.float32)

    # Bước 5: Chạy model chính
    with torch.no_grad():
        x = torch.tensor(clip_feat, dtype=torch.float32).unsqueeze(0).to(device)
        aux_t = torch.tensor(aux, dtype=torch.float32).unsqueeze(0).to(device)
        logits = models["multitask"](x, aux=aux_t)
        probs = torch.sigmoid(logits)[0].cpu().numpy()

    if debug:
        print(f"  [DEBUG] Raw logits: V={float(logits[0][0]):.3f} S={float(logits[0][1]):.3f} N={float(logits[0][2]):.3f}")
        print(f"  [DEBUG] Probs:      V={probs[0]:.4f} S={probs[1]:.4f} N={probs[2]:.4f}")
        print(f"  [DEBUG] Thresholds: V={thresholds.get('violence', 0.5):.4f} "
              f"S={thresholds.get('self_harm', 0.5):.4f} "
              f"N={thresholds.get('nsfw', 0.5):.4f}")

    scores = {
        "violence": round(float(probs[0]), 4),
        "self_harm": round(float(probs[1]), 4),
        "nsfw": round(float(probs[2]), 4),
    }

    # ══════════════════════════════════════════════════════════════

    # Bước 6: EXPERT VALIDATION — Sửa lỗi "Shared Feature Pool"
    # ══════════════════════════════════════════════════════════════
    # Vấn đề kiến trúc: Tất cả aux features (Flow, YOLO, NSFW) bị MIX
    # vào chung 1 bộ frame_tokens → 3 tokens V/S/N đều nhìn thấy hết.
    # Giải pháp: Dùng chính aux features làm "chuyên gia" kiểm tra chéo.
    #
    # Nguyên tắc:
    #   - Nếu chuyên gia nói "KHÔNG" mà model nói "CÓ" → Suppress (giảm)
    #   - Nếu chuyên gia nói "CÓ" mà model nói "KHÔNG" → Boost (tăng)
    # ══════════════════════════════════════════════════════════════

    clip_norm_mean = float(np.linalg.norm(clip_feat, axis=1).mean())
    nsfw_scorer_max = float(nsfw_feat.max())
    nsfw_scorer_mean = float(nsfw_feat.mean())
    yolo_weapon_max = float(yolo_feat[:, 0].max())
    flow_mean = float(flow_feat[:, 0].mean())

    if debug:
        print(f"  [EXPERT] Aux signals: nsfw_max={nsfw_scorer_max:.3f} yolo={yolo_weapon_max:.3f} flow={flow_mean:.3f} clip_norm={clip_norm_mean:.2f}")

    raw_scores = dict(scores)      # Bản gốc từ model chính
    model_raw_n = scores["nsfw"]   # Score N thuần từ model (trước bất kỳ boost nào)
    n_was_boosted = False          # Cờ: Expert có boost N không?

    # ── N TOKEN ------------------------------------------------------------
    # nsfw_scorer là Proxy Risky Detector (không phải NSFW-only):
    # → Chỉ dùng scorer để BOOST N khi V model output THẤP
    # → Điều này an toàn vì nếu V thấp, scorer cao chứng tỏ NSFW thật
    # → Nếu V cao, scorer có thể báo nhầm do gore/máu → KHÔNG boost
    if nsfw_scorer_max < 0.15 and scores["nsfw"] > 0.15:
        # Scorer cực thấp: nội dung rõ ràng sạch → suppress model confusion
        scores["nsfw"] = round(scores["nsfw"] * 0.25, 4)
        if debug:
            print(f"  [EXPERT] N SUPPRESSED (scorer quá thấp): {raw_scores['nsfw']:.4f} → {scores['nsfw']:.4f}")

    elif nsfw_scorer_max > 0.6 and scores["violence"] < 0.4:
        # Scorer cao + model dự báo V thấp → NSFW thật, không phải gore
        boosted = max(scores["nsfw"], nsfw_scorer_max * 0.8)
        if boosted > scores["nsfw"]:
            scores["nsfw"] = round(boosted, 4)
            n_was_boosted = True
            if debug:
                print(f"  [EXPERT] N BOOSTED (NSFW thật, V thấp): {raw_scores['nsfw']:.4f} → {scores['nsfw']:.4f}")

    elif nsfw_scorer_max > 0.6 and scores["violence"] >= 0.4:
        if debug:
            print(f"  [EXPERT] N boost SKIPPED: V={scores['violence']:.3f}≥0.4 → scorer đang báo gore/máu")

    # ── Chống nhiễu chéo N←V ------------------------------------------──
    # Vấn đề: V cao → frame_tokens bị "màu V" → N token bị nhiễu lên
    # Nguyên tắc QUAN TRỌNG:
    #   - Nếu N score cao là do Expert BOOST (n_was_boosted=True) → rollback
    #   - Nếu N score cao là do model TỰ OUTPUT → GIỮ NGUYÊN (V+N đồng thời)
    # Trường hợp V+N: video vừa bạo lực vừa nhạy cảm → PHẢI báo cả 2
    if scores["violence"] > 0.5 and n_was_boosted:
        # Expert đã boost N nhưng V lại cao → boost đó sai (gore, không phải NSFW)
        scores["nsfw"] = round(model_raw_n, 4)  # Rollback về output gốc của model
        if debug:
            print(f"  [EXPERT] N ROLLBACK: V={scores['violence']:.3f}>0.5 và N đã bị boost sai → restore {model_raw_n:.4f}")
    elif scores["violence"] > 0.5 and not n_was_boosted and scores["nsfw"] > thresholds.get("nsfw", 0.24):
        # Model TỰ output N cao khi V cũng cao → đây là V+N đồng thời, giữ nguyên
        if debug:
            print(f"  [EXPERT] V+N SIMULTANEOUS: V={scores['violence']:.3f}>0.5 và N={scores['nsfw']:.3f} (model tự output) → GIỮ CẢ 2")

    # ── V TOKEN ------------------------------------------------------------
    has_strong_motion = flow_mean > 0.15
    has_very_strong_motion = flow_mean > 0.35   # Gore/action mạnh
    has_weapons = yolo_weapon_max > 0.3

    if not has_strong_motion and not has_weapons:
        # Không có chuyển động + không có vũ khí → suppress V nếu model confused
        if scores["violence"] > 0.2:
            scores["violence"] = round(scores["violence"] * 0.3, 4)
            if debug:
                print(f"  [EXPERT] V SUPPRESSED (no motion, no weapon): {raw_scores['violence']:.4f} → {scores['violence']:.4f}")

    elif has_weapons and scores["violence"] < 0.3:
        # Có vũ khí nhưng model bỏ sót → boost V
        boosted_v = max(scores["violence"], yolo_weapon_max * 0.65)
        scores["violence"] = round(boosted_v, 4)
        if debug:
            print(f"  [EXPERT] V BOOSTED (weapon detected): {raw_scores['violence']:.4f} → {scores['violence']:.4f}")

    elif has_very_strong_motion and not has_weapons and nsfw_scorer_max < 0.3 and scores["violence"] > 0.28:
        # Flow rất mạnh + không có vũ khí rõ ràng + không phải NSFW
        # → gore/máu không có vũ khí nhìn thấy (chém, bắn không thấy súng/dao)
        # Model lẽ ra phải nhận ra nhưng yếu vì YOLO=0 → boost nhẹ
        boosted_v = min(scores["violence"] + flow_mean * 0.25, 0.85)
        if boosted_v > scores["violence"]:
            scores["violence"] = round(boosted_v, 4)
            if debug:
                print(f"  [EXPERT] V BOOSTED (high flow, gore-without-weapon): flow={flow_mean:.3f} → {raw_scores['violence']:.4f} → {scores['violence']:.4f}")


    # ── S TOKEN ------------------------------------------------------------
    yolo_medical_max = float(yolo_feat[:, 1].max())  # Class 1: Y tế / Hành vi tự hại (treo cổ, v.v.)

    if yolo_medical_max > 0.3 and scores["self_harm"] < 0.4:
        # Chuyên gia (YOLO) phát hiện vật thể liên quan tự hại nhưng model bỏ sót → boost S
        boosted_s = max(scores["self_harm"], yolo_medical_max * 0.7)
        scores["self_harm"] = round(boosted_s, 4)
        if debug:
            print(f"  [EXPERT] S BOOSTED (medical/self-harm object detected): yolo_cls1={yolo_medical_max:.3f} → {raw_scores['self_harm']:.4f} → {scores['self_harm']:.4f}")

    # Chống nhiễu chéo V → S: Chỉ suppress khi V chiếm ưu thế hoàn toàn và không có vật thể tự hại
    if scores["violence"] > 0.6 and scores["self_harm"] > 0.25 and raw_scores["self_harm"] < 0.4 and yolo_medical_max < 0.2:
        scores["self_harm"] = round(scores["self_harm"] * 0.4, 4)
        if debug:
            print(f"  [EXPERT] S SUPPRESSED (V contamination): {raw_scores['self_harm']:.4f} → {scores['self_harm']:.4f}")

    if debug and scores != raw_scores:
        print(f"  [EXPERT] Final: V={scores['violence']:.4f} S={scores['self_harm']:.4f} N={scores['nsfw']:.4f}")


    flags = {
        "violence": scores["violence"] >= thresholds.get("violence", 0.5),
        "self_harm": scores["self_harm"] >= thresholds.get("self_harm", 0.5),
        "nsfw": scores["nsfw"] >= thresholds.get("nsfw", 0.5),
    }


    any_flagged = any(flags.values())
    flagged_labels = [k for k, v in flags.items() if v]

    return {
        "video": str(video_path),
        "proxy_score": round(risky_prob, 4),
        "scores": scores,
        "thresholds": {k: round(v, 4) for k, v in thresholds.items()},
        "flags": flags,
        "verdict": "FLAGGED" if any_flagged else "SAFE",
        "flagged_labels": flagged_labels,
        "n_frames": len(frames),
        "time_seconds": round(time.time() - t0, 2),
    }


# ═══════════════════════════════════════════════════════════════
# 5. MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Video Moderation Inference (Local)")
    parser.add_argument("--video", type=str, help="Đường dẫn đến 1 video")
    parser.add_argument("--folder", type=str, help="Đường dẫn đến thư mục chứa nhiều video")
    parser.add_argument("--weights_dir", type=str, default=str(WEIGHTS_DIR), help="Thư mục chứa trọng số")
    parser.add_argument("--no-proxy", action="store_true", help="Bỏ qua Proxy Gate")
    parser.add_argument("--output", type=str, default=None, help="Lưu kết quả JSON")
    parser.add_argument("--debug", action="store_true", help="In raw scores từng bước để debug")
    parser.add_argument("--nsfw-threshold", type=float, default=None, help="Override ngưỡng NSFW (0.0-1.0)")
    parser.add_argument("--extractor", type=str, choices=["clip", "swav"], default="clip", help="Chọn model trích xuất: clip hoặc swav")
    args = parser.parse_args()

    if not args.video and not args.folder:
        parser.error("Cần truyền --video hoặc --folder")

    weights_dir = Path(args.weights_dir)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    # Tải ngưỡng tối ưu từ Cell 18b (thresholds/thresholds_FINAL.json)
    thresholds_file = ROOT / "thresholds" / "thresholds_FINAL.json"
    if thresholds_file.exists():
        import json as _json
        payload = _json.loads(thresholds_file.read_text(encoding="utf-8"))
        # Ưu tiên recommended_thresholds (từ f2-calibration của Cell 18b)
        thresholds = payload.get("recommended_thresholds", {})
        print(f"  [OPT] Đã tải ngưỡng tối ưu Cell 18b: {thresholds_file.name}")
    else:
        # Fallback hardcode nếu không có file
        thresholds = {
            "violence": 0.3447,
            "self_harm": 0.9263,
            "nsfw": 0.2394,
        }
        print("  [WARN]  Không tìm thấy thresholds_FINAL.json → dùng giá trị mặc định")

    # Cho phép override ngưỡng NSFW từ CLI
    if args.nsfw_threshold is not None:
        thresholds["nsfw"] = args.nsfw_threshold
        print(f"  [CFG]  Override NSFW threshold = {args.nsfw_threshold}")

    if args.debug:
        print(f"  [DBG] DEBUG MODE: In raw scores từng bước")
        print(f"  [INFO] Ngưỡng hiện tại: V={thresholds.get('violence', '?'):.4f} "
              f"S={thresholds.get('self_harm', '?'):.4f} "
              f"N={thresholds.get('nsfw', '?'):.4f}")

    print("=" * 60)

    print("  [VIDEO] VIDEO MODERATION SYSTEM v5.2")
    print("=" * 60)
    print(f"  Device: {device}")
    print(f"  Weights: {weights_dir}")
    print()

    # Load tất cả models
    print("[LOAD] Đang tải các model...")
    models = {}
    if args.extractor == "clip":
        clip_processor, clip_model = load_clip(device)
        models["clip_processor"] = clip_processor
        models["clip_model"] = clip_model
        input_dim = 768
        multitask_name = "model_best_FINAL.pth"
    else:
        from torchvision.models import resnet18
        swav_model = resnet18(weights=None)
        swav_ckpt = weights_dir / "ssl_spatial_best.pth"
        print(f"  [SwAV] Dang tai SwAV ResNet18: {swav_ckpt.name}")
        if swav_ckpt.exists():
            state = torch.load(swav_ckpt, map_location=device, weights_only=False)
            model_state = state.get('model_state', state)
            new_state = {k.replace('module.', ''): v for k, v in model_state.items()}
            new_state = {k: v for k, v in new_state.items() if not k.startswith('projection_head')}
            swav_model.load_state_dict(new_state, strict=False)
        swav_model.fc = torch.nn.Identity()
        swav_model = swav_model.to(device)
        swav_model.eval()
        models["swav"] = swav_model
        models["clip_processor"] = None
        models["clip_model"] = None
        input_dim = 512
        multitask_name = "model_best_FINAL_swav.pth"
        
    models["yolo"] = load_yolo(weights_dir / "yolov8n_weapons_best.pt")
    models["nsfw_scorer"] = load_nsfw_scorer(weights_dir / "nsfw_scorer_best.pth", device)
    models["proxy"] = load_proxy(weights_dir / "proxy_efficientnet_best.pth", device) if not args.no_proxy else None
    
    mt_path = weights_dir / multitask_name
    if not mt_path.exists():
        print(f"\n[ERR] LỖI: Không tìm thấy file {mt_path}.")
        print(f"   Bạn cần dùng lệnh sau để trích xuất đặc trưng mới:")
        print(f"   python scripts/build_clip_features.py --extractor swav --swav_ckpt {swav_ckpt}")
        print(f"   Sau đó chạy lại Cell 17 và 18 trên Kaggle để có được file trọng số này.")
        sys.exit(1)
        
    models["multitask"] = load_multitask_model(mt_path, device, input_dim=input_dim)

    # Giải phóng bớt VRAM bằng cách chuyển sang eval + half precision
    torch.cuda.empty_cache()
    print(f"\n[OK] Tất cả model đã tải xong!")
    if torch.cuda.is_available():
        mem = torch.cuda.memory_allocated() / 1e9
        print(f"  [STAT] VRAM đang dùng: {mem:.2f} GB / 6 GB\n")

    # Thu thập danh sách video
    video_exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}
    videos = []
    if args.video:
        videos.append(Path(args.video))
    if args.folder:
        folder = Path(args.folder)
        videos.extend(sorted(p for p in folder.iterdir() if p.suffix.lower() in video_exts))

    if not videos:
        print("[ERR] Không tìm thấy video nào!")
        return

    print(f"[VID] Đang xử lý {len(videos)} video...\n")

    results = []
    for idx, vp in enumerate(videos, 1):
        print(f"--- [{idx}/{len(videos)}] {vp.name} ", end="", flush=True)
        try:
            result = run_inference(vp, models, device, thresholds,
                                   use_proxy=not args.no_proxy,
                                   debug=args.debug,
                                   extractor=args.extractor)
            results.append(result)

            v = result.get("verdict", "?")
            symbol = "[VIOL]" if v == "FLAGGED" else "[SAFE]"
            detail = ""
            if "scores" in result:
                s = result["scores"]
                detail = f" V={s['violence']:.2f} S={s['self_harm']:.2f} N={s['nsfw']:.2f}"
            print(f"→ {symbol} {v}{detail} ({result.get('time_seconds', 0)}s)")

        except Exception as e:
            print(f"→ [ERR] Lỗi: {e}")
            results.append({"video": str(vp), "error": str(e)})

    # Tổng kết
    print(f"\n{'=' * 60}")
    flagged = sum(1 for r in results if r.get("verdict") == "FLAGGED")
    safe = sum(1 for r in results if r.get("verdict") == "SAFE")
    errors = sum(1 for r in results if "error" in r)
    print(f"  [STAT] Tổng kết: {len(results)} video")
    print(f"     [VIOL] Vi phạm: {flagged}")
    print(f"     [SAFE] An toàn:  {safe}")
    if errors:
        print(f"     [ERR] Lỗi:     {errors}")
    print(f"{'=' * 60}")

    # Lưu kết quả
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\n[SAVE] Kết quả đã lưu: {out_path}")


if __name__ == "__main__":
    main()
