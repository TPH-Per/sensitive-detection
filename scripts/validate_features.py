"""
validate_features.py — V6.1
=============================
Gate 3: Validate file .npy 775-dim trước khi train E2E.

Kiểm tra:
  - Shape: [T, 775]
  - Không có NaN, Inf
  - CLIP features ([:768]) có variance
  - Gore/SelfHarm/NSFW values ∈ [0, 1]
  - Expert "flat theo thoi gian" chi la soft-warning
    (video de/non-gore thuong co score on dinh gan 0 la binh thuong)
  - Chi FAIL khi gap loi cung: shape/NaN/Inf/out-of-range/global stuck

Chạy trên 100 file sample trước khi extract toàn bộ.
PASS: khong co hard-issues → proceed (co the kem soft-warnings)
FAIL: co hard-issues → debug build_features_v6.py trước
"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import glob
import logging
import random
import numpy as np

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

EXPECTED_DIM = 775
GORE_IDX     = 772
SELFHARM_IDX = 773
NSFW_IDX     = 774


def validate_feature_file(npy_path: str) -> tuple[list[str], list[str], dict]:
    """
    Validate một file .npy 775-dim.
    Returns:
      hard_issues: fail conditions
      soft_warnings: informational warnings
      stats: per-expert summary
    """
    hard_issues = []
    soft_warnings = []
    stats = {}
    try:
        data = np.load(npy_path)
    except Exception as e:
        return [f"LOAD_ERROR: {e}"], [], stats

    if data.ndim != 2:
        return [f"SHAPE_ERROR: ndim={data.ndim} (expected 2 -> [T, {EXPECTED_DIM}])"], [], stats

    T, D = data.shape

    if D != EXPECTED_DIM:
        hard_issues.append(f"DIM_ERROR: {D} != {EXPECTED_DIM}")

    if np.isnan(data).any():
        hard_issues.append(f"NAN_ERROR: count={int(np.isnan(data).sum())}")

    if np.isinf(data).any():
        hard_issues.append(f"INF_ERROR: count={int(np.isinf(data).sum())}")

    if T < 4:
        hard_issues.append(f"T_ERROR: T={T} (expected >= 4)")

    if D >= 768:
        clip_std = data[:, :768].std()
        if clip_std < 1e-8:
            hard_issues.append(f"CLIP_STUCK_ERROR: std={clip_std:.2e}")

    def check_expert(idx: int, name: str):
        vals = data[:, idx].astype(np.float32)
        v_std = float(np.std(vals))
        v_mean = float(np.mean(vals))
        v_min = float(np.min(vals))
        v_max = float(np.max(vals))

        stats[name] = {
            "mean": v_mean,
            "std": v_std,
            "min": v_min,
            "max": v_max,
        }

        if v_min < -0.01 or v_max > 1.01:
            hard_issues.append(f"{name}_RANGE_ERROR: [{v_min:.4f}, {v_max:.4f}]")
            return

        # Flat temporal scores are common for easy negatives/positives.
        # Only warn when the score is near-flat in ambiguous zone.
        if v_std < 1e-4 and 0.15 <= v_mean <= 0.85:
            soft_warnings.append(f"{name}_FLAT_WARN: std={v_std:.2e}, mean={v_mean:.4f}")

    if D > GORE_IDX:
        check_expert(GORE_IDX, "GORE")

    if D > SELFHARM_IDX:
        check_expert(SELFHARM_IDX, "SELFHARM")

    if D > NSFW_IDX:
        check_expert(NSFW_IDX, "NSFW")

    return hard_issues, soft_warnings, stats


def main():
    parser = argparse.ArgumentParser(description="Validate 775-dim .npy feature files (Gate 3)")
    parser.add_argument('--features_dir', required=True, help='Root directory containing .npy files')
    parser.add_argument('--n_sample', type=int, default=100, help='Number of files to sample')
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    feat_root = Path(args.features_dir)
    all_npy = list(feat_root.rglob("*.npy"))

    if not all_npy:
        logging.error(f"[FAIL] No .npy files found in {feat_root}")
        sys.exit(1)

    logging.info(f"Found {len(all_npy)} .npy files total")
    logging.info(f"Sampling {min(args.n_sample, len(all_npy))} for validation...")

    random.seed(args.seed)
    sample = random.sample(all_npy, min(args.n_sample, len(all_npy)))

    total_hard = 0
    total_soft = 0
    per_hard_counts = {}
    per_soft_counts = {}

    gore_means, sh_means, nsfw_means = [], [], []

    for npy_path in sample:
        hard_issues, soft_warnings, stats = validate_feature_file(str(npy_path))

        if "GORE" in stats:
            gore_means.append(stats["GORE"]["mean"])
        if "SELFHARM" in stats:
            sh_means.append(stats["SELFHARM"]["mean"])
        if "NSFW" in stats:
            nsfw_means.append(stats["NSFW"]["mean"])

        if hard_issues:
            total_hard += len(hard_issues)
            logging.error(f"  HARD ISSUES in {npy_path.name}:")
            for iss in hard_issues:
                logging.error(f"    - {iss}")
                key = iss.split(':')[0]
                per_hard_counts[key] = per_hard_counts.get(key, 0) + 1

        if soft_warnings:
            total_soft += len(soft_warnings)
            logging.warning(f"  SOFT WARNINGS in {npy_path.name}:")
            for warn in soft_warnings:
                logging.warning(f"    - {warn}")
                key = warn.split(':')[0]
                per_soft_counts[key] = per_soft_counts.get(key, 0) + 1

    # Global stuck detector: if expert means are almost constant and ambiguous.
    def global_stuck_issue(name: str, means: list[float]) -> str | None:
        if len(means) < 10:
            return None
        arr = np.asarray(means, dtype=np.float32)
        spread = float(np.percentile(arr, 90) - np.percentile(arr, 10))
        mu = float(np.mean(arr))
        if spread < 1e-3 and 0.2 <= mu <= 0.8:
            return f"{name}_GLOBAL_STUCK_ERROR: p90-p10={spread:.2e}, mean={mu:.4f}"
        return None

    for name, means in [("GORE", gore_means), ("SELFHARM", sh_means), ("NSFW", nsfw_means)]:
        maybe_err = global_stuck_issue(name, means)
        if maybe_err is not None:
            total_hard += 1
            per_hard_counts[maybe_err.split(':')[0]] = per_hard_counts.get(maybe_err.split(':')[0], 0) + 1
            logging.error(f"  GLOBAL HARD ISSUE: {maybe_err}")

    print("\n" + "="*60)
    print(f"GATE 3 — Feature Validation Summary ({len(sample)} files)")
    print("="*60)

    if total_hard == 0:
        print(f"  [PASS] 0 hard issues across {len(sample)} files")
        if total_soft > 0:
            print(f"  [WARN] {total_soft} soft warnings (mostly flat temporal expert scores)")
            print("  [GO]   Proceed to E2E training")
            print("         (flat temporal scores are expected on many easy videos)")
        else:
            print("  [GO]   Proceed to E2E training")
        sys.exit(0)
    else:
        print(f"  [FAIL] {total_hard} hard issues found across {len(sample)} files")
        print("\n  Hard issue breakdown:")
        for issue_type, count in per_hard_counts.items():
            print(f"    {issue_type}: {count} files affected")
        if total_soft > 0:
            print(f"\n  Soft warnings observed: {total_soft}")
            for warn_type, count in per_soft_counts.items():
                print(f"    {warn_type}: {count} files affected")
        print("\n  [NO-GO] Debug build_features_v6.py before E2E training.")
        sys.exit(1)


if __name__ == '__main__':
    main()
