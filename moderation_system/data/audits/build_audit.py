"""
Phase 1: Build error_audit.csv — comprehensive audit of current moderation pipeline.
Analyzes dataset quality, leakage, label distributions, and model artifacts.
"""
import csv
import hashlib
import json
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # DA_DL_KPDL
YOLO_DIR = ROOT / "datasets" / "yolo_v2"
VIT_DIR = ROOT / "datasets" / "vit_suicide"
MODELS_DIR = ROOT / "final_artifacts_v6"
AUDIT_DIR = Path(__file__).resolve().parent

YOLO_CLASSES = {
    0: "weapon_firearm", 1: "weapon_bladed", 2: "ligature_noose",
    3: "ligature_setup", 4: "sh_instrument", 5: "hard_negative"
}

WEAPON_CLASSES = {0, 1}
SELFSHARM_CLASSES = {2, 3, 4}


def file_hash(path, algo="md5"):
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def audit_yolo_dataset():
    """Audit YOLO v2 6-class dataset."""
    rows = []
    all_hashes = {}  # md5 -> first occurrence
    duplicate_groups = defaultdict(list)

    for split in ["train", "val", "test"]:
        img_dir = YOLO_DIR / split / "images"
        lbl_dir = YOLO_DIR / split / "labels"
        if not img_dir.exists():
            continue

        for img_path in sorted(img_dir.glob("*.*")):
            stem = img_path.stem
            lbl_path = lbl_dir / f"{stem}.txt"

            # Hash for dedup
            md5 = file_hash(img_path)
            is_dupe = False
            dupe_of = ""
            if md5 in all_hashes:
                is_dupe = True
                dupe_of = all_hashes[md5]
                duplicate_groups[md5].append(f"{split}/{stem}")
            else:
                all_hashes[md5] = f"{split}/{stem}"
                duplicate_groups[md5].append(f"{split}/{stem}")

            # Parse labels
            classes = []
            n_boxes = 0
            if lbl_path.exists():
                content = lbl_path.read_text().strip()
                if content:
                    for line in content.split("\n"):
                        parts = line.strip().split()
                        if len(parts) >= 5:
                            cls_id = int(parts[0])
                            classes.append(cls_id)
                            n_boxes += 1

            class_names = [YOLO_CLASSES.get(c, f"unknown_{c}") for c in classes]
            is_ligature = any(c in SELFSHARM_CLASSES for c in classes)
            is_weapon = any(c in WEAPON_CLASSES for c in classes)
            is_empty = n_boxes == 0

            rows.append({
                "source": "yolo_v2",
                "split": split,
                "image_id": stem,
                "image_path": str(img_path),
                "md5": md5,
                "n_boxes": n_boxes,
                "classes": ";".join(class_names),
                "has_ligature": is_ligature,
                "has_weapon": is_weapon,
                "is_empty_label": is_empty,
                "is_duplicate": is_dupe,
                "duplicate_of": dupe_of,
                "error_flag": "",
                "notes": ""
            })

    # Flag issues
    for row in rows:
        flags = []
        if row["is_duplicate"]:
            flags.append("DUPLICATE")
        if row["is_empty_label"]:
            flags.append("EMPTY_LABEL")
        if row["split"] == "test" and row["has_ligature"]:
            flags.append("LIGATURE_IN_TEST")
        row["error_flag"] = ";".join(flags)

    return rows, duplicate_groups


def audit_vit_suicide():
    """Audit ViT suicide classifier dataset."""
    rows = []
    for split in ["train", "val"]:
        for cls_name in ["safe", "suicide_risk"]:
            cls_dir = VIT_DIR / split / cls_name
            if not cls_dir.exists():
                continue
            for img_path in sorted(cls_dir.glob("*.jpg")):
                md5 = file_hash(img_path)
                rows.append({
                    "source": "vit_suicide",
                    "split": split,
                    "image_id": img_path.stem,
                    "image_path": str(img_path),
                    "md5": md5,
                    "n_boxes": 0,
                    "classes": cls_name,
                    "has_ligature": cls_name == "suicide_risk",
                    "has_weapon": False,
                    "is_empty_label": False,
                    "is_duplicate": False,
                    "duplicate_of": "",
                    "error_flag": "SYNTHETIC_ONLY" if cls_name == "suicide_risk" else "",
                    "notes": "synthetic_v2 OpenCV generated" if cls_name == "suicide_risk" else ""
                })
    return rows


def check_train_val_leakage():
    """Check for train/val leakage by image hash."""
    train_hashes = {}
    val_hashes = {}
    leaked = []

    for split, hash_store in [("train", train_hashes), ("val", val_hashes)]:
        img_dir = YOLO_DIR / split / "images"
        if not img_dir.exists():
            continue
        for img_path in img_dir.glob("*.*"):
            md5 = file_hash(img_path)
            hash_store[md5] = img_path.name

    for md5, val_name in val_hashes.items():
        if md5 in train_hashes:
            leaked.append({
                "val_image": val_name,
                "train_image": train_hashes[md5],
                "md5": md5
            })
    return leaked


def audit_model_artifacts():
    """Snapshot model files and their metadata."""
    rows = []
    model_files = {
        "yolov8_v2_final.pt": "YOLO v2 6-class detector",
        "yolov8_weapon_v6_best.pt": "YOLO v6 weapon detector (old)",
        "gore_detector_v6_best.pth": "CNN gore/violence classifier",
        "nsfw_classifier_v6_best.pth": "CNN NSFW classifier",
        "selfharm_detector_v6_best.pth": "CNN self-harm classifier",
        "task_gated_v6_best.pth": "Task-gated ensemble model",
    }

    for fname, desc in model_files.items():
        path = MODELS_DIR / fname
        if path.exists():
            rows.append({
                "model_name": fname,
                "description": desc,
                "size_mb": round(path.stat().st_size / 1e6, 1),
                "exists": True
            })
        else:
            rows.append({
                "model_name": fname,
                "description": desc,
                "size_mb": 0,
                "exists": False
            })

    # Check ViT suicide
    vit_dir = MODELS_DIR / "vit_suicide_best"
    if vit_dir.exists():
        model_json = vit_dir / "config.json"
        rows.append({
            "model_name": "vit_suicide_best",
            "description": "ViT suicide classifier (NSFW backbone)",
            "size_mb": round(sum(f.stat().st_size for f in vit_dir.rglob("*") if f.is_file()) / 1e6, 1),
            "exists": True
        })

    return rows


def build_error_audit():
    """Build comprehensive error_audit.csv."""
    print("=== Phase 1 Error Audit ===\n")

    # 1. YOLO dataset audit
    print("Auditing YOLO v2 dataset...")
    yolo_rows, dupes = audit_yolo_dataset()
    print(f"  {len(yolo_rows)} images audited")

    # 2. ViT suicide audit
    print("Auditing ViT suicide dataset...")
    vit_rows = audit_vit_suicide()
    print(f"  {len(vit_rows)} images audited")

    # 3. Train/val leakage
    print("Checking train/val leakage...")
    leaked = check_train_val_leakage()
    print(f"  {len(leaked)} leaked images found!")

    # 4. Model artifacts
    print("Auditing model artifacts...")
    model_rows = audit_model_artifacts()

    # Write main audit CSV
    all_rows = yolo_rows + vit_rows
    out_csv = AUDIT_DIR / "error_audit.csv"
    fieldnames = [
        "source", "split", "image_id", "image_path", "md5", "n_boxes",
        "classes", "has_ligature", "has_weapon", "is_empty_label",
        "is_duplicate", "duplicate_of", "error_flag", "notes"
    ]
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"\nWrote {len(all_rows)} rows to {out_csv}")

    # Write leakage report
    leak_csv = AUDIT_DIR / "leakage_report.csv"
    with open(leak_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["val_image", "train_image", "md5"])
        writer.writeheader()
        writer.writerows(leaked)
    print(f"Wrote {len(leaked)} leakage rows to {leak_csv}")

    # Write model snapshot
    model_csv = AUDIT_DIR / "model_snapshot.csv"
    with open(model_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["model_name", "description", "size_mb", "exists"])
        writer.writeheader()
        writer.writerows(model_rows)

    # Summary stats
    print("\n=== AUDIT SUMMARY ===")
    splits = Counter(r["split"] for r in yolo_rows)
    print(f"YOLO splits: {dict(splits)}")

    class_counts = Counter()
    for r in yolo_rows:
        for c in r["classes"].split(";"):
            if c:
                class_counts[c] += 1
    print(f"YOLO class distribution:")
    for cls, cnt in class_counts.most_common():
        print(f"  {cls}: {cnt}")

    n_dupes = sum(1 for r in yolo_rows if r["is_duplicate"])
    n_empty = sum(1 for r in yolo_rows if r["is_empty_label"])
    print(f"\nDuplicate images: {n_dupes}")
    print(f"Empty labels: {n_empty}")
    print(f"Train/val leakage: {len(leaked)} images")

    # Test set gaps
    test_rows = [r for r in yolo_rows if r["split"] == "test"]
    test_classes = set()
    for r in test_rows:
        for c in r["classes"].split(";"):
            if c:
                test_classes.add(c)
    missing = set(YOLO_CLASSES.values()) - test_classes
    if missing:
        print(f"\nWARNING: Test set MISSING classes: {missing}")

    return all_rows


if __name__ == "__main__":
    build_error_audit()
