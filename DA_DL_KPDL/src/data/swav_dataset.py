from __future__ import annotations

from pathlib import Path

import pandas as pd
from PIL import Image
from torch.utils.data import Dataset


class SwAVMultiCropDataset(Dataset):
    def __init__(self, manifest_path: Path, data_root: Path, transform) -> None:
        self.df = pd.read_csv(manifest_path)
        self.data_root = data_root
        self.transform = transform
        if 'relative_path' not in self.df.columns:
            raise ValueError(f'Missing relative_path column in {manifest_path}')

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, index: int):
        row = self.df.iloc[index]
        path = Path(str(row['relative_path']))
        if not path.is_absolute():
            path = self.data_root / path
        image = Image.open(path).convert('RGB')
        return self.transform(image)


class SwAVEvalDataset(Dataset):
    def __init__(self, manifest_path: Path, data_root: Path, transform) -> None:
        self.df = pd.read_csv(manifest_path)
        self.data_root = data_root
        self.transform = transform
        required_cols = ['relative_path', 'violence', 'self_harm', 'nsfw']
        missing = [col for col in required_cols if col not in self.df.columns]
        if missing:
            raise ValueError(f'Missing columns in {manifest_path}: {missing}')

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, index: int):
        row = self.df.iloc[index]
        path = Path(str(row['relative_path']))
        if not path.is_absolute():
            path = self.data_root / path
        image = Image.open(path).convert('RGB')
        signature = f"v{int(row['violence'])}_s{int(row['self_harm'])}_n{int(row['nsfw'])}"
        return self.transform(image), signature
