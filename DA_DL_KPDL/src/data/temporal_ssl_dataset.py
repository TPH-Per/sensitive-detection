from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


class TemporalSSLDataset(Dataset):
    """Dataset for temporal pretext tasks over [T, D] features."""

    def __init__(self, manifest_path: Path, data_root: Path, frames_per_clip: int = 64, default_aux_dim: int = 0) -> None:
        self.manifest_path = Path(manifest_path).resolve()
        self.df = pd.read_csv(self.manifest_path)
        self.data_root = data_root
        self.manifest_dir = self.manifest_path.parent
        self.frames_per_clip = frames_per_clip
        self.default_aux_dim = default_aux_dim
        if 'feature_path' not in self.df.columns:
            raise ValueError(f'Missing feature_path column in {manifest_path}')

    def _resolve_feature_path(self, raw_path: str) -> Path:
        feature_path = Path(raw_path)
        if feature_path.is_absolute():
            return feature_path

        candidates = [
            self.data_root / feature_path,
            self.manifest_dir / feature_path,
            Path('artifacts') / feature_path,
            Path('/kaggle/working/artifacts') / feature_path,
            feature_path,
        ]

        for candidate in candidates:
            if candidate.exists():
                return candidate

        candidate_str = ', '.join(str(c) for c in candidates)
        raise FileNotFoundError(f'Feature file not found for "{raw_path}". Tried: {candidate_str}')

    def _load_feature(self, rel_path: str) -> np.ndarray:
        path = self._resolve_feature_path(rel_path)
        arr = np.load(path)
        if arr.ndim == 1:
            arr = np.expand_dims(arr, axis=0)
        if arr.ndim > 2:
            arr = arr.reshape(arr.shape[0], -1)

        if arr.shape[0] > self.frames_per_clip:
            arr = arr[: self.frames_per_clip]
        elif arr.shape[0] < self.frames_per_clip:
            pad = np.zeros((self.frames_per_clip - arr.shape[0], arr.shape[1]), dtype=arr.dtype)
            arr = np.concatenate([arr, pad], axis=0)
        return arr.astype(np.float32)

    def _load_aux(self, rel_path: str) -> np.ndarray:
        raw_path = '' if pd.isna(rel_path) else str(rel_path).strip()
        if not raw_path:
            return np.zeros((self.frames_per_clip, max(self.default_aux_dim, 0)), dtype=np.float32)

        path = self._resolve_feature_path(raw_path)
        arr = np.load(path)
        if arr.ndim == 1:
            arr = np.expand_dims(arr, axis=0)
        elif arr.ndim > 2:
            arr = arr.reshape(arr.shape[0], -1)

        if self.default_aux_dim > 0 and arr.ndim == 2 and arr.shape[1] != self.default_aux_dim:
            if arr.shape[1] < self.default_aux_dim:
                pad = np.zeros((arr.shape[0], self.default_aux_dim - arr.shape[1]), dtype=arr.dtype if arr.size else np.float32)
                arr = np.concatenate([arr, pad], axis=1)
            else:
                arr = arr[:, : self.default_aux_dim]

        if arr.shape[0] > self.frames_per_clip:
            arr = arr[: self.frames_per_clip]
        elif arr.shape[0] < self.frames_per_clip:
            width = arr.shape[1] if arr.ndim == 2 else max(self.default_aux_dim, 0)
            pad = np.zeros((self.frames_per_clip - arr.shape[0], width), dtype=arr.dtype if arr.size else np.float32)
            arr = np.concatenate([arr, pad], axis=0)
        return arr.astype(np.float32)

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, idx: int):
        row = self.df.iloc[idx]
        x = self._load_feature(str(row['feature_path']))
        aux = self._load_aux(row.get('aux_feature_path', ''))

        # Arrow of time target
        reverse = np.random.rand() < 0.5
        if reverse:
            x_aot = x[::-1].copy()
            aux_aot = aux[::-1].copy()
            y_aot = 1
        else:
            x_aot = x
            aux_aot = aux
            y_aot = 0

        # Frame sorting target: binary label whether shuffled or not
        shuffle = np.random.rand() < 0.5
        if shuffle:
            perm = np.random.permutation(x.shape[0])
            x_sort = x[perm]
            aux_sort = aux[perm]
            y_sort = 1
        else:
            x_sort = x
            aux_sort = aux
            y_sort = 0

        return {
            'x_aot': torch.tensor(x_aot, dtype=torch.float32),
            'aux_aot': torch.tensor(aux_aot, dtype=torch.float32),
            'y_aot': torch.tensor(y_aot, dtype=torch.long),
            'x_sort': torch.tensor(x_sort, dtype=torch.float32),
            'aux_sort': torch.tensor(aux_sort, dtype=torch.float32),
            'y_sort': torch.tensor(y_sort, dtype=torch.long),
        }
