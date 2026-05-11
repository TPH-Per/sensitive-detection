from __future__ import annotations

import argparse
import csv
import os
import sys
import random
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch
from PIL import Image
from torchvision import transforms
from tqdm import tqdm
from transformers import CLIPImageProcessor, CLIPVisionModel

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional at runtime
    YOLO = None

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.models.proxy_efficientnet import build_proxy_efficientnet


def _npy_save_atomic(path: Path, array: np.ndarray) -> None:
    """Ghi file .npy theo kiểu atomic: ghi tạm ra .tmp rồi rename.
    Nếu bị ngắt giữa chừng, file .npy gốc vẫn an toàn (không bị corrupt).
    Dùng file object để tránh numpy tự động thêm đuôi .npy vào file tạm."""
    tmp_path = path.with_name(path.name + '.tmp')
    if tmp_path.exists():
        tmp_path.unlink()
    try:
        with open(tmp_path, 'wb') as f:
            np.save(f, array)
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def _npy_load_safe(
    path: Path,
    expected_ndim: int = 2,
    expected_dtype: np.dtype | None = np.dtype('float32'),
) -> np.ndarray | None:
    """Load file .npy với kiểm tra chặt chẽ:
    - File bị corrupt (Exception) → trả về None
    - Size = 0 → None
    - ndim sai → None  (CLIP feature phải là 2D)
    - dtype sai → None  (phải là float32)
    - Chứa NaN hoặc Inf → None  (silent corrupt nguy hiểm nhất)
    """
    try:
        arr = np.load(path, allow_pickle=False)
    except Exception:
        return None
    # Fix #3: size check
    if arr.size == 0:
        return None
    # Fix #3: ndim check
    if arr.ndim != expected_ndim:
        return None
    # Fix #3: dtype check
    if expected_dtype is not None and arr.dtype != expected_dtype:
        return None
    # Fix #4: NaN / Inf check (silent corrupt cực nguy hiểm)
    if not np.isfinite(arr).all():
        return None
    return arr


def is_video(path: Path) -> bool:
    return path.suffix.lower() in {'.mp4', '.avi', '.mov', '.mkv', '.webm'}


def sample_video_frames(video_path: Path, max_frames: int) -> list[Image.Image]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []

    frames = []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        total = max_frames
    indices = np.linspace(0, max(total - 1, 0), num=max_frames, dtype=np.int32)
    index_set = set(indices.tolist())

    i = 0
    while cap.isOpened() and len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if i in index_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(rgb))
        i += 1

    cap.release()
    return frames


def load_frames(path: Path, max_frames: int) -> list[Image.Image]:
    if is_video(path):
        return sample_video_frames(path, max_frames=max_frames)
    img = Image.open(path).convert('RGB')
    return [img]


def apply_style_augmentation(frames: list[Image.Image], strength: float = 0.3) -> list[Image.Image]:
    if not frames or strength <= 0:
        return frames

    # Create a transform that adds noise/variation to the frames
    # to break domain-specific fingerprints (e.g. specific camera sensor noise or color profiles)
    tfm = transforms.Compose(
        [
            transforms.ColorJitter(
                brightness=strength,
                contrast=strength,
                saturation=strength,
                hue=strength * 0.1,
            ),
            transforms.RandomGrayscale(p=0.1),
            transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 1.2)),
        ]
    )

    return [tfm(frame) for frame in frames]


def compute_flow_features(frames: list[Image.Image]) -> np.ndarray:
    if not frames:
        return np.zeros((1, 3), dtype=np.float32)
    if len(frames) == 1:
        return np.zeros((1, 3), dtype=np.float32)

    grayscale = [
        cv2.cvtColor(np.array(frame.resize((224, 224))), cv2.COLOR_RGB2GRAY)
        for frame in frames
    ]
    flow_rows = [[0.0, 0.0, 0.0]]
    previous = grayscale[0]
    for current in grayscale[1:]:
        flow = cv2.calcOpticalFlowFarneback(previous, current, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        magnitude = np.sqrt(np.square(flow[..., 0]) + np.square(flow[..., 1]))
        flow_rows.append(
            [
                float(magnitude.mean()),
                float(magnitude.std()),
                float(np.percentile(magnitude, 90)),
            ]
        )
        previous = current

    flow_array = np.asarray(flow_rows, dtype=np.float32)
    if flow_array.size:
        max_vals = flow_array.max(axis=0, keepdims=True)
        max_vals = np.where(max_vals > 0, max_vals, 1.0)
        flow_array = flow_array / max_vals
    return flow_array


def build_yolo_aux_features(frames: list[Image.Image], yolo_model, yolo_imgsz: int) -> np.ndarray:
    if yolo_model is None or not frames:
        return np.zeros((max(len(frames), 1), 2), dtype=np.float32)

    arrays = [np.array(frame) for frame in frames]
    results = yolo_model.predict(arrays, verbose=False, imgsz=yolo_imgsz)
    rows = []
    for result in results:
        if result.boxes is None or result.boxes.conf is None or len(result.boxes.conf) == 0:
            rows.append([0.0, 0.0])
            continue

        confs = result.boxes.conf.detach().cpu().numpy().astype(np.float32)
        classes = result.boxes.cls.detach().cpu().numpy().astype(np.int32)
        risky_scores = confs[classes == 0] if (classes == 0).any() else np.asarray([], dtype=np.float32)
        medical_scores = confs[classes == 1] if (classes == 1).any() else np.asarray([], dtype=np.float32)
        rows.append(
            [
                float(risky_scores.max()) if risky_scores.size else 0.0,
                float(medical_scores.max()) if medical_scores.size else 0.0,
            ]
        )
    return np.asarray(rows, dtype=np.float32)


@torch.no_grad()
def build_nsfw_aux_features(
    frames: list[Image.Image],
    nsfw_model: torch.nn.Module | None,
    device: torch.device,
) -> np.ndarray:
    if nsfw_model is None or not frames:
        return np.zeros((max(len(frames), 1), 1), dtype=np.float32)

    mean = torch.tensor([0.485, 0.456, 0.406], dtype=torch.float32).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], dtype=torch.float32).view(1, 3, 1, 1)

    batch = []
    for frame in frames:
        arr = np.asarray(frame.resize((224, 224)), dtype=np.float32) / 255.0
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
        batch.append(tensor)
    x = torch.cat(batch, dim=0)
    x = (x - mean) / std
    x = x.to(device)
    logits = nsfw_model(x)
    probs = torch.softmax(logits, dim=1)[:, 1:2]
    return probs.detach().cpu().numpy().astype(np.float32)


def resolve_source_path(input_root: Path, row: pd.Series, path_column: str) -> Path:
    if path_column not in row or pd.isna(row[path_column]):
        raise ValueError(f'Missing path column "{path_column}" in labels row')

    raw_path = Path(str(row[path_column]))
    if raw_path.is_absolute():
        return raw_path
    return input_root / raw_path


@torch.no_grad()
def encode_frames(
    frames: list[Image.Image],
    processor: CLIPImageProcessor,
    model: CLIPVisionModel,
    device: torch.device,
    batch_size: int,
) -> np.ndarray:
    if not frames:
        return np.zeros((1, model.config.hidden_size), dtype=np.float32)

    all_cls = []
    for i in range(0, len(frames), batch_size):
        chunk = frames[i : i + batch_size]
        inputs = processor(images=chunk, return_tensors='pt')
        pixel_values = inputs['pixel_values'].to(device)
        outputs = model(pixel_values=pixel_values)
        cls = outputs.last_hidden_state[:, 0, :]
    return np.concatenate(all_cls, axis=0).astype(np.float32)


@torch.no_grad()
def encode_frames_swav(
    frames: list[Image.Image],
    model: torch.nn.Module,
    device: torch.device,
    batch_size: int,
) -> np.ndarray:
    if not frames:
        return np.zeros((1, 512), dtype=np.float32)

    mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1).to(device)
    std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1).to(device)

    all_features = []
    for i in range(0, len(frames), batch_size):
        chunk = frames[i : i + batch_size]
        batch_tensors = []
        for frame in chunk:
            arr = np.asarray(frame.resize((224, 224)), dtype=np.float32) / 255.0
            tensor = torch.from_numpy(arr).permute(2, 0, 1)
            batch_tensors.append(tensor)
        
        x = torch.stack(batch_tensors, dim=0).to(device)
        x = (x - mean) / std
        features = model(x)
        all_features.append(features.detach().cpu().numpy())

    return np.concatenate(all_features, axis=0).astype(np.float32)



def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--labels_csv', type=str, required=True)
    parser.add_argument('--input_root', type=str, required=True)
    parser.add_argument('--output_root', type=str, required=True)
    parser.add_argument('--manifest_out', type=str, required=True)
    parser.add_argument('--clip_model', type=str, default='openai/clip-vit-base-patch32')
    parser.add_argument('--extractor', type=str, choices=['clip', 'swav'], default='clip', help='Chọn model trích xuất: clip hoặc swav')
    parser.add_argument('--swav_ckpt', type=str, default=None, help='Đường dẫn đến ssl_spatial_best.pth nếu dùng swav')
    parser.add_argument('--max_frames', type=int, default=64)
    parser.add_argument('--batch_size', type=int, default=16)
    parser.add_argument('--path_column', type=str, default='relative_path')
    parser.add_argument('--feature_subdir', type=str, default='features')
    parser.add_argument('--skip_existing', action='store_true')
    parser.add_argument('--save_aux_features', action='store_true')
    parser.add_argument('--aux_subdir', type=str, default='aux_features')
    parser.add_argument('--yolo_weights', type=str, default=None)
    parser.add_argument('--yolo_imgsz', type=int, default=640)
    parser.add_argument('--nsfw_weights', type=str, default=None)
    parser.add_argument('--augment', action='store_true', help='Apply style augmentation to frames before CLIP encoding.')
    parser.add_argument('--augment_strength', type=float, default=0.3, help='Strength of style augmentation.')
    args = parser.parse_args()

    if args.extractor == 'swav' and not args.swav_ckpt:
        parser.error("--extractor swav requires --swav_ckpt")

    input_root = Path(args.input_root)
    output_root = Path(args.output_root).resolve()
    features_dir = output_root / args.feature_subdir
    features_dir.mkdir(parents=True, exist_ok=True)
    aux_dir = output_root / args.aux_subdir
    if args.save_aux_features:
        aux_dir.mkdir(parents=True, exist_ok=True)

    labels_df = pd.read_csv(args.labels_csv)
    required_cols = [args.path_column, 'violence', 'self_harm', 'nsfw']
    missing = [c for c in required_cols if c not in labels_df.columns]
    if missing:
        raise ValueError(f'Missing columns in labels_csv: {missing}')

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    if args.extractor == 'clip':
        print(f'Loading CLIP model: {args.clip_model}')
        processor = CLIPImageProcessor.from_pretrained(args.clip_model)
        model = CLIPVisionModel.from_pretrained(args.clip_model).to(device)
        model.eval()
    else:
        print(f'Loading SwAV ResNet18 model: {args.swav_ckpt}')
        from torchvision.models import resnet18
        model = resnet18(weights=None)
        state = torch.load(args.swav_ckpt, map_location=device, weights_only=False)
        model_state = state.get('model_state', state)
        new_state = {k.replace('module.', ''): v for k, v in model_state.items()}
        # Loại bỏ các key của phần projection head (để lại backbone)
        new_state = {k: v for k, v in new_state.items() if not k.startswith('projection_head')}
        model.load_state_dict(new_state, strict=False)
        model.fc = torch.nn.Identity()  # Trả về feature 512-dim thay vì classification logits
        model = model.to(device)
        model.eval()
        processor = None

    if args.yolo_weights and YOLO is None:
        raise RuntimeError('Ultralytics YOLO is not available, but --yolo_weights was provided.')
    yolo_model = YOLO(args.yolo_weights) if args.yolo_weights and YOLO is not None else None
    nsfw_model = None
    if args.nsfw_weights:
        nsfw_model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
        state = torch.load(args.nsfw_weights, map_location=device)
        model_state = state.get('model_state', state) if isinstance(state, dict) else state
        nsfw_model.load_state_dict(model_state)
        nsfw_model.eval()

    if args.augment:
        print(f'[Style Augmentation] ENABLED  strength={args.augment_strength}')
        print(f'  → Augmentation chi ap dung cho CLIP features, KHONG ap dung cho optical flow / YOLO / NSFW aux.')
    else:
        print('[Style Augmentation] DISABLED')

    rows = []
    for idx, row in tqdm(labels_df.iterrows(), total=len(labels_df), desc='Extracting CLIP features'):
        rel_path = Path(str(row[args.path_column]))
        src_path = resolve_source_path(input_root, row, args.path_column)
        sample_id = row.get('sample_id', f'sample_{idx:06d}')

        out_path = features_dir / f'{sample_id}.npy'
        aux_path = aux_dir / f'{sample_id}.npy'

        # Fix #5: Logic skip_existing chuẩn: thử load trước, nếu None thì tính lại
        original_frames = None
        feat = None
        if args.skip_existing:
            feat = _npy_load_safe(out_path)  # trả None nếu corrupt / NaN / sai shape
            if feat is None and out_path.exists():
                out_path.unlink(missing_ok=True)  # dọn file rác
        if feat is None:
            original_frames = load_frames(src_path, max_frames=args.max_frames)
            # Style augmentation chi ap dung cho CLIP features (visual diversity)
            # Optical flow, YOLO, NSFW aux luon dung frame GOC de giu tinh chinh xac
            clip_frames = apply_style_augmentation(original_frames, strength=args.augment_strength) if args.augment else original_frames
            if args.extractor == 'clip':
                feat = encode_frames(
                    frames=clip_frames,
                    processor=processor,
                    model=model,
                    device=device,
                    batch_size=args.batch_size,
                )
            else:
                feat = encode_frames_swav(
                    frames=clip_frames,
                    model=model,
                    device=device,
                    batch_size=args.batch_size,
                )
            _npy_save_atomic(out_path, feat)  # atomic write: tránh corrupt khi bị ngắt

        aux_feature_path = ''
        aux_dim = 0
        if args.save_aux_features:
            aux = None
            if args.skip_existing:
                aux = _npy_load_safe(aux_path)  # trả None nếu corrupt / NaN / sai shape
                if aux is None and aux_path.exists():
                    aux_path.unlink(missing_ok=True)  # dọn file rác
            if aux is None:
                # Aux features LUON dung original frames (khong augment)
                if original_frames is None:
                    original_frames = load_frames(src_path, max_frames=args.max_frames)
                flow_features = compute_flow_features(original_frames)
                yolo_aux = build_yolo_aux_features(original_frames, yolo_model=yolo_model, yolo_imgsz=args.yolo_imgsz)
                nsfw_aux = build_nsfw_aux_features(original_frames, nsfw_model=nsfw_model, device=device)
                target_len = max(flow_features.shape[0], yolo_aux.shape[0], nsfw_aux.shape[0])
                if flow_features.shape[0] < target_len:
                    pad = np.zeros((target_len - flow_features.shape[0], flow_features.shape[1]), dtype=np.float32)
                    flow_features = np.concatenate([flow_features, pad], axis=0)
                if yolo_aux.shape[0] < target_len:
                    pad = np.zeros((target_len - yolo_aux.shape[0], yolo_aux.shape[1]), dtype=np.float32)
                    yolo_aux = np.concatenate([yolo_aux, pad], axis=0)
                if nsfw_aux.shape[0] < target_len:
                    pad = np.zeros((target_len - nsfw_aux.shape[0], nsfw_aux.shape[1]), dtype=np.float32)
                    nsfw_aux = np.concatenate([nsfw_aux, pad], axis=0)
                aux = np.concatenate([flow_features, yolo_aux, nsfw_aux], axis=1).astype(np.float32)
                _npy_save_atomic(aux_path, aux)  # atomic write
            aux_feature_path = str(aux_path.resolve())
            aux_dim = int(aux.shape[1]) if aux.ndim == 2 else 0

        rows.append(
            {
                'sample_id': sample_id,
                'feature_path': str(out_path.resolve()),
                'aux_feature_path': aux_feature_path,
                'violence': int(row['violence']),
                'self_harm': int(row['self_harm']),
                'nsfw': int(row['nsfw']),
                'split': row.get('split', ''),
                'source': row.get('source', ''),
                'group_id': row.get('group_id', ''),
                'media_type': row.get('media_type', 'video' if is_video(src_path) else 'image'),
                'n_frames': int(feat.shape[0]),
                'feature_dim': int(feat.shape[1]),
                'aux_dim': aux_dim,
            }
        )

    manifest_path = Path(args.manifest_out)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                'sample_id',
                'feature_path',
                'aux_feature_path',
                'violence',
                'self_harm',
                'nsfw',
                'split',
                'source',
                'group_id',
                'media_type',
                'n_frames',
                'feature_dim',
                'aux_dim',
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f'Saved features to: {features_dir}')
    print(f'Saved manifest to: {manifest_path}')


if __name__ == '__main__':
    main()
