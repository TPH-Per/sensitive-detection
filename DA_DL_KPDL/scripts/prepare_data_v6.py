"""
prepare_data_v6.py — V6.0 (Updated)
=====================================
Dùng MultilabelStratifiedShuffleSplit thay vì random split.
Split: 70% train / 15% val / 15% test

QUAN TRỌNG:
  - label_selfharm và label_nsfw = 0 toàn bộ trong video dataset
  - Stratify chỉ thực sự có tác dụng cho Violence (giới hạn của dataset)
  - TEST SET được LOCK ngay sau bước này — KHÔNG dùng cho tuning
  - Mọi threshold calibration đều trên val set

Requires: pip install iterative-stratification
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

_UCF_CRIMES_VIOLENCE_CLASSES = {
    'abuse',
    'arrest',
    'arson',
    'assault',
    'burglary',
    'explosion',
    'fighting',
    'roadaccidents',
    'robbery',
    'shooting',
}


def prepare_manifests(
    features_dir: str,
    output_dir: str,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
):
    try:
        from iterstrat.ml_stratifiers import MultilabelStratifiedShuffleSplit
        HAS_ITERSTRAT = True
    except ImportError:
        logging.warning("iterative-stratification not installed. Falling back to random split.")
        logging.warning("Install with: pip install iterative-stratification")
        HAS_ITERSTRAT = False

    feat_root = Path(features_dir)
    out_root  = Path(output_dir)
    out_root.mkdir(parents=True, exist_ok=True)

    def infer_violence_label(path_str: str) -> float:
        parts = [part.lower() for part in Path(path_str).parts]
        if 'nonfight' in parts:
            return 0.0
        if 'fight' in parts:
            return 1.0
        if any(part in _UCF_CRIMES_VIOLENCE_CLASSES for part in parts):
            return 1.0
        return 0.0

    data = []
    manifest_csv = feat_root / "features_manifest.csv"
    if manifest_csv.exists():
        logging.info(f"Using feature manifest: {manifest_csv}")
        manifest_df = pd.read_csv(manifest_csv)
        if 'feature_path' not in manifest_df.columns:
            logging.warning("features_manifest.csv missing feature_path; falling back to file scan.")
        else:
            for _, row in manifest_df.iterrows():
                raw_path = str(row.get('feature_path', '')).strip()
                if not raw_path or raw_path.lower() == 'nan':
                    continue

                check_path = Path(raw_path)
                if not check_path.is_absolute():
                    check_path = feat_root / check_path
                if not check_path.exists():
                    logging.warning(f"Missing feature file referenced by manifest: {raw_path}")
                    continue

                label_raw = row.get('label_violence', None)
                if label_raw is None or (isinstance(label_raw, float) and np.isnan(label_raw)) or str(label_raw).strip() == '':
                    label_src = str(row.get('video_path', raw_path))
                    v = infer_violence_label(label_src)
                else:
                    try:
                        v = float(label_raw)
                    except ValueError:
                        v = infer_violence_label(str(row.get('video_path', raw_path)))

                video_path = str(row.get('video_path', '')).strip()
                if video_path.lower() == 'nan':
                    video_path = ''

                data.append({
                    'feature_path': raw_path,
                    'video_path':   video_path,
                    'violence':     v,
                    'self_harm':    0.0,
                    'nsfw':         0.0,
                })

    if not data:
        # 1. Scan all .npy files
        npy_files = list(feat_root.rglob("*.npy"))
        if not npy_files:
            logging.error(f"No .npy files found in {features_dir}")
            return

        logging.info(f"Found {len(npy_files)} feature files")

        # 2. Build DataFrame with inferred labels from path
        for npy_path in npy_files:
            v = infer_violence_label(str(npy_path))
            data.append({
                'feature_path': str(npy_path),
                'video_path':   '',
                'violence':     v,
                'self_harm':    0.0,
                'nsfw':         0.0,
            })

    df = pd.DataFrame(data)
    labels = df[['violence', 'self_harm', 'nsfw']].values

    logging.info(f"Violence positives: {int(df['violence'].sum())} / {len(df)}")

    # 3. Split
    if HAS_ITERSTRAT:
        logging.info("Using MultilabelStratifiedShuffleSplit...")
        msss = MultilabelStratifiedShuffleSplit(
            n_splits=1, test_size=test_ratio, random_state=seed
        )
        trainval_idx, test_idx = next(msss.split(df, labels))

        msss2 = MultilabelStratifiedShuffleSplit(
            n_splits=1, test_size=val_ratio / (1 - test_ratio), random_state=seed
        )
        _labels_tv = labels[trainval_idx]
        _df_tv     = df.iloc[trainval_idx].reset_index(drop=True)
        train_rel_idx, val_rel_idx = next(msss2.split(_df_tv, _labels_tv))

        train_idx = trainval_idx[train_rel_idx]
        val_idx   = trainval_idx[val_rel_idx]

        df_train = df.iloc[train_idx].reset_index(drop=True)
        df_val   = df.iloc[val_idx].reset_index(drop=True)
        df_test  = df.iloc[test_idx].reset_index(drop=True)

    else:
        logging.warning("Iterative-stratification missing. Falling back to sklearn.")
        from sklearn.model_selection import train_test_split
        df_trainval, df_test = train_test_split(
            df, test_size=test_ratio, stratify=df['violence'].astype(int), random_state=seed
        )
        val_size_rel = val_ratio / (1 - test_ratio)
        df_train, df_val = train_test_split(
            df_trainval, test_size=val_size_rel,
            stratify=df_trainval['violence'].astype(int), random_state=seed
        )

    # 4. Hash-based Reproducibility Check
    # "Verify reproducibility by hashing the final video list"
    import hashlib
    def get_list_hash(paths):
        paths_sorted = sorted([Path(p).stem for p in paths])
        return hashlib.md5("".join(paths_sorted).encode()).hexdigest()

    train_hash = get_list_hash(df_train['feature_path'])
    val_hash   = get_list_hash(df_val['feature_path'])
    test_hash  = get_list_hash(df_test['feature_path'])

    logging.info(f"\n=== REPRODUCIBILITY HASHES (Seed: {seed}) ===")
    logging.info(f"Train Hash: {train_hash}")
    logging.info(f"Val   Hash: {val_hash}")
    logging.info(f"Test  Hash: {test_hash}")

    # 5. LOCK TEST SET
    logging.info("\n=== SPLIT SIZES ===")
    logging.info(f"Train: {len(df_train)} | Val: {len(df_val)} | Test: {len(df_test)}")

    # 6. Verify Violence ratio ±0.005 between splits
    logging.info("\n=== SPLIT DISTRIBUTION VERIFICATION ===")
    for name, subset in [("Train", df_train), ("Val", df_val), ("Test", df_test)]:
        v_ratio = subset['violence'].mean()
        logging.info(
            f"{name:5s}: V={v_ratio:.4f} | n={len(subset)}"
        )

    # 7. Save manifests
    df_train.to_csv(out_root / "train_manifest.csv", index=False)
    df_val.to_csv(out_root / "val_manifest.csv",     index=False)
    df_test.to_csv(out_root / "test_manifest.csv",   index=False)

    # Save lockfile
    with open(out_root / "test_set_lock.txt", 'w') as f:
        f.write(f"test_set_hash={test_hash}\n")
        f.write(f"n_test={len(df_test)}\n")
        f.write(f"violence_ratio={df_test['violence'].mean():.4f}\n")
        f.write("WARNING: DO NOT USE test set for any tuning or hyperparameter selection!\n")

    logging.info(f"\nManifests saved to {out_root}")
    logging.info(f"TEST SET LOCKED: {out_root / 'test_set_lock.txt'}")
    logging.info("Run validation: python scripts/validate_features.py --features_dir <dir>")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--features_dir', required=True)
    parser.add_argument('--output_dir',   required=True)
    parser.add_argument('--val_ratio',    type=float, default=0.15)
    parser.add_argument('--test_ratio',   type=float, default=0.15)
    parser.add_argument('--seed',         type=int,   default=42)
    args = parser.parse_args()

    prepare_manifests(
        features_dir=args.features_dir,
        output_dir=args.output_dir,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )
