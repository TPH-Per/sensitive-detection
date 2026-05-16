from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

import pandas as pd
import yaml
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}


def stable_name(prefix: str, source_path: Path) -> str:
    digest = hashlib.sha1(str(source_path).encode('utf-8')).hexdigest()[:12]
    return f'{prefix}_{digest}'


def iter_images(folder: Path):
    if not folder.exists():
        return []
    return sorted([path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS])


def copy_or_link(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return
    try:
        os.symlink(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def remap_labels(src_label: Path, dst_label: Path, target_class: int) -> int:
    dst_label.parent.mkdir(parents=True, exist_ok=True)
    if not src_label.exists():
        dst_label.write_text('', encoding='utf-8')
        return 0

    remapped_lines = []
    line_count = 0
    for raw_line in src_label.read_text(encoding='utf-8', errors='ignore').splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        parts = stripped.split()
        if len(parts) < 5:
            continue
        remapped_lines.append(' '.join([str(target_class), *parts[1:5]]))
        line_count += 1
    dst_label.write_text('\n'.join(remapped_lines), encoding='utf-8')
    return line_count


def split_rows(rows: list[dict], val_size: float, test_size: float, seed: int) -> list[dict]:
    if not rows:
        return rows

    frame = pd.DataFrame(rows)
    assigned = []
    for source, source_df in frame.groupby('source'):
        open_df = source_df[source_df['split'] == '']
        locked_df = source_df[source_df['split'] != '']
        split_map = {row['image_path']: row['split'] for row in locked_df.to_dict('records')}

        if not open_df.empty:
            indices = open_df.index.tolist()
            if test_size > 0 and len(indices) >= 3:
                train_idx, test_idx = train_test_split(indices, test_size=test_size, random_state=seed, shuffle=True)
                for idx in test_idx:
                    split_map[open_df.loc[idx, 'image_path']] = 'test'
                indices = train_idx
            if val_size > 0 and len(indices) >= 3:
                relative_val = min(val_size / max(1.0 - test_size, 1e-6), 0.5)
                train_idx, val_idx = train_test_split(indices, test_size=relative_val, random_state=seed + 1, shuffle=True)
                for idx in val_idx:
                    split_map[open_df.loc[idx, 'image_path']] = 'val'
                indices = train_idx
            for idx in indices:
                split_map[open_df.loc[idx, 'image_path']] = 'train'

        current_rows = source_df.to_dict('records')
        for row in current_rows:
            row['split'] = split_map[row['image_path']]
            assigned.append(row)
    return assigned


def discover_sources(input_root: Path) -> list[dict]:
    sources = []
    source_specs = [
        ('Self Harm Detection.v1i.yolov8', 'self_harm_detection', 0),
        ('Suicide Detection.v1i.yolov8(1)', 'suicide_detection', 0),
        ('Surgical Tools Dataset.v2-labelled-set.yolov8', 'surgical_tools', 1),
    ]

    for folder_name, source_name, target_class in source_specs:
        for base in input_root.rglob(folder_name):
            split_alias = {'train': 'train', 'valid': 'val', 'val': 'val', 'test': 'test'}
            for split_dir in sorted([path for path in base.iterdir() if path.is_dir()]):
                if split_dir.name.lower() not in split_alias:
                    continue
                split_name = split_alias[split_dir.name.lower()]
                image_dir = split_dir / 'images'
                label_dir = split_dir / 'labels'
                for image_path in iter_images(image_dir):
                    label_path = label_dir / f'{image_path.stem}.txt'
                    sources.append(
                        {
                            'source': source_name,
                            'image_path': str(image_path),
                            'label_path': str(label_path),
                            'target_class': target_class,
                            'split': split_name if split_name in {'val', 'test'} else '',
                        }
                    )
    return sources


def build_dataset(rows: list[dict], output_root: Path) -> dict:
    yolo_root = output_root / 'yolo_merged'
    summary = {'train': 0, 'val': 0, 'test': 0, 'boxes': 0}

    for row in rows:
        split = row['split']
        image_path = Path(row['image_path'])
        label_path = Path(row['label_path'])
        target_class = int(row['target_class'])
        file_stem = stable_name(row['source'], image_path)

        dst_image = yolo_root / split / 'images' / f'{file_stem}{image_path.suffix.lower()}'
        dst_label = yolo_root / split / 'labels' / f'{file_stem}.txt'

        copy_or_link(image_path, dst_image)
        summary['boxes'] += remap_labels(label_path, dst_label, target_class)
        summary[split] += 1

    data_yaml = {
        'path': str(yolo_root.resolve()),
        'train': 'train/images',
        'val': 'val/images',
        'test': 'test/images',
        'names': {
            0: 'risky_object',
            1: 'medical_tool',
        },
    }
    data_yaml_path = yolo_root / 'data.yaml'
    data_yaml_path.write_text(yaml.safe_dump(data_yaml, sort_keys=False, allow_unicode=True), encoding='utf-8')
    summary['data_yaml'] = str(data_yaml_path)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input_root', type=str, default='/kaggle/input')
    parser.add_argument('--output_root', type=str, default='/kaggle/working/artifacts')
    parser.add_argument('--val_size', type=float, default=0.15)
    parser.add_argument('--test_size', type=float, default=0.15)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    input_root = Path(args.input_root)
    output_root = Path(args.output_root).resolve()
    rows = discover_sources(input_root)
    if not rows:
        raise RuntimeError(f'No YOLO-style datasets were discovered under {input_root}')

    rows = split_rows(rows, val_size=args.val_size, test_size=args.test_size, seed=args.seed)
    summary = build_dataset(rows, output_root)

    summary_path = output_root / 'yolo_merged' / 'summary.json'
    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
