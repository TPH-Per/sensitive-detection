import hashlib
from pathlib import Path

def get_split(filename: str) -> str:
    """
    Hash-based deterministic split to guarantee no data leakage between Expert and E2E models.
    Returns: 'train' (80%), 'val' (10%), or 'test' (10%)
    """
    # Use stem without extension for consistency between .jpg, .mp4, and .npy
    stem = Path(filename).stem
    
    # Simple hash to integer
    h = int(hashlib.md5(stem.encode('utf-8')).hexdigest(), 16)
    
    rem = h % 100
    if rem < 80:
        return 'train'
    elif rem < 90:
        return 'val'
    else:
        return 'test'


def get_split_from_id(identifier: str, train_ratio: float = 0.8, val_ratio: float = 0.1) -> str:
    """
    Hash-based deterministic split using full identifier (e.g., full path).
    Ratios are fractions of 1.0; test ratio is the remainder.
    """
    if train_ratio <= 0 or val_ratio < 0 or train_ratio + val_ratio >= 1:
        raise ValueError("Invalid split ratios")

    h = int(hashlib.md5(identifier.encode('utf-8')).hexdigest(), 16)
    rem = h % 100

    train_cut = int(train_ratio * 100)
    val_cut = train_cut + int(val_ratio * 100)

    if rem < train_cut:
        return 'train'
    if rem < val_cut:
        return 'val'
    return 'test'
