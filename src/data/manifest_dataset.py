from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


class ManifestFeatureDataset(Dataset):
    def __init__(
        self,
        manifest_path: Path,
        data_root: Path,
        label_columns: list[str],
        frames_per_clip: int = 64,
        default_aux_dim: int = 0,
    ) -> None:
        self.manifest_path = Path(manifest_path).resolve()
        self.df = pd.read_csv(self.manifest_path)
        self.data_root = data_root
        self.manifest_dir = self.manifest_path.parent
        self.label_columns = label_columns
        self.frames_per_clip = frames_per_clip
        self.has_aux = 'aux_feature_path' in self.df.columns
        self.default_aux_dim = default_aux_dim

        missing_cols = [c for c in ['feature_path', *label_columns] if c not in self.df.columns]
        if missing_cols:
            raise ValueError(f'Missing columns in manifest {manifest_path}: {missing_cols}')

    def __len__(self) -> int:
        return len(self.df)

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

    def _load_array(self, raw_path: str, default_dim: int = 0) -> np.ndarray:
        raw_path = str(raw_path).strip()
        if not raw_path:
            return np.zeros((self.frames_per_clip, max(default_dim, 1)), dtype=np.float32) if default_dim else np.zeros((self.frames_per_clip, 0), dtype=np.float32)

        path = self._resolve_feature_path(raw_path)
        arr = np.load(path)
        if arr.ndim == 1:
            arr = np.expand_dims(arr, axis=0)
        elif arr.ndim > 2:
            arr = arr.reshape(arr.shape[0], -1)

        if default_dim > 0 and arr.ndim == 2 and arr.shape[1] != default_dim:
            if arr.shape[1] < default_dim:
                pad = np.zeros((arr.shape[0], default_dim - arr.shape[1]), dtype=arr.dtype if arr.size else np.float32)
                arr = np.concatenate([arr, pad], axis=1)
            else:
                arr = arr[:, :default_dim]

        if arr.shape[0] > self.frames_per_clip:
            arr = arr[: self.frames_per_clip]
        elif arr.shape[0] < self.frames_per_clip:
            width = arr.shape[1] if arr.ndim == 2 else max(default_dim, 1)
            pad = np.zeros((self.frames_per_clip - arr.shape[0], width), dtype=arr.dtype if arr.size else np.float32)
            arr = np.concatenate([arr, pad], axis=0)
        arr = arr.astype(np.float32)
        # Guard numerics from corrupted feature files.
        arr = np.nan_to_num(arr, nan=0.0, posinf=1e6, neginf=-1e6)
        return arr

    def __getitem__(self, index: int) -> tuple[torch.Tensor, ...]:
        row = self.df.iloc[index]
        features = self._load_array(str(row['feature_path']))

        y = torch.tensor(row[self.label_columns].values.astype(np.float32), dtype=torch.float32)

        if not self.has_aux:
            # Combined feature file: [CLIP(768) | AUX]
            if features.ndim == 2 and features.shape[1] > 768:
                x = torch.tensor(features[:, :768], dtype=torch.float32)
                aux_tensor = torch.tensor(features[:, 768:], dtype=torch.float32)
                return x, aux_tensor, y

            x = torch.tensor(features, dtype=torch.float32)
            if self.default_aux_dim > 0:
                aux = np.zeros((self.frames_per_clip, self.default_aux_dim), dtype=np.float32)
                aux_tensor = torch.tensor(aux, dtype=torch.float32)
                return x, aux_tensor, y
            return x, y

        x = torch.tensor(features, dtype=torch.float32)
        aux = self._load_array(str(row.get('aux_feature_path', '')), default_dim=self.default_aux_dim)
        aux_tensor = torch.tensor(aux, dtype=torch.float32)
        return x, aux_tensor, y
