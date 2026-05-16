"""
v2_videomae_encoder.py — VideoMAE-Small Encoder for V2 Pipeline
================================================================
Encodes video frames into per-frame features using VideoMAE-Small.
From DA_DL_KPDL_V2 scripts/extract_features.py.
"""
from __future__ import annotations

from typing import List

import numpy as np
import torch
from transformers import VideoMAEImageProcessor, VideoMAEModel


def _resample_2d(features: np.ndarray, target_len: int) -> np.ndarray:
    if features.shape[0] == target_len:
        return features.astype(np.float32)
    if features.shape[0] <= 1:
        return np.repeat(features[:1], target_len, axis=0).astype(np.float32)
    src = np.linspace(0.0, 1.0, num=features.shape[0], dtype=np.float64)
    dst = np.linspace(0.0, 1.0, num=target_len, dtype=np.float64)
    out = np.zeros((target_len, features.shape[1]), dtype=np.float32)
    for d in range(features.shape[1]):
        out[:, d] = np.interp(dst, src, features[:, d]).astype(np.float32)
    return out


def _window_starts(total: int, clip_frames: int, stride: int) -> List[int]:
    if total <= clip_frames:
        return [0]
    starts = list(range(0, total - clip_frames + 1, stride))
    tail_start = total - clip_frames
    if starts[-1] != tail_start:
        starts.append(tail_start)
    return starts


class VideoMAESmallEncoder:
    """Encodes video frames into per-frame feature vectors using VideoMAE-Small."""

    def __init__(self, checkpoint: str, device: torch.device, frozen: bool = True) -> None:
        self.processor = VideoMAEImageProcessor.from_pretrained(checkpoint)
        load_kwargs = {}
        if device.type == "cuda":
            load_kwargs["torch_dtype"] = torch.float16
        self.model = VideoMAEModel.from_pretrained(checkpoint, **load_kwargs)
        self.model.to(device)
        self.model.eval()
        if frozen:
            for p in self.model.parameters():
                p.requires_grad = False
        self.device = device
        self.hidden_size = int(self.model.config.hidden_size)
        self.model_clip_frames = int(self.model.config.num_frames)
        self.tubelet_size = int(getattr(self.model.config, "tubelet_size", 2))

    def _extract_clip_features(self, clip: torch.Tensor, expected_clip_frames: int) -> torch.Tensor:
        # clip: [T,C,H,W], pixel range [0,1]
        frames_uint8 = (
            clip.permute(0, 2, 3, 1).cpu().numpy().clip(0.0, 1.0) * 255.0
        ).astype(np.uint8)
        inputs = self.processor(list(frames_uint8), return_tensors="pt")
        pixel_values = inputs["pixel_values"].to(self.device)
        if self.device.type == "cuda":
            pixel_values = pixel_values.to(self.model.dtype)

        with torch.no_grad():
            outputs = self.model(pixel_values=pixel_values)
        hidden = outputs.last_hidden_state[0]  # [tokens, D]

        temporal_bins = max(1, expected_clip_frames // self.tubelet_size)
        num_tokens = hidden.shape[0]
        if num_tokens % temporal_bins != 0:
            if (num_tokens - 1) % temporal_bins == 0:
                hidden = hidden[1:]
                num_tokens = hidden.shape[0]
            else:
                raise ValueError(
                    f"Cannot reshape token grid: tokens={num_tokens}, temporal_bins={temporal_bins}"
                )
        spatial_tokens = num_tokens // temporal_bins
        hidden = hidden.reshape(temporal_bins, spatial_tokens, self.hidden_size)
        tubelet_features = hidden.mean(dim=1)  # [temporal_bins, D]
        frame_features = tubelet_features.repeat_interleave(self.tubelet_size, dim=0)

        if frame_features.shape[0] != expected_clip_frames:
            resized = _resample_2d(
                frame_features.detach().float().cpu().numpy(),
                expected_clip_frames,
            )
            return torch.from_numpy(resized)
        return frame_features.detach().float().cpu()

    def encode_sequence(
        self,
        frames: torch.Tensor,
        clip_frames: int,
        clip_stride: int,
        target_frames: int,
    ) -> np.ndarray:
        """Encode a sequence of frames into per-frame features.
        frames: [T, C, H, W] tensor, pixel range [0,1].
        Returns: [target_frames, hidden_size] numpy array.
        """
        total = int(frames.shape[0])
        if total <= 0:
            raise ValueError("Empty input frames.")

        starts = _window_starts(total, clip_frames, clip_stride)
        accum = torch.zeros((total, self.hidden_size), dtype=torch.float32)
        counts = torch.zeros((total,), dtype=torch.float32)

        for start in starts:
            frame_indices = [min(start + offset, total - 1) for offset in range(clip_frames)]
            clip = frames[frame_indices]
            clip_features = self._extract_clip_features(clip, clip_frames)
            for pos, frame_idx in enumerate(frame_indices):
                accum[frame_idx] += clip_features[pos]
                counts[frame_idx] += 1.0

        counts = counts.clamp(min=1.0).unsqueeze(-1)
        frame_features = (accum / counts).cpu().numpy().astype(np.float32)
        return _resample_2d(frame_features, target_frames)
