import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import argparse
import logging

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def _norm_feature_path(p: str) -> str:
    s = str(p).strip().replace("\\", "/")
    while "//" in s:
        s = s.replace("//", "/")
    # Remove only relative prefixes "./", keep absolute root "/" intact.
    while s.startswith("./"):
        s = s[2:]
    return s


def _feature_name_key(p: str) -> str:
    return Path(_norm_feature_path(p)).name


def _load_feature_map(features_manifest: Path) -> tuple[pd.DataFrame, pd.DataFrame, set[str]]:
    df = pd.read_csv(features_manifest)
    required = ["feature_path", "video_path"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"{features_manifest} missing required columns: {missing}")

    df = df.copy()
    df["feature_key_full"] = df["feature_path"].map(_norm_feature_path)
    df["feature_key_name"] = df["feature_path"].map(_feature_name_key)

    # Safety check: one feature path must map to one video path.
    dup_full = (
        df.groupby("feature_key_full", as_index=False)["video_path"]
        .nunique()
        .rename(columns={"video_path": "video_path_nunique"})
    )
    bad_full = dup_full[dup_full["video_path_nunique"] > 1]
    if len(bad_full):
        raise ValueError(
            f"Found {len(bad_full)} conflicting full-path keys in features_manifest. "
            f"Example: {bad_full.iloc[0]['feature_key_full']}"
        )

    full_map = df.drop_duplicates(subset=["feature_key_full"])[["feature_key_full", "video_path"]].copy()

    # Basename collisions are dangerous; only keep unique basename keys for fallback.
    name_count = df.groupby("feature_key_name", as_index=False)["feature_key_full"].nunique()
    collision_df = name_count[name_count["feature_key_full"] > 1]
    collision_keys = set(collision_df["feature_key_name"].astype(str).tolist())
    if collision_keys:
        logging.warning(
            "Detected %d basename collisions in features_manifest. "
            "Fallback by basename will skip collided keys.",
            len(collision_keys),
        )

    base_unique = df[~df["feature_key_name"].isin(collision_keys)]
    base_map = base_unique.drop_duplicates(subset=["feature_key_name"])[["feature_key_name", "video_path"]].copy()
    return full_map, base_map, collision_keys


def _convert_split(
    split_df: pd.DataFrame,
    full_map: pd.DataFrame,
    base_map: pd.DataFrame,
    collision_keys: set[str],
    split_name: str,
) -> pd.DataFrame:
    out = split_df.copy()
    if "feature_path" not in out.columns:
        raise ValueError(f"{split_name} manifest missing feature_path column")

    out["feature_key_full"] = out["feature_path"].map(_norm_feature_path)
    out["feature_key_name"] = out["feature_path"].map(_feature_name_key)

    full_dict = dict(zip(full_map["feature_key_full"], full_map["video_path"]))
    base_dict = dict(zip(base_map["feature_key_name"], base_map["video_path"]))

    # Prefer explicit video_path from split manifest when available (strongest source).
    if "video_path" in out.columns:
        out["video_path"] = out["video_path"].astype(str).str.strip()
        out.loc[out["video_path"].str.lower().isin(["nan", "none"]), "video_path"] = ""
    else:
        out["video_path"] = ""

    empty_or_missing = out["video_path"].isna() | (out["video_path"] == "")
    out.loc[empty_or_missing, "video_path"] = out.loc[empty_or_missing, "feature_key_full"].map(full_dict)

    missing_mask = out["video_path"].isna() | (out["video_path"] == "")
    if missing_mask.any():
        out.loc[missing_mask, "video_path"] = out.loc[missing_mask, "feature_key_name"].map(base_dict)
    merged = out

    missing = (merged["video_path"].isna() | (merged["video_path"] == "")).sum()
    if missing > 0:
        logging.warning("%s: %d rows missing video_path mapping", split_name, int(missing))
    collision_hits = int((missing_mask & out["feature_key_name"].isin(collision_keys)).sum())
    if collision_hits > 0:
        logging.warning(
            "%s: %d missing rows belong to basename-collision keys; "
            "need full-path-consistent manifests to recover them safely",
            split_name,
            collision_hits,
        )

    keep_cols = ["video_path", "feature_path", "violence", "self_harm", "nsfw"]
    for col in keep_cols:
        if col not in merged.columns:
            if col in ("self_harm", "nsfw"):
                merged[col] = 0.0
            else:
                raise ValueError(f"{split_name}: missing required column {col}")

    result = merged[keep_cols].copy()
    result = result.dropna(subset=["video_path"]).reset_index(drop=True)
    return result


def main():
    parser = argparse.ArgumentParser(description="Prepare V7 video manifests from V6 split manifests + features_manifest")
    parser.add_argument("--split_manifest_dir", required=True, help="Directory containing train_manifest.csv/val_manifest.csv/test_manifest.csv")
    parser.add_argument("--features_manifest", required=True, help="Path to features_v6/features_manifest.csv")
    parser.add_argument("--output_dir", required=True, help="Output directory for V7 video manifests")
    args = parser.parse_args()

    split_dir = Path(args.split_manifest_dir)
    features_manifest = Path(args.features_manifest)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    full_map, base_map, collision_keys = _load_feature_map(features_manifest)
    logging.info(
        "Loaded feature map: full_keys=%d unique_basename_keys=%d collisions=%d",
        len(full_map),
        len(base_map),
        len(collision_keys),
    )

    for split in ("train", "val", "test"):
        in_csv = split_dir / f"{split}_manifest.csv"
        if not in_csv.exists():
            raise FileNotFoundError(f"Missing split manifest: {in_csv}")
        split_df = pd.read_csv(in_csv)
        out_df = _convert_split(
            split_df=split_df,
            full_map=full_map,
            base_map=base_map,
            collision_keys=collision_keys,
            split_name=split,
        )
        out_csv = out_dir / f"{split}_video_manifest.csv"
        out_df.to_csv(out_csv, index=False)
        logging.info("%s -> %s rows=%d", in_csv.name, out_csv.name, len(out_df))

    logging.info("Done. V7 video manifests saved to %s", out_dir)


if __name__ == "__main__":
    main()
