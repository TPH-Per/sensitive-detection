from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms
from transformers import CLIPImageProcessor, CLIPVisionModel

try:
    from transnetv2_pytorch import TransNetV2
except Exception:  # pragma: no cover - optional runtime dependency
    TransNetV2 = None

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional runtime dependency
    YOLO = None

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from _common import load_yaml
from build_clip_features import build_nsfw_aux_features, build_yolo_aux_features, compute_flow_features, encode_frames
from src.models.proxy_efficientnet import build_proxy_efficientnet
from src.models.task_prompted_model import TaskPromptedTemporalModel
from src.training.engine import _load_model_weights_flexible
from src.utils.thresholds import load_threshold_map


def video_metadata(video_path: Path) -> dict[str, float]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise FileNotFoundError(f'Unable to open video: {video_path}')
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    cap.release()
    duration = total_frames / fps if fps > 0 else 0.0
    return {'total_frames': total_frames, 'fps': fps, 'duration': duration}


def fallback_single_scene(meta: dict[str, float]) -> list[dict]:
    total_frames = int(meta['total_frames'])
    fps = float(meta['fps'])
    duration = float(meta['duration'])
    end_frame = max(total_frames - 1, 0)
    return [
        {
            'shot_id': 0,
            'start_frame': 0,
            'end_frame': end_frame,
            'start_time': 0.0,
            'end_time': duration if duration > 0 else 0.0,
            'backend': 'fallback_single_scene',
        }
    ]


def normalize_scene(scene, fps: float, shot_id: int) -> dict | None:
    if isinstance(scene, dict):
        start_time = float(scene.get('start_time', 0.0))
        end_time = float(scene.get('end_time', start_time))
        start_frame = int(scene.get('start_frame', round(start_time * fps)))
        end_frame = int(scene.get('end_frame', round(end_time * fps)))
        return {
            'shot_id': int(scene.get('shot_id', shot_id)),
            'start_frame': start_frame,
            'end_frame': max(end_frame, start_frame),
            'start_time': start_time,
            'end_time': end_time,
            'backend': 'transnetv2',
        }

    if isinstance(scene, (tuple, list)) and len(scene) >= 2:
        start_raw, end_raw = scene[0], scene[1]
        if isinstance(start_raw, (int, np.integer)) and isinstance(end_raw, (int, np.integer)):
            start_frame = int(start_raw)
            end_frame = int(end_raw)
            return {
                'shot_id': shot_id,
                'start_frame': start_frame,
                'end_frame': max(end_frame, start_frame),
                'start_time': start_frame / fps if fps > 0 else 0.0,
                'end_time': end_frame / fps if fps > 0 else 0.0,
                'backend': 'transnetv2',
            }
        start_time = float(start_raw)
        end_time = float(end_raw)
        return {
            'shot_id': shot_id,
            'start_frame': int(round(start_time * fps)) if fps > 0 else 0,
            'end_frame': int(round(end_time * fps)) if fps > 0 else 0,
            'start_time': start_time,
            'end_time': end_time,
            'backend': 'transnetv2',
        }

    return None


def detect_scenes(video_path: Path, meta: dict[str, float], use_transnet: bool) -> tuple[list[dict], list[str]]:
    warnings = []
    if not use_transnet:
        return fallback_single_scene(meta), warnings
    if TransNetV2 is None:
        warnings.append('transnetv2_pytorch is not installed. Falling back to a single-scene video.')
        return fallback_single_scene(meta), warnings

    try:
        model = TransNetV2()
        raw_scenes = model.detect_scenes(str(video_path))
        normalized = []
        for idx, scene in enumerate(raw_scenes):
            item = normalize_scene(scene, fps=float(meta['fps']), shot_id=idx)
            if item is not None:
                normalized.append(item)
        if normalized:
            return normalized, warnings
        warnings.append('TransNetV2 returned no scenes. Falling back to a single-scene video.')
    except Exception as exc:  # pragma: no cover - runtime fallback
        warnings.append(f'TransNetV2 failed ({exc}). Falling back to a single-scene video.')
    return fallback_single_scene(meta), warnings


def sample_video_frames_range(video_path: Path, start_frame: int, end_frame: int, max_frames: int) -> list[Image.Image]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []

    start_frame = max(int(start_frame), 0)
    end_frame = max(int(end_frame), start_frame)
    total = max(end_frame - start_frame + 1, 1)
    indices = np.linspace(start_frame, end_frame, num=max_frames, dtype=np.int32)
    index_set = set(indices.tolist())

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    frames = []
    current_frame = start_frame
    while cap.isOpened() and current_frame <= end_frame and len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if current_frame in index_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(rgb))
        current_frame += 1

    cap.release()
    return frames


def load_proxy_model(checkpoint_path: Path, device: torch.device) -> torch.nn.Module:
    model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
    state = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(state['model_state'] if isinstance(state, dict) and 'model_state' in state else state)
    model.eval()
    return model


def build_temporal_model(config: dict, aux_dim: int | None, max_frames: int, device: torch.device) -> TaskPromptedTemporalModel:
    model_cfg = config.get('model', {})
    if aux_dim is None:
        aux_dim = int(model_cfg.get('aux_dim', 0))
    return TaskPromptedTemporalModel(
        input_dim=int(model_cfg.get('input_dim', 768)),
        aux_dim=aux_dim,
        d_model=int(model_cfg.get('d_model', 768)),
        n_heads=int(model_cfg.get('n_heads', 8)),
        n_layers=int(model_cfg.get('n_layers', model_cfg.get('temporal_layers', 4))),
        ff_dim=int(model_cfg.get('ff_dim', int(model_cfg.get('d_model', 768)) * 4)),
        dropout=float(model_cfg.get('dropout', 0.1)),
        max_frames=max_frames,
        qformer_layers=int(model_cfg.get('qformer_layers', 2)),
    ).to(device)


def load_temporal_model(config_path: Path, checkpoint_path: Path, aux_dim: int | None, max_frames: int, device: torch.device) -> torch.nn.Module:
    config = load_yaml(str(config_path))
    model = build_temporal_model(config=config, aux_dim=aux_dim, max_frames=max_frames, device=device)
    state = torch.load(checkpoint_path, map_location=device)
    checkpoint_state = state.get('model_state', state) if isinstance(state, dict) else state
    if isinstance(checkpoint_state, dict):
        try:
            model.load_state_dict(checkpoint_state)
        except RuntimeError:
            _load_model_weights_flexible(model, checkpoint_state)
    model.eval()
    return model


def proxy_score(proxy_model: torch.nn.Module, frames: list[Image.Image], device: torch.device) -> float:
    if not frames:
        return 0.0
    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    x = torch.stack([transform(frame) for frame in frames], dim=0).to(device)
    logits = proxy_model(x)
    probs = torch.softmax(logits, dim=1)[:, 1]
    return float(probs.mean().item())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, default='configs/inference.yaml')
    parser.add_argument('--video_path', type=str, required=True)
    parser.add_argument('--output_root', type=str, default='/kaggle/working/artifacts')
    parser.add_argument('--proxy_config', type=str, default='/kaggle/working/artifacts/runtime_configs/proxy_efficientnet_kaggle.yaml')
    parser.add_argument('--proxy_checkpoint', type=str, default='/kaggle/working/artifacts/checkpoints/proxy_efficientnet_best.pth')
    parser.add_argument('--temporal_config', type=str, default='/kaggle/working/artifacts/runtime_configs/finetune_multitask_kaggle.yaml')
    parser.add_argument('--temporal_checkpoint', type=str, default='/kaggle/working/artifacts/checkpoints/finetune_multitask_best.pth')
    parser.add_argument('--yolo_weights', type=str, default='/kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt')
    parser.add_argument('--nsfw_weights', type=str, default='/kaggle/working/artifacts/checkpoints/nsfw_scorer_best.pth')
    parser.add_argument('--thresholds_json', type=str, default=None, help='Optional JSON file with calibrated per-label thresholds.')
    args = parser.parse_args()

    config = load_yaml(args.config)
    output_root = Path(args.output_root).resolve()
    video_path = Path(args.video_path)
    output_root.mkdir(parents=True, exist_ok=True)

    thresholds_json = args.thresholds_json or config.get('thresholds_json')
    thresholds = load_threshold_map(thresholds_json, config.get('thresholds', {}))
    inference_cfg = config.get('inference', {})
    scene_cfg = config.get('scene_cut', {})

    max_frames = int(inference_cfg.get('max_frames', 64))
    proxy_frame_count = int(inference_cfg.get('proxy_frames', 8))
    use_proxy_gate = bool(inference_cfg.get('use_proxy_gate', True))
    proxy_threshold = float(inference_cfg.get('proxy_threshold', 0.2))
    use_transnet = bool(scene_cfg.get('enabled', True))

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    meta = video_metadata(video_path)
    scenes, warnings = detect_scenes(video_path=video_path, meta=meta, use_transnet=use_transnet)

    proxy_model = load_proxy_model(Path(args.proxy_checkpoint), device=device)

    processor = CLIPImageProcessor.from_pretrained('openai/clip-vit-base-patch32')
    clip_model = CLIPVisionModel.from_pretrained('openai/clip-vit-base-patch32').to(device)
    clip_model.eval()

    yolo_model = YOLO(args.yolo_weights) if args.yolo_weights and Path(args.yolo_weights).exists() and YOLO is not None else None
    nsfw_model = None
    if args.nsfw_weights and Path(args.nsfw_weights).exists():
        nsfw_model = build_proxy_efficientnet(num_classes=2, pretrained=False).to(device)
        state = torch.load(args.nsfw_weights, map_location=device)
        nsfw_state = state.get('model_state', state) if isinstance(state, dict) else state
        nsfw_model.load_state_dict(nsfw_state)
        nsfw_model.eval()

    temporal_model = load_temporal_model(
        config_path=Path(args.temporal_config),
        checkpoint_path=Path(args.temporal_checkpoint),
        aux_dim=None,
        max_frames=max_frames,
        device=device,
    )

    results = []
    for idx, scene in enumerate(scenes):
        frames = sample_video_frames_range(
            video_path=video_path,
            start_frame=int(scene['start_frame']),
            end_frame=int(scene['end_frame']),
            max_frames=max_frames,
        )
        proxy_frames = frames[:proxy_frame_count] if len(frames) >= proxy_frame_count else frames
        risky_prob = proxy_score(proxy_model, proxy_frames, device=device)
        passed_proxy_gate = (not use_proxy_gate) or (risky_prob >= proxy_threshold)

        item = {
            'scene_id': int(scene.get('shot_id', idx)),
            'start_frame': int(scene['start_frame']),
            'end_frame': int(scene['end_frame']),
            'start_time': float(scene['start_time']),
            'end_time': float(scene['end_time']),
            'proxy_risky_prob': risky_prob,
            'passed_proxy_gate': bool(passed_proxy_gate),
            'backend': scene.get('backend', 'unknown'),
        }

        if passed_proxy_gate and frames:
            with torch.no_grad():
                feature_array = encode_frames(frames, processor=processor, model=clip_model, device=device, batch_size=16)
                flow_features = compute_flow_features(frames)
                yolo_aux = build_yolo_aux_features(frames, yolo_model=yolo_model, yolo_imgsz=int(inference_cfg.get('yolo_imgsz', 640)))
                nsfw_aux = build_nsfw_aux_features(frames, nsfw_model=nsfw_model, device=device)

                target_len = max(feature_array.shape[0], flow_features.shape[0], yolo_aux.shape[0], nsfw_aux.shape[0])
                if feature_array.shape[0] < target_len:
                    pad = np.zeros((target_len - feature_array.shape[0], feature_array.shape[1]), dtype=np.float32)
                    feature_array = np.concatenate([feature_array, pad], axis=0)
                if flow_features.shape[0] < target_len:
                    pad = np.zeros((target_len - flow_features.shape[0], flow_features.shape[1]), dtype=np.float32)
                    flow_features = np.concatenate([flow_features, pad], axis=0)
                if yolo_aux.shape[0] < target_len:
                    pad = np.zeros((target_len - yolo_aux.shape[0], yolo_aux.shape[1]), dtype=np.float32)
                    yolo_aux = np.concatenate([yolo_aux, pad], axis=0)
                if nsfw_aux.shape[0] < target_len:
                    pad = np.zeros((target_len - nsfw_aux.shape[0], nsfw_aux.shape[1]), dtype=np.float32)
                    nsfw_aux = np.concatenate([nsfw_aux, pad], axis=0)

                aux_array = np.concatenate([flow_features, yolo_aux, nsfw_aux], axis=1).astype(np.float32)
                x = torch.tensor(feature_array, dtype=torch.float32).unsqueeze(0).to(device)
                aux = torch.tensor(aux_array, dtype=torch.float32).unsqueeze(0).to(device)
                logits = temporal_model(x, aux=aux)
                probs = torch.sigmoid(logits)[0].detach().cpu().numpy()

            scores = {
                'violence': float(probs[0]),
                'self_harm': float(probs[1]),
                'nsfw': float(probs[2]),
            }
            flags = {
                'violence': scores['violence'] >= float(thresholds.get('violence', 0.5)),
                'self_harm': scores['self_harm'] >= float(thresholds.get('self_harm', 0.45)),
                'nsfw': scores['nsfw'] >= float(thresholds.get('nsfw', 0.6)),
            }
            item['scores'] = scores
            item['flags'] = flags
        else:
            item['scores'] = {}
            item['flags'] = {}

        results.append(item)

    payload = {
        'video_path': str(video_path),
        'scene_count': len(results),
        'warnings': warnings,
        'scenes': results,
    }
    output_path = output_root / f'{video_path.stem}_inference.json'
    output_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(json.dumps({'output_json': str(output_path), 'scene_count': len(results), 'warnings': warnings}, indent=2))


if __name__ == '__main__':
    main()
