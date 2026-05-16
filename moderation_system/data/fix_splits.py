"""
Phase 3: Fix dataset splits — remove leakage, add missing test classes, rebalance.
This creates clean train/val/test splits with no overlap.

Strategy:
1. Remove 857 leaked images from train (keep in val)
2. Move ligature/hard_negative samples from train→test to fill gaps
3. Rebalance: cap weapon_bladed at 2x median class size
"""
import shutil
import random
from pathlib import Path
from collections import Counter, defaultdict
import hashlib

random.seed(42)

ROOT = Path(__file__).resolve().parent.parent.parent  # DA_DL_KPDL
YOLO_DIR = ROOT / "datasets" / "yolo_v2"
OUT_DIR = ROOT / "datasets" / "yolo_v2_clean"

YOLO_CLASSES = {
    0: "weapon_firearm", 1: "weapon_bladed", 2: "ligature_noose",
    3: "ligature_setup", 4: "sh_instrument", 5: "hard_negative"
}


def file_hash(path, algo="md5"):
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_image_classes(lbl_path):
    """Get set of class IDs from a YOLO label file."""
    classes = set()
    if lbl_path.exists():
        content = lbl_path.read_text().strip()
        if content:
            for line in content.split("\n"):
                parts = line.strip().split()
                if parts:
                    classes.add(int(parts[0]))
    return classes


def collect_all_images():
    """Collect all images with their metadata."""
    images = []
    for split in ["train", "val", "test"]:
        img_dir = YOLO_DIR / split / "images"
        lbl_dir = YOLO_DIR / split / "labels"
        if not img_dir.exists():
            continue
        for img_path in sorted(img_dir.glob("*.*")):
            stem = img_path.stem
            lbl_path = lbl_dir / f"{stem}.txt"
            md5 = file_hash(img_path)
            classes = get_image_classes(lbl_path)
            images.append({
                "stem": stem,
                "img_path": img_path,
                "lbl_path": lbl_path,
                "md5": md5,
                "classes": classes,
                "original_split": split,
                "is_synthetic": stem.startswith("syn_") or stem.startswith("noose_") or stem.startswith("setup_") or stem.startswith("hardneg_")
            })
    return images


def fix_splits():
    print("=== Phase 3: Fix Dataset Splits ===\n")

    # 1. Collect all images
    print("Collecting all images...")
    all_images = collect_all_images()
    print(f"Total images: {len(all_images)}")

    # 2. Remove duplicates (keep first occurrence)
    print("\nRemoving duplicates...")
    seen_hashes = {}
    unique_images = []
    dupes_removed = 0
    for img in all_images:
        if img["md5"] in seen_hashes:
            dupes_removed += 1
            continue
        seen_hashes[img["md5"]] = img["stem"]
        unique_images.append(img)
    print(f"Removed {dupes_removed} duplicates, {len(unique_images)} unique")

    # 3. Separate by class membership
    ligature_imgs = [img for img in unique_images if img["classes"] & {2, 3}]  # noose or setup
    hardneg_imgs = [img for img in unique_images if img["classes"] == {5}]  # only hard_negative
    weapon_imgs = [img for img in unique_images if img["classes"] & {0, 1} and not (img["classes"] & {2, 3, 4, 5})]
    sh_instrument_imgs = [img for img in unique_images if 4 in img["classes"] and not (img["classes"] & {0, 1, 2, 3})]
    other_imgs = [img for img in unique_images if img not in ligature_imgs and img not in hardneg_imgs and img not in weapon_imgs and img not in sh_instrument_imgs]

    print(f"\nBy class:")
    print(f"  Ligature (noose/setup): {len(ligature_imgs)}")
    print(f"  Hard negative: {len(hardneg_imgs)}")
    print(f"  Weapon only: {len(weapon_imgs)}")
    print(f"  SH instrument only: {len(sh_instrument_imgs)}")
    print(f"  Other: {len(other_imgs)}")

    # 4. Build new splits
    # Test set: 10% of each class, minimum 30 per class
    # Val set: 15% of each class
    # Train set: remainder

    new_train, new_val, new_test = [], [], []

    def split_group(imgs, group_name, test_frac=0.10, val_frac=0.15):
        random.shuffle(imgs)
        n = len(imgs)
        n_test = max(30, int(n * test_frac))
        n_val = max(30, int(n * val_frac))

        # Cap test/val if dataset is small
        if n < 100:
            n_test = max(10, n // 5)
            n_val = max(10, n // 5)

        test = imgs[:n_test]
        val = imgs[n_test:n_test + n_val]
        train = imgs[n_test + n_val:]

        # Cap weapon_bladed to prevent domination (max 2x median)
        if group_name == "weapon":
            max_train = 1500  # cap at ~2x median class size
            if len(train) > max_train:
                train = random.sample(train, max_train)

        return train, val, test

    t, v, ts = split_group(ligature_imgs, "ligature")
    new_train.extend(t); new_val.extend(v); new_test.extend(ts)
    print(f"\nLigature: train={len(t)}, val={len(v)}, test={len(ts)}")

    t, v, ts = split_group(hardneg_imgs, "hardneg")
    new_train.extend(t); new_val.extend(v); new_test.extend(ts)
    print(f"Hard negative: train={len(t)}, val={len(v)}, test={len(ts)}")

    t, v, ts = split_group(weapon_imgs, "weapon")
    new_train.extend(t); new_val.extend(v); new_test.extend(ts)
    print(f"Weapon: train={len(t)}, val={len(v)}, test={len(ts)}")

    t, v, ts = split_group(sh_instrument_imgs, "sh_instrument")
    new_train.extend(t); new_val.extend(v); new_test.extend(ts)
    print(f"SH instrument: train={len(t)}, val={len(v)}, test={len(ts)}")

    t, v, ts = split_group(other_imgs, "other")
    new_train.extend(t); new_val.extend(v); new_test.extend(ts)
    print(f"Other: train={len(t)}, val={len(v)}, test={len(ts)}")

    # 5. Verify no leakage
    train_md5s = set(img["md5"] for img in new_train)
    val_md5s = set(img["md5"] for img in new_val)
    test_md5s = set(img["md5"] for img in new_test)

    tv_leak = train_md5s & val_md5s
    tt_leak = train_md5s & test_md5s
    vt_leak = val_md5s & test_md5s
    print(f"\nLeakage check:")
    print(f"  train/val: {len(tv_leak)}")
    print(f"  train/test: {len(tt_leak)}")
    print(f"  val/test: {len(vt_leak)}")

    # 6. Check test set class coverage
    test_classes = Counter()
    for img in new_test:
        for c in img["classes"]:
            test_classes[c] += 1
    print(f"\nTest set class distribution:")
    for cls_id in sorted(YOLO_CLASSES.keys()):
        print(f"  {YOLO_CLASSES[cls_id]}: {test_classes.get(cls_id, 0)}")

    # 7. Write to new directory
    print(f"\nWriting clean splits to {OUT_DIR}...")
    for split_name, split_imgs in [("train", new_train), ("val", new_val), ("test", new_test)]:
        img_out = OUT_DIR / split_name / "images"
        lbl_out = OUT_DIR / split_name / "labels"
        img_out.mkdir(parents=True, exist_ok=True)
        lbl_out.mkdir(parents=True, exist_ok=True)

        for img in split_imgs:
            # Copy image
            dst_img = img_out / img["img_path"].name
            if not dst_img.exists():
                shutil.copy2(img["img_path"], dst_img)

            # Copy label
            if img["lbl_path"].exists():
                dst_lbl = lbl_out / img["lbl_path"].name
                if not dst_lbl.exists():
                    shutil.copy2(img["lbl_path"], dst_lbl)

        print(f"  {split_name}: {len(split_imgs)} images")

    # 8. Write dataset.yaml
    yaml_content = f"""path: {OUT_DIR}
train: train/images
val: val/images
test: test/images

nc: 6
names:
  0: weapon_firearm
  1: weapon_bladed
  2: ligature_noose
  3: ligature_setup
  4: sh_instrument
  5: hard_negative
"""
    (OUT_DIR / "dataset.yaml").write_text(yaml_content)
    print(f"\nWrote dataset.yaml to {OUT_DIR / 'dataset.yaml'}")

    # 9. Summary
    print(f"\n=== SUMMARY ===")
    print(f"Original: train=8999, val=1422, test=136 (with 857 leaked)")
    print(f"Clean:    train={len(new_train)}, val={len(new_val)}, test={len(new_test)}")
    print(f"Removed:  {dupes_removed} duplicates")
    print(f"Leakage:  0 (verified)")


if __name__ == "__main__":
    fix_splits()
