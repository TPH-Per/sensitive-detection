"""
build_features_v6.py
====================
Extracts features for Video Moderation V6.1 using TransNet V2 for shot detection.
Feature dimension per frame: 775
  - CLIP (768)
  - Flow (3)
  - YOLO (1)
  - Gore (1)
  - SelfHarm (1)  ← V6.1 NEW
  - NSFW (1)
"""

import sys
from pathlib import Path

# Add root to sys.path to allow imports
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import traceback
import csv

import numpy as np
import torch
import cv2
from PIL import Image

# Import extractors (assuming they are available in scripts or models)
from scripts.inference_local import (
    load_clip, load_yolo, compute_flow_features,
    extract_clip_features, extract_yolo_features,
)
from src.models.gore_detector import GoreDetector, get_default_transform as gore_transform
from src.models.nsfw_classifier import NSFWClassifier, nsfw_val_transform

# Try to import TransNetV2 (user needs to install it)
try:
    from transnetv2 import TransNetV2
    HAS_TRANSNET = True
except ImportError:
    HAS_TRANSNET = False
    logging.warning("TransNetV2 not installed. Will fallback to uniform sampling.")

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

_TRANSNET_WARNED = False
_UCF_CRIMES_VIOLENCE_CLASSES = {
    "abuse",
    "arrest",
    "arson",
    "assault",
    "burglary",
    "explosion",
    "fighting",
    "roadaccidents",
    "robbery",
    "shooting",
}


def infer_violence_label_from_path(video_path: Path | str) -> int:
    """
    Explicit taxonomy for Cell 5 when no seed manifest exists.

    Positive:
      - RWF-2000/Fight
      - UCF-Crimes classes: Abuse, Arrest, Arson, Assault, Burglary,
        Explosion, Fighting, RoadAccidents, Robbery, Shooting
    Negative:
      - RWF-2000/NonFight
      - UCF normal folders
      - UCF-101 classes
    """
    path = Path(video_path)
    parts = [part.lower() for part in path.parts]

    if "nonfight" in parts:
        return 0
    if "fight" in parts:
        return 1

    if any(part in _UCF_CRIMES_VIOLENCE_CLASSES for part in parts):
        return 1

    return 0


def sample_frames_transnet(video_path: Path, transnet_model=None, max_shots: int = 4, frames_per_shot: int = 16) -> list[Image.Image]:
    """
    Uses TransNet V2 to extract shots, then uniformly samples frames_per_shot from each shot.
    Falls back to uniform sampling if TransNet fails or is unavailable.
    """
    global _TRANSNET_WARNED
    if not HAS_TRANSNET or transnet_model is None:
        return _fallback_uniform_sampling(video_path, max_shots * frames_per_shot)
        
    try:
        import os, sys, contextlib
        with open(os.devnull, 'w') as f, contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
            # predict_video returns (predictions, single_frame_predictions)
            video_frames, single_frame_predictions, predictions = transnet_model.predict_video(str(video_path))
        
        # Scenes is a list of [start_frame, end_frame] indices
        scenes = transnet_model.predictions_to_scenes(predictions)
        
        if len(scenes) == 0:
            return _fallback_uniform_sampling(video_path, max_shots * frames_per_shot)
            
        # Prioritize longest scenes
        scenes_sorted = sorted(scenes, key=lambda s: s[1] - s[0], reverse=True)
        selected_scenes = scenes_sorted[:max_shots]
        
        sampled_images = []
        for start_idx, end_idx in selected_scenes:
            length = end_idx - start_idx
            if length <= 0: continue
            
            # Uniformly sample within the shot
            step = max(1, length // frames_per_shot)
            indices = list(range(start_idx, end_idx, step))[:frames_per_shot]
            
            # Pad if shot is too short
            while len(indices) < frames_per_shot:
                indices.append(indices[-1])
                
            for idx in indices:
                frame_bgr = video_frames[idx]
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                sampled_images.append(Image.fromarray(frame_rgb))
                
        # If total frames < target, pad with the last frame
        target_frames = max_shots * frames_per_shot
        while len(sampled_images) < target_frames and len(sampled_images) > 0:
            sampled_images.append(sampled_images[-1])
            
        return sampled_images
        
    except Exception as e:
        global _TRANSNET_WARNED
        if not _TRANSNET_WARNED:
            logging.warning(f"TransNetV2 extraction failed (will silently fallback for others): {e}")
            _TRANSNET_WARNED = True
        return _fallback_uniform_sampling(video_path, max_shots * frames_per_shot)


def _fallback_uniform_sampling(video_path: Path, num_frames: int) -> list[Image.Image]:
    cap = cv2.VideoCapture(str(video_path))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    if total_frames <= 0:
        return []
        
    step = max(1, total_frames // num_frames)
    indices = set(range(0, total_frames, step)[:num_frames])
    
    frames = []
    idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        if idx in indices:
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(frame_rgb))
        idx += 1
        
    cap.release()
    
    # Pad if necessary
    while 0 < len(frames) < num_frames:
        frames.append(frames[-1])
        
    return frames


@torch.no_grad()
def extract_all_features(
    video_path: Path,
    models_dict: dict,
    device: torch.device,
    gore_T: float = 1.0,
    nsfw_T: float = 1.0,
    selfharm_T: float = 1.0,
    quality_augmentor=None,   # VideoQualityAugmentor instance (chi train set)
    label: int = -1,          # Violence label: 1/0/-1 (unknown)
    aug_prob: float = 0.4,
    batch_size: int = 8,
) -> np.ndarray:
    """
    Extracts all V6.1 features for a given video.
    Returns: [T, 775] numpy array.

    Index mapping:
      0:768   CLIP
      768:771 Flow
      771:772 YOLO
      772:773 Gore
      773:774 SelfHarm (V6.1 NEW)
      774:775 NSFW
    """
    frames = sample_frames_transnet(video_path, transnet_model=models_dict.get('transnet'))
    if not frames:
        raise ValueError("Could not extract any frames from video.")

    # Quality augmentation (chi train, khong aug val/test)
    if quality_augmentor is not None and label >= 0:
        frames = quality_augmentor.augment(frames, label, aug_prob)

    T = len(frames)

    # 1. CLIP (768)
    clip_feat = extract_clip_features(
        frames, models_dict['processor'], models_dict['clip'], device, batch_size=batch_size
    )

    # 2. Flow (3)
    flow_feat = compute_flow_features(frames)

    # 3. YOLO (1)
    yolo_full = extract_yolo_features(frames, models_dict['yolo'])
    yolo_feat = yolo_full[:, 0:1] if yolo_full.ndim > 1 else np.zeros((T, 1))

    # 4. Gore (1) — V_pool, co Temperature Scaling
    gore_tensors = torch.stack([gore_transform(is_train=False)(img) for img in frames]).to(device)
    with torch.no_grad():
        gore_logits  = models_dict['gore'](gore_tensors)
    gore_probs   = torch.sigmoid(gore_logits / gore_T).cpu().numpy()  # [T, 1]

    # 5. SelfHarm (1) V6.1 — S_pool teacher moi
    selfharm_probs = np.zeros((T, 1), dtype=np.float32)  # fallback
    if 'selfharm' in models_dict and models_dict['selfharm'] is not None:
        from src.models.selfharm_detector import selfharm_val_transform
        sh_tensors    = torch.stack([selfharm_val_transform()(img) for img in frames]).to(device)
        with torch.no_grad():
            sh_logits     = models_dict['selfharm'](sh_tensors)
        selfharm_probs = torch.sigmoid(sh_logits / selfharm_T).cpu().numpy()  # [T, 1]

    # 6. NSFW (1) — N_pool, co Temperature Scaling
    from src.models.nsfw_classifier import nsfw_val_transform
    nsfw_tensors = torch.stack([nsfw_val_transform()(img) for img in frames]).to(device)
    with torch.no_grad():
        nsfw_logits  = models_dict['nsfw'](nsfw_tensors)
    nsfw_probs   = torch.sigmoid(nsfw_logits / nsfw_T).cpu().numpy()  # [T, 1]

    # Pad all features to T frames
    feats = [clip_feat, flow_feat, yolo_feat, gore_probs, selfharm_probs, nsfw_probs]
    padded = []
    for f in feats:
        if f.shape[0] < T:
            pad = np.zeros((T - f.shape[0], f.shape[1]), dtype=np.float32)
            padded.append(np.concatenate([f, pad], axis=0))
        elif f.shape[0] > T:
            padded.append(f[:T])
        else:
            padded.append(f)

    final_feat = np.concatenate(padded, axis=1).astype(np.float32)
    assert final_feat.shape == (T, 775), f"Expected [T, 775], got {final_feat.shape}"
    return final_feat


def validate_npy(npy_path: Path) -> bool:
    data = np.load(npy_path)
    T, D = data.shape
    assert D == 775, f"Expected 775 dims (V6.1), got {D}"
    assert T >= 1, "Empty feature file"
    assert not np.isnan(data).any(), "NaN detected"
    assert not np.isinf(data).any(), "Inf detected"
    assert data[:, :768].std() > 0, "CLIP features entirely zero"
    assert data[:, 772].std() > 0.001, "Gore features flat"
    assert data[:, 773].std() > 0.001, "SelfHarm features flat (V6.1)"
    assert data[:, 774].std() > 0.001, "NSFW features flat"
    return True


def sample_ucf101(ucf101_dir: Path, n: int = 1200) -> list:
    """
    Sample n videos từ UCF-101, đều từng class.
    101 classes × (n//101) videos/class.
    """
    import random
    from collections import defaultdict

    all_videos = list(ucf101_dir.rglob("*.avi"))
    by_class = defaultdict(list)
    for p in all_videos:
        cls = p.parent.name
        by_class[cls].append(p)

    if n <= 0 or len(by_class) == 0:
        return all_videos

    per_class = max(1, n // len(by_class))
    sampled = []
    for cls, videos in by_class.items():
        random.shuffle(videos)
        sampled.extend(videos[:per_class])

    random.shuffle(sampled)
    logging.info(f"UCF-101 sampled: {len(sampled)}/{len(all_videos)} videos "
                 f"({len(by_class)} classes × {per_class}/class)")
    return sampled


def validate_features(output_dir: str):
    import random
    import glob
    npy_files = glob.glob(f"{output_dir}/*.npy")
    logging.info(f"\nTotal .npy files: {len(npy_files)}")
    if not npy_files: return

    sample_files = random.sample(npy_files, min(20, len(npy_files)))
    dims, has_nan, has_inf = [], 0, 0
    expert_stds = {k: [] for k in ["gore","selfharm","nsfw"]}

    for f in sample_files:
        arr = np.load(f)
        dims.append(arr.shape[1])
        if np.isnan(arr).any(): has_nan += 1
        if np.isinf(arr).any(): has_inf += 1
        expert_stds["gore"].append(arr[:,772].std())
        expert_stds["selfharm"].append(arr[:,773].std())
        expert_stds["nsfw"].append(arr[:,774].std())

    logging.info(f"Dim check:   {set(dims)} (expected {{775}})")
    logging.info(f"NaN files:   {has_nan}")
    logging.info(f"Inf files:   {has_inf}")
    for k, v in expert_stds.items():
        mean_std = sum(v)/len(v)
        status = "OK" if mean_std > 0.01 else "WARN low variance"
        logging.info(f"{k} std:   {mean_std:.4f} [{status}]")


def main():
    parser = argparse.ArgumentParser(description="Extract V6.0 features for Video Moderation")
    parser.add_argument('--video_dirs', nargs='+', required=True, help='Paths to video directories')
    parser.add_argument('--output_dir', required=True, help='Where to save .npy features')
    parser.add_argument('--yolo_weight', required=True)
    parser.add_argument('--gore_weight', required=True)
    parser.add_argument('--nsfw_weight', required=True)
    parser.add_argument('--batch_size', type=int, default=32)
    parser.add_argument('--device', default='cuda' if torch.cuda.is_available() else 'cpu')
    parser.add_argument('--gore_T',      type=float, default=1.0, help='Temperature scaling cho Gore')
    parser.add_argument('--nsfw_T',      type=float, default=1.0, help='Temperature scaling cho NSFW')
    parser.add_argument('--selfharm_T',  type=float, default=1.0, help='Temperature scaling cho SelfHarm')
    parser.add_argument('--selfharm_weight', required=True, help='SelfHarmDetector weight (V6.1)')
    parser.add_argument('--quality_aug', action='store_true', help='Bat VideoQualityAugmentor (chi train set)')
    parser.add_argument('--aug_prob',    type=float, default=0.4)
    parser.add_argument('--skip_existing', action='store_true')
    parser.add_argument('--ucf101_sample_n', type=int, default=1200, help='Sample N videos tu UCF-101')
    args = parser.parse_args()

    device     = torch.device(args.device)
    output_root = Path(args.output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    manifest_rows = []
    manifest_path = output_root / "features_manifest.csv"

    def _normalize_video_path(path_str: str) -> str:
        return str(path_str).replace('\\', '/')

    label_map = {}
    split_map = {}
    if manifest_path.exists():
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    vpath = (row.get('video_path') or '').strip()
                    if not vpath:
                        continue
                    label_str = (row.get('label_violence') or '').strip()
                    if label_str == '':
                        inferred_label = infer_violence_label_from_path(vpath)
                        label_map[_normalize_video_path(vpath)] = inferred_label
                    else:
                        try:
                            label_map[_normalize_video_path(vpath)] = int(label_str)
                        except ValueError:
                            label_map[_normalize_video_path(vpath)] = infer_violence_label_from_path(vpath)

                    split_str = (row.get('split') or '').strip().lower()
                    if split_str:
                        split_map[_normalize_video_path(vpath)] = split_str
            logging.info("Loaded %d labels from existing features_manifest.csv", len(label_map))
        except Exception as e:
            logging.warning("Failed to load features_manifest.csv (%s). Falling back to path taxonomy inference.", e)
    else:
        logging.info("No features_manifest.csv found. Using explicit path taxonomy inference for label_violence.")

    # Quality Augmentor (chi dung khi --quality_aug, va chi cho train set)
    quality_augmentor = None
    if args.quality_aug:
        if not split_map:
            logging.warning(
                "quality_aug requested but no split metadata was found in features_manifest.csv. "
                "Disabling quality augmentation to avoid contaminating val/test before Cell 6 split."
            )
        else:
            from src.data.video_augmentor import VideoQualityAugmentor
            quality_augmentor = VideoQualityAugmentor()
            logging.info("VideoQualityAugmentor ENABLED for split=train only (aug_prob=%.2f)", args.aug_prob)
    else:
        logging.info("VideoQualityAugmentor DISABLED (val/test mode)")

    # 1. Load Models
    logging.info(f"Loading models onto {device}...")
    
    gore_model = GoreDetector(unfreeze_from_layer=0)
    gore_state = torch.load(args.gore_weight, map_location='cpu', weights_only=False)
    if 'model_state' in gore_state: gore_state = gore_state['model_state']
    gore_model.load_state_dict(gore_state)
    gore_model = gore_model.to(device)
    gore_model.eval()
    
    nsfw_model = NSFWClassifier(unfreeze_from_layer=0)
    nsfw_state = torch.load(args.nsfw_weight, map_location='cpu', weights_only=False)
    if 'model_state' in nsfw_state: nsfw_state = nsfw_state['model_state']
    
    if any(k.startswith('head.') for k in nsfw_state.keys()):
        nsfw_model.load_state_dict(nsfw_state, strict=False)
    else:
        nsfw_model.head.load_state_dict(nsfw_state)
    nsfw_model = nsfw_model.to(device)
    nsfw_model.eval()

    from src.models.selfharm_detector import SelfHarmDetector
    sh_model = SelfHarmDetector(unfreeze_from_layer=0)
    sh_ckpt  = torch.load(args.selfharm_weight, map_location='cpu', weights_only=False)
    sh_state = sh_ckpt.get('model_state', sh_ckpt)
    sh_model.load_state_dict(sh_state)
    sh_model = sh_model.to(device)
    sh_model.eval()

    transnet_model = None
    if HAS_TRANSNET:
        import os, sys, contextlib
        with open(os.devnull, 'w') as f, contextlib.redirect_stdout(f), contextlib.redirect_stderr(f):
            transnet_model = TransNetV2()

    clip_processor, clip_model = load_clip(device)
    models = {
        'processor': clip_processor,
        'clip':      clip_model,
        'yolo':      load_yolo(args.yolo_weight),
        'gore':      gore_model,
        'nsfw':      nsfw_model,
        'selfharm':  sh_model,
        'transnet':  transnet_model,
    }

    for m in models.values():
        if m is not None and hasattr(m, 'eval'): m.eval()

    # 2. Collect Videos
    video_extensions = ('.mp4', '.avi', '.mov', '.mkv')
    all_videos = []
    for d in args.video_dirs:
        d_path = Path(d)
        if not d_path.exists():
            logging.warning(f"Directory {d} does not exist. Skipping.")
            continue
            
        path_str = str(d_path).lower()
        if ('ucf-101' in path_str or 'ucf101' in path_str) and args.ucf101_sample_n > 0:
            logging.info(f"Applying sampling to UCF-101 dataset: {d_path}")
            sampled = sample_ucf101(d_path, args.ucf101_sample_n)
            all_videos.extend(sampled)
        else:
            for ext in video_extensions:
                all_videos.extend(list(d_path.rglob(f"*{ext}")))
    
    logging.info(f"Found {len(all_videos)} videos across {len(args.video_dirs)} directories.")

    # 3. Extraction Loop
    success_cnt = 0
    fail_cnt = 0
    
    from tqdm import tqdm
    pbar = tqdm(all_videos, desc="Extracting features", dynamic_ncols=True)
    for video_path in pbar:
        # Create output path maintaining structure or using hash? 
        # Using stem + hash of path to avoid collisions
        import hashlib
        path_hash = hashlib.md5(str(video_path).encode()).hexdigest()[:8]
        out_name = f"{video_path.stem}_{path_hash}.npy"
        out_path = output_root / out_name

        label = label_map.get(_normalize_video_path(str(video_path)))
        if label is None:
            label = infer_violence_label_from_path(video_path)
        split_name = split_map.get(_normalize_video_path(str(video_path)), '')

        manifest_row = {
            "feature_path": out_name,
            "video_path": str(video_path),
            "label_violence": int(label),
        }
        if split_name:
            manifest_row["split"] = split_name

        if args.skip_existing and out_path.exists():
            manifest_rows.append(manifest_row)
            continue

        try:
            feat = extract_all_features(
                video_path, models, device,
                args.gore_T, args.nsfw_T, args.selfharm_T,
                quality_augmentor if split_name == 'train' else None, label, args.aug_prob,
                args.batch_size,
            )
            np.save(out_path, feat)
            success_cnt += 1
            manifest_rows.append(manifest_row)
        except Exception as e:
            logging.error(f"Failed {video_path.name}: {e}")
            fail_cnt += 1
            
    logging.info(f"\nExtraction complete: {success_cnt} success, {fail_cnt} failed.")
    logging.info(f"Features saved to {args.output_dir}")
    if manifest_rows:
        with open(manifest_path, 'w', newline='', encoding='utf-8') as f:
            fieldnames = ["feature_path", "video_path", "label_violence"]
            if any("split" in row for row in manifest_rows):
                fieldnames.append("split")
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(manifest_rows)
        logging.info(f"Feature manifest saved to {manifest_path}")
    
    validate_features(str(output_root))


if __name__ == "__main__":
    main()
