from __future__ import annotations

import argparse
import sys
from pathlib import Path
import csv

import yaml

# Ensure "src" imports work when running scripts via "python scripts/<file>.py".
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.utils.io_paths import resolve_roots


def build_parser(default_config: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=str, default=default_config)
    parser.add_argument('--data_root', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    parser.add_argument('--resume', type=str, default=None)
    return parser


def _deep_merge(base: dict, override: dict) -> dict:
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_yaml(path: str) -> dict:
    cfg_path = Path(path)
    with cfg_path.open('r', encoding='utf-8') as f:
        current = yaml.safe_load(f) or {}

    parent = current.get('inherits')
    if not parent:
        return current

    parent_path = Path(parent)
    if not parent_path.is_absolute():
        candidate_cfg_relative = (cfg_path.parent / parent_path).resolve()
        candidate_root_relative = (ROOT / parent_path).resolve()
        parent_path = candidate_cfg_relative if candidate_cfg_relative.exists() else candidate_root_relative

    parent_cfg = load_yaml(str(parent_path))
    current = dict(current)
    current.pop('inherits', None)
    return _deep_merge(parent_cfg, current)


def prepare_runtime(args: argparse.Namespace) -> tuple[dict, Path, Path]:
    config = load_yaml(args.config)
    data_root, output_root = resolve_roots(args.data_root, args.output_root)
    return config, data_root, output_root


def append_epoch_metrics(csv_path: str | Path, row: dict) -> None:
    """Append one epoch of metrics to a CSV file, writing the header on first use."""
    path = Path(csv_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    file_exists = path.exists()

    with path.open('a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
