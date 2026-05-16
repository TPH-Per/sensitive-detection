from __future__ import annotations

import warnings
from pathlib import Path

import pandas as pd
from PIL import Image, UnidentifiedImageError
from torch.utils.data import Dataset


class ImageManifestDataset(Dataset):
    def __init__(
        self,
        manifest_path: Path,
        data_root: Path,
        image_col: str = 'image_path',
        label_col: str = 'label',
        transform=None,
    ) -> None:
        self.df = pd.read_csv(manifest_path)
        self.data_root = data_root
        if image_col not in self.df.columns and image_col == 'image_path' and 'relative_path' in self.df.columns:
            image_col = 'relative_path'
        self.image_col = image_col
        self.label_col = label_col
        self.transform = transform

        missing_cols = [c for c in [image_col, label_col] if c not in self.df.columns]
        if missing_cols:
            raise ValueError(f'Missing columns in manifest {manifest_path}: {missing_cols}')

        self.df = self._filter_readable_images(self.df)
        if self.df.empty:
            raise ValueError(f'No readable images found in manifest {manifest_path}')

    def _resolve_path(self, raw_path: str) -> Path:
        path = Path(str(raw_path))
        if path.is_absolute():
            return path
        return self.data_root / path

    def _is_readable_image(self, path: Path) -> bool:
        try:
            with Image.open(path) as image:
                image.convert('RGB').load()
            return True
        except (FileNotFoundError, UnidentifiedImageError, OSError):
            return False

    def _filter_readable_images(self, df: pd.DataFrame) -> pd.DataFrame:
        valid_indices = []
        skipped_paths = []

        for idx, row in df.iterrows():
            path = self._resolve_path(str(row[self.image_col]))
            if self._is_readable_image(path):
                valid_indices.append(idx)
            else:
                skipped_paths.append(str(path))

        if skipped_paths:
            warnings.warn(
                f'Skipped {len(skipped_paths)} unreadable image(s) while loading {self.df.shape[0]} rows from the manifest. '
                f'Example: {skipped_paths[0]}',
                RuntimeWarning,
            )

        return df.loc[valid_indices].reset_index(drop=True)

    def __len__(self) -> int:
        return len(self.df)

    def __getitem__(self, index: int):
        row = self.df.iloc[index]
        path = self._resolve_path(str(row[self.image_col]))

        image = Image.open(path).convert('RGB')
        label = int(row[self.label_col])

        if self.transform is not None:
            image = self.transform(image)
        return image, label
