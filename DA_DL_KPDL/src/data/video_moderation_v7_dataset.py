from __future__ import annotations

import math
import random
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


def _resolve_path(path_str: str, base_dir: Path) -> Path:
    p = Path(str(path_str).strip())
    if p.is_absolute():
        return p
    return (base_dir / p).resolve()


def _sample_indices(total_frames: int, n_frames: int, is_train: bool) -> list[int]:
    if total_frames <= 0:
        return [0] * n_frames

    if total_frames <= n_frames:
        base = np.linspace(0, max(total_frames - 1, 0), num=n_frames, dtype=np.int32)
        return base.tolist()

    if is_train:
        max_start = total_frames - n_frames
        start = random.randint(0, max_start)
        return list(range(start, start + n_frames))

    base = np.linspace(0, total_frames - 1, num=n_frames, dtype=np.int32)
    return base.tolist()


def _read_video_frames(
    video_path: Path,
    n_frames: int,
    image_size: int,
    is_train: bool,
) -> np.ndarray:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return np.zeros((n_frames, image_size, image_size, 3), dtype=np.float32)

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    idxs = _sample_indices(total, n_frames, is_train=is_train)

    frames = []
    for idx in idxs:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok:
            if frames:
                frame = frames[-1]
                frame = cv2.cvtColor((frame * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
            else:
                frame = np.zeros((image_size, image_size, 3), dtype=np.uint8)
        frame = cv2.resize(frame, (image_size, image_size), interpolation=cv2.INTER_LINEAR)
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        frames.append(frame)
    cap.release()

    arr = np.stack(frames, axis=0)
    if is_train and random.random() < 0.5:
        arr = arr[:, :, ::-1, :].copy()  # horizontal flip
    return arr


def _jpeg_compress_rgb(frame_rgb: np.ndarray, quality: int) -> np.ndarray:
    """
    Apply JPEG round-trip compression to a single RGB frame in [0,1].
    """
    q = int(np.clip(quality, 5, 100))
    bgr_u8 = cv2.cvtColor((frame_rgb * 255.0).astype(np.uint8), cv2.COLOR_RGB2BGR)
    ok, enc = cv2.imencode(".jpg", bgr_u8, [int(cv2.IMWRITE_JPEG_QUALITY), q])
    if not ok:
        return frame_rgb
    dec = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    if dec is None:
        return frame_rgb
    rgb = cv2.cvtColor(dec, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    return rgb


def _apply_quality_shortcut_breaker(
    arr: np.ndarray,
    prob: float,
    blur_prob: float,
    noise_prob: float,
    jpeg_prob: float,
    noise_std_min: float,
    noise_std_max: float,
    jpeg_qmin: int,
    jpeg_qmax: int,
) -> np.ndarray:
    """
    Random quality degradation to reduce shortcut on pristine quality cues.
    Input/Output shape: [T,H,W,3], value range [0,1].
    """
    if prob <= 0.0 or random.random() >= prob:
        return arr

    out = arr.copy()
    use_blur = random.random() < blur_prob
    use_noise = random.random() < noise_prob
    use_jpeg = random.random() < jpeg_prob

    if not (use_blur or use_noise or use_jpeg):
        mode = random.choice(["blur", "noise", "jpeg"])
        use_blur = mode == "blur"
        use_noise = mode == "noise"
        use_jpeg = mode == "jpeg"

    if use_blur:
        ksize = random.choice([3, 5])
        for i in range(out.shape[0]):
            out[i] = cv2.GaussianBlur(out[i], (ksize, ksize), 0)

    if use_noise:
        std = random.uniform(max(0.0, noise_std_min), max(noise_std_min, noise_std_max))
        noise = np.random.normal(0.0, std, size=out.shape).astype(np.float32)
        out = out + noise

    if use_jpeg:
        qmin = int(min(jpeg_qmin, jpeg_qmax))
        qmax = int(max(jpeg_qmin, jpeg_qmax))
        q = random.randint(max(5, qmin), min(100, qmax))
        for i in range(out.shape[0]):
            out[i] = _jpeg_compress_rgb(out[i], q)

    return np.clip(out, 0.0, 1.0).astype(np.float32)


def _topk_noisy_or_np(probs: np.ndarray, topk_ratio: float = 0.2, topk_min: int = 3) -> float:
    probs = np.asarray(probs, dtype=np.float32).reshape(-1)
    if probs.size == 0:
        return 0.0
    probs = np.clip(probs, 0.0, 1.0)
    k = max(int(topk_min), int(math.ceil(probs.size * float(topk_ratio))))
    k = min(k, probs.size)
    vals = np.sort(probs)[-k:]
    return float(1.0 - np.prod(1.0 - vals + 1e-6))


class VideoModerationV7Dataset(Dataset):
    """
    Supervised video dataset for V7 (VideoMAE + LoRA).

    Manifest columns expected:
      - video_path
      - violence
      - optional: feature_path (for aux summary + S/N pseudo teachers)
      - optional: self_harm, nsfw
    """

    def __init__(
        self,
        manifest_path: Path,
        features_dir: Path | None = None,
        num_frames: int = 16,
        image_size: int = 224,
        image_mean: tuple[float, float, float] = (0.485, 0.456, 0.406),
        image_std: tuple[float, float, float] = (0.229, 0.224, 0.225),
        is_train: bool = False,
        sn_topk_ratio: float = 0.2,
        sn_topk_min: int = 3,
        quality_aug_prob: float = 0.0,
        quality_blur_prob: float = 0.35,
        quality_noise_prob: float = 0.35,
        quality_jpeg_prob: float = 0.35,
        quality_noise_std_min: float = 0.01,
        quality_noise_std_max: float = 0.06,
        quality_jpeg_qmin: int = 25,
        quality_jpeg_qmax: int = 55,
    ) -> None:
        self.manifest_path = Path(manifest_path).resolve()
        self.base_dir = self.manifest_path.parent
        self.df = pd.read_csv(self.manifest_path)
        self.features_dir = Path(features_dir).resolve() if features_dir else None
        self.num_frames = int(num_frames)
        self.image_size = int(image_size)
        self.mean = np.array(image_mean, dtype=np.float32).reshape(1, 1, 1, 3)
        self.std = np.array(image_std, dtype=np.float32).reshape(1, 1, 1, 3)
        self.is_train = bool(is_train)
        self.sn_topk_ratio = float(sn_topk_ratio)
        self.sn_topk_min = int(sn_topk_min)
        self.quality_aug_prob = float(max(0.0, quality_aug_prob))
        self.quality_blur_prob = float(max(0.0, quality_blur_prob))
        self.quality_noise_prob = float(max(0.0, quality_noise_prob))
        self.quality_jpeg_prob = float(max(0.0, quality_jpeg_prob))
        self.quality_noise_std_min = float(max(0.0, quality_noise_std_min))
        self.quality_noise_std_max = float(max(0.0, quality_noise_std_max))
        self.quality_jpeg_qmin = int(quality_jpeg_qmin)
        self.quality_jpeg_qmax = int(quality_jpeg_qmax)

        required = ["video_path", "violence"]
        missing = [c for c in required if c not in self.df.columns]
        if missing:
            raise ValueError(f"Missing required columns in {manifest_path}: {missing}")

    def __len__(self) -> int:
        return len(self.df)

    def _load_aux_and_teachers(self, row: pd.Series) -> tuple[np.ndarray, float, float]:
        """
        Returns:
          aux_summary: [7] => flow_mean3 + yolo_max + gore_max + selfharm_max + nsfw_max
          s_teacher: pseudo target in [0,1]
          n_teacher: pseudo target in [0,1]
        """
        aux_summary = np.zeros(7, dtype=np.float32)
        s_teacher = 0.0
        n_teacher = 0.0

        if self.features_dir is None or "feature_path" not in row:
            return aux_summary, s_teacher, n_teacher

        raw_fp = str(row.get("feature_path", "")).strip()
        if not raw_fp:
            return aux_summary, s_teacher, n_teacher

        fp = _resolve_path(raw_fp, self.features_dir)
        if not fp.exists():
            # fallback when manifest stores absolute/other relative path
            fp = _resolve_path(raw_fp, self.base_dir)
        if not fp.exists():
            return aux_summary, s_teacher, n_teacher

        try:
            arr = np.load(fp)
        except Exception:
            return aux_summary, s_teacher, n_teacher

        if arr.ndim != 2 or arr.shape[1] < 774:
            return aux_summary, s_teacher, n_teacher

        # Combined feature layout:
        # V6.0: [768 | flow3 | yolo1 | gore1 | nsfw1] => aux=6
        # V6.1: [768 | flow3 | yolo1 | gore1 | selfharm1 | nsfw1] => aux=7
        aux = arr[:, 768:]
        if aux.shape[1] >= 7:
            flow = aux[:, 0:3]
            yolo = aux[:, 3]
            gore = aux[:, 4]
            selfharm = aux[:, 5]
            nsfw = aux[:, 6]
        else:
            flow = aux[:, 0:3]
            yolo = aux[:, 3]
            gore = aux[:, 4]
            selfharm = np.zeros_like(gore)
            nsfw = aux[:, 5]

        aux_summary[:3] = np.mean(flow, axis=0).astype(np.float32)
        aux_summary[3] = float(np.max(yolo))
        aux_summary[4] = float(np.max(gore))
        aux_summary[5] = float(np.max(selfharm))
        aux_summary[6] = float(np.max(nsfw))

        # Event-based pseudo teachers (for S/N distillation).
        s_source = selfharm if np.max(selfharm) > 1e-6 else gore
        s_teacher = _topk_noisy_or_np(s_source, self.sn_topk_ratio, self.sn_topk_min)
        n_teacher = _topk_noisy_or_np(nsfw, self.sn_topk_ratio, self.sn_topk_min)
        return aux_summary, s_teacher, n_teacher

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        row = self.df.iloc[index]
        video_path = _resolve_path(str(row["video_path"]), self.base_dir)

        frames = _read_video_frames(
            video_path=video_path,
            n_frames=self.num_frames,
            image_size=self.image_size,
            is_train=self.is_train,
        )  # [T,H,W,3], float in [0,1]

        if self.is_train and self.quality_aug_prob > 0.0:
            frames = _apply_quality_shortcut_breaker(
                frames,
                prob=self.quality_aug_prob,
                blur_prob=self.quality_blur_prob,
                noise_prob=self.quality_noise_prob,
                jpeg_prob=self.quality_jpeg_prob,
                noise_std_min=self.quality_noise_std_min,
                noise_std_max=self.quality_noise_std_max,
                jpeg_qmin=self.quality_jpeg_qmin,
                jpeg_qmax=self.quality_jpeg_qmax,
            )

        frames = (frames - self.mean) / self.std
        pixel_values = torch.from_numpy(frames).permute(0, 3, 1, 2).contiguous().float()

        violence = float(row.get("violence", 0.0))
        aux_summary, s_teacher, n_teacher = self._load_aux_and_teachers(row)

        return {
            "pixel_values": pixel_values,                        # [T,3,H,W]
            "aux_summary": torch.from_numpy(aux_summary),        # [7]
            "violence": torch.tensor(violence, dtype=torch.float32),
            "s_teacher": torch.tensor(s_teacher, dtype=torch.float32),
            "n_teacher": torch.tensor(n_teacher, dtype=torch.float32),
        }
