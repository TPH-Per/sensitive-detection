from __future__ import annotations

import os
from pathlib import Path


def is_kaggle_runtime() -> bool:
    return Path('/kaggle/input').exists() or os.getenv('KAGGLE_KERNEL_RUN_TYPE') is not None


def resolve_roots(data_root: str | None, output_root: str | None) -> tuple[Path, Path]:
    if is_kaggle_runtime():
        data = Path(data_root or '/kaggle/input')
        out = Path(output_root or '/kaggle/working/artifacts')
    else:
        data = Path(data_root or 'data')
        out = Path(output_root or 'artifacts')

    out.mkdir(parents=True, exist_ok=True)
    (out / 'checkpoints').mkdir(parents=True, exist_ok=True)
    (out / 'logs').mkdir(parents=True, exist_ok=True)
    (out / 'metrics').mkdir(parents=True, exist_ok=True)
    return data, out
