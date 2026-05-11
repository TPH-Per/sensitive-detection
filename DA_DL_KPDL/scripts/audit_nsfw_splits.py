from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


def load_manifest(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f'Manifest not found: {path}')
    return pd.read_csv(path)


def manifest_stats(df: pd.DataFrame) -> dict:
    stats = {
        'rows': int(len(df)),
        'unique_sample_id': int(df['sample_id'].nunique()) if 'sample_id' in df.columns else 0,
        'unique_relative_path': int(df['relative_path'].nunique()) if 'relative_path' in df.columns else 0,
        'unique_group_id': int(df['group_id'].nunique()) if 'group_id' in df.columns else 0,
    }
    if 'label' in df.columns:
        stats['label_counts'] = {str(key): int(value) for key, value in df['label'].value_counts().sort_index().items()}
    elif 'nsfw' in df.columns:
        stats['label_counts'] = {str(key): int(value) for key, value in df['nsfw'].value_counts().sort_index().items()}
    return stats


def overlap_count(left: pd.DataFrame, right: pd.DataFrame, column: str) -> int:
    if column not in left.columns or column not in right.columns:
        return 0
    left_values = set(left[column].dropna().astype(str).tolist())
    right_values = set(right[column].dropna().astype(str).tolist())
    return int(len(left_values & right_values))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--train_manifest', type=str, required=True)
    parser.add_argument('--val_manifest', type=str, required=True)
    parser.add_argument('--test_manifest', type=str, required=True)
    parser.add_argument('--challenge_manifest', type=str, default=None)
    parser.add_argument('--output_root', type=str, default=None)
    args = parser.parse_args()

    manifests = {
        'train': load_manifest(Path(args.train_manifest)),
        'val': load_manifest(Path(args.val_manifest)),
        'test': load_manifest(Path(args.test_manifest)),
    }
    if args.challenge_manifest:
        manifests['challenge'] = load_manifest(Path(args.challenge_manifest))

    summary = {'manifests': {}, 'overlaps': {}}
    for name, df in manifests.items():
        summary['manifests'][name] = manifest_stats(df)

    names = list(manifests.keys())
    for index, left_name in enumerate(names):
        for right_name in names[index + 1:]:
            left_df = manifests[left_name]
            right_df = manifests[right_name]
            key = f'{left_name}/{right_name}'
            summary['overlaps'][key] = {
                'sample_id': overlap_count(left_df, right_df, 'sample_id'),
                'relative_path': overlap_count(left_df, right_df, 'relative_path'),
                'group_id': overlap_count(left_df, right_df, 'group_id'),
            }

    out_text = json.dumps(summary, indent=2)
    if args.output_root:
        out_root = Path(args.output_root)
        out_root.mkdir(parents=True, exist_ok=True)
        out_path = out_root / 'nsfw_split_audit.json'
        out_path.write_text(out_text, encoding='utf-8')
    print(out_text)


if __name__ == '__main__':
    main()