from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch.utils.data import Dataset


class ProxyArrayDataset(Dataset):
    """Load proxy clips stored as numpy arrays of sampled RGB frames."""

    def __init__(
        self,
        manifest_path: Path,
        data_root: Path,
        array_col: str = 'array_path',
        label_col: str = 'label',
        transform=None,
    ) -> None:
        self.df = pd.read_csv(manifest_path)
        self.data_root = data_root
        self.array_col = array_col
        self.label_col = label_col
        self.transform = transform

        missing_cols = [c for c in [array_col, label_col] if c not in self.df.columns]
        if missing_cols:
            raise ValueError(f'Missing columns in manifest {manifest_path}: {missing_cols}')

    def __len__(self) -> int:
        return len(self.df)

    def _resolve_path(self, raw_path: str) -> Path:
        path = Path(str(raw_path))
        if path.is_absolute():
            return path

        candidates = [
            self.data_root / path,
            Path.cwd() / path,
            Path('/kaggle/working') / path,
            path,
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate

        raise FileNotFoundError(f'Proxy array not found for "{raw_path}"')

    def __getitem__(self, index: int):
        row = self.df.iloc[index]
        path = self._resolve_path(str(row[self.array_col]))
        clip = np.load(path)

        if clip.ndim != 4:
            raise ValueError(f'Expected proxy clip with shape [T,H,W,C], got {clip.shape} from {path}')

        frames = []
        for frame in clip:
            image = Image.fromarray(frame.astype(np.uint8))
            if self.transform is not None:
                tensor = self.transform(image)
            else:
                tensor = torch.from_numpy(frame).permute(2, 0, 1).float() / 255.0
            frames.append(tensor)

        x = torch.stack(frames, dim=0)
        y = torch.tensor(int(row[self.label_col]), dtype=torch.long)
        return x, y
