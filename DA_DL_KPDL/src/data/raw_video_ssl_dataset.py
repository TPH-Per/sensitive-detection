"""
raw_video_ssl_dataset.py
Dataset for temporal SSL pretext tasks trained on raw video frames.

Pretext tasks:
  - Direction prediction: forward (0) vs reversed (1)
  - Speed prediction: 1x (0) vs 2x subsampled (1)
  - Temporal shuffle detection: ordered (0) vs group-shuffled (1)

Sampling strategy:
  - Sample 32 consecutive frames from a random start position
  - For 1x speed: take every frame  → 16 frames
  - For 2x speed: take every other frame → 16 frames
  - Resize each frame to frame_size x frame_size (default 112)
  - Normalise with ImageNet mean/std
"""
from __future__ import annotations

import random
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

# ImageNet statistics
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# Number of "groups" for shuffle task (splits 16 frames into groups of 4)
_N_GROUPS = 4


def _normalise(frame_bgr: np.ndarray, size: int) -> np.ndarray:
    """Resize → RGB → float32 → normalise."""
    frame = cv2.resize(frame_bgr, (size, size), interpolation=cv2.INTER_LINEAR)
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    frame = (frame - _MEAN) / _STD
    return frame  # (H, W, 3)


def _load_frames(video_path: Path, n_frames: int = 16, frame_size: int = 112) -> Optional[np.ndarray]:
    """
    Load n_frames consecutive raw frames from a video.
    Returns ndarray of shape (n_frames, H, W, 3) or None on failure.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    need = n_frames * 2  # *2 because speed-2x needs 2n consecutive frames

    if total <= 0:
        cap.release()
        return None

    # Random start so model sees different parts across epochs
    if total >= need:
        start = random.randint(0, total - need)
    else:
        start = 0

    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    raw = []
    attempts = 0
    while len(raw) < need and attempts < need + 10:
        ret, frame = cap.read()
        attempts += 1
        if not ret:
            break
        raw.append(_normalise(frame, frame_size))

    cap.release()

    if len(raw) == 0:
        return None

    # Pad by looping if video is shorter than needed
    while len(raw) < need:
        raw.extend(raw[:max(1, need - len(raw))])

    arr = np.stack(raw[:need], axis=0)  # (need, H, W, 3)
    return arr


def _apply_hflip(frames: np.ndarray) -> np.ndarray:
    """Random horizontal flip applied to all frames consistently."""
    if random.random() < 0.5:
        return frames[:, :, ::-1, :].copy()
    return frames


def _build_sample(frames_raw: np.ndarray, n_frames: int = 16) -> dict:
    """
    Given frames_raw of shape (2*n_frames, H, W, 3), build all pretext targets.

    Returns dict with keys:
      frames_1x  [n_frames, 3, H, W]  – original speed
      frames_2x  [n_frames, 3, H, W]  – 2x speed (every other frame)
      y_direction  int  0=forward 1=reversed
      y_speed      int  0=1x      1=2x
      y_shuffle    int  0=ordered 1=shuffled
    """
    need = n_frames * 2
    frames_raw = frames_raw[:need]

    # Apply consistent horizontal flip for augmentation
    frames_raw = _apply_hflip(frames_raw)

    # 1x clip: first n_frames
    clip_1x = frames_raw[:n_frames]
    # 2x clip: every other frame from the full window
    clip_2x = frames_raw[::2][:n_frames]

    # ---- Direction task (apply to 1x clip) ----
    reverse = random.random() < 0.5
    clip_direction = clip_1x[::-1].copy() if reverse else clip_1x.copy()
    y_direction = int(reverse)

    # ---- Speed task ----
    # Present either 1x or 2x and predict which
    use_2x = random.random() < 0.5
    clip_speed = clip_2x.copy() if use_2x else clip_1x.copy()
    y_speed = int(use_2x)

    # ---- Shuffle task (group-level, NOT frame-level) ----
    # Split n_frames into _N_GROUPS groups, shuffle group order
    group_size = n_frames // _N_GROUPS
    groups = [clip_1x[i * group_size:(i + 1) * group_size] for i in range(_N_GROUPS)]
    do_shuffle = random.random() < 0.5
    if do_shuffle:
        shuffled_order = list(range(_N_GROUPS))
        random.shuffle(shuffled_order)
        # Ensure it's actually a different order
        while shuffled_order == list(range(_N_GROUPS)):
            random.shuffle(shuffled_order)
        groups_out = [groups[i] for i in shuffled_order]
    else:
        groups_out = groups
    clip_shuffle = np.concatenate(groups_out, axis=0)
    y_shuffle = int(do_shuffle)

    def to_tensor(clip: np.ndarray) -> torch.Tensor:
        # clip: (T, H, W, 3) → (T, 3, H, W)
        t = torch.from_numpy(clip.astype(np.float32))
        return t.permute(0, 3, 1, 2).contiguous()

    return {
        'frames_direction': to_tensor(clip_direction),  # [T, 3, H, W]
        'frames_speed':     to_tensor(clip_speed),      # [T, 3, H, W]
        'frames_shuffle':   to_tensor(clip_shuffle),    # [T, 3, H, W]
        'y_direction': torch.tensor(float(y_direction), dtype=torch.float),
        'y_speed':     torch.tensor(float(y_speed),     dtype=torch.float),
        'y_shuffle':   torch.tensor(float(y_shuffle),   dtype=torch.float),
    }


class RawVideoSSLDataset(Dataset):
    """
    Dataset that loads raw video frames for temporal SSL pretext training.

    Labels CSV must contain at minimum:
      - relative_path  : relative path from data_root to the video file
      - media_type     : 'video' rows are kept; 'image' rows are skipped

    Args:
        labels_csv  : path to labels_temporal_{split}.csv
        data_root   : root directory on Kaggle (/kaggle/input)
        n_frames    : number of frames per clip (default 16)
        frame_size  : resize dimension in pixels (default 112)
        max_samples : optional cap on dataset size for debugging
    """

    def __init__(
        self,
        labels_csv: Path,
        data_root: Path,
        n_frames: int = 16,
        frame_size: int = 112,
        max_samples: Optional[int] = None,
    ) -> None:
        self.data_root  = Path(data_root)
        self.n_frames   = n_frames
        self.frame_size = frame_size

        df = pd.read_csv(labels_csv)
        # Keep only video rows
        if 'media_type' in df.columns:
            df = df[df['media_type'] == 'video'].reset_index(drop=True)

        if max_samples and max_samples > 0:
            df = df.head(max_samples)

        self.paths: list[Path] = []
        for rel in df['relative_path']:
            p = self.data_root / rel
            if p.exists():
                self.paths.append(p)

        if not self.paths:
            raise RuntimeError(
                f'RawVideoSSLDataset: no valid video files found.\n'
                f'  labels_csv : {labels_csv}\n'
                f'  data_root  : {data_root}\n'
                f'  Total rows : {len(df)}'
            )

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, idx: int) -> dict:
        video_path = self.paths[idx]
        frames_raw = _load_frames(video_path, n_frames=self.n_frames, frame_size=self.frame_size)

        if frames_raw is None:
            # Fallback: return zero tensors so the batch doesn't crash
            zero = torch.zeros(self.n_frames, 3, self.frame_size, self.frame_size)
            return {
                'frames_direction': zero,
                'frames_speed':     zero,
                'frames_shuffle':   zero,
                'y_direction': torch.tensor(0.0, dtype=torch.float),
                'y_speed':     torch.tensor(0.0, dtype=torch.float),
                'y_shuffle':   torch.tensor(0.0, dtype=torch.float),
            }

        return _build_sample(frames_raw, n_frames=self.n_frames)
