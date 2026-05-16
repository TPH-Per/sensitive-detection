import os
import shutil
import random
from pathlib import Path

def merge_hod_weapons(hod_root: str, ucf101_root: str, output_dir: str, negative_per_class: int = 2000):
    """
    Merge HOD/gun and HOD/knife datasets into a single YOLOv8 'weapon' class (class_id=0).
    Adds negative samples from UCF101.
    """
    in_root = Path(hod_root)
    out_root = Path(output_dir)
    ucf_root = Path(ucf101_root)
    
    print(f"Preparing YOLOv6 data at {output_dir}...")
    
    # 1. Create directories
    for split in ['train', 'valid', 'test']:
        for folder in ['images', 'labels']:
            (out_root / split / folder).mkdir(parents=True, exist_ok=True)
            
    # 2. Collect positive images (gun + knife)
    positives = []
    for weapon in ['gun', 'knife']:
        weapon_dir = list(in_root.glob(f"{weapon}-*"))
        if not weapon_dir:
            print(f"  Warning: Cannot find {weapon} dir in {in_root}")
            continue
        
        weapon_root = weapon_dir[0] / weapon
        for case in ['normal_cases', 'hard_cases']:
            case_dir = weapon_root / case
            jpg_dir = case_dir / 'jpg'
            txt_dir = case_dir / 'txt'
            
            if jpg_dir.exists() and txt_dir.exists():
                for img_path in jpg_dir.glob("*.jpg"):
                    lbl_path = txt_dir / (img_path.stem + ".txt")
                    if lbl_path.exists():
                        positives.append((img_path, lbl_path))

    print(f"  Found {len(positives)} positive weapon images.")
    if not positives:
        raise RuntimeError(
            "No positive weapon images found. Check --hod_root and HOD gun/knife folder structure before continuing."
        )
    
    # Shuffle and split positives (70/15/15)
    random.seed(42)
    random.shuffle(positives)
    n_pos = len(positives)
    t_idx = int(n_pos * 0.7)
    v_idx = int(n_pos * 0.85)
    
    splits = {
        'train': positives[:t_idx],
        'valid': positives[t_idx:v_idx],
        'test': positives[v_idx:]
    }

    # 3. Process positives (Normalize labels to class 0)
    for split_name, items in splits.items():
        for img_path, lbl_path in items:
            dest_img = out_root / split_name / 'images' / f"{img_path.parent.parent.parent.parent.name}_{img_path.name}"
            dest_lbl = out_root / split_name / 'labels' / f"{img_path.parent.parent.parent.parent.name}_{lbl_path.name}"
            
            # Copy image
            shutil.copy(img_path, dest_img)
            
            # Rewrite label with class 0
            with open(lbl_path, 'r') as f_in, open(dest_lbl, 'w') as f_out:
                for line in f_in:
                    parts = line.strip().split()
                    if parts:
                        parts[0] = '0' # Force weapon class
                        f_out.write(" ".join(parts) + "\n")
    
    # 4. Collect negatives (UCF101 frames)
    # Split by video id to avoid leakage across train/val/test.
    negatives = []
    if ucf_root.exists():
        all_jpgs = list(ucf_root.rglob("*.jpg"))
        if all_jpgs:
            def infer_video_id(img_path: Path) -> str:
                stem = img_path.stem
                if '_' in stem:
                    base, tail = stem.rsplit('_', 1)
                    try:
                        float(tail)
                        return base
                    except ValueError:
                        return stem
                return stem

            groups = {}
            for p in all_jpgs:
                vid = infer_video_id(p)
                groups.setdefault(vid, []).append(p)

            video_ids = sorted(groups.keys())
            random.shuffle(video_ids)
            selected_ids = video_ids[:min(negative_per_class, len(video_ids))]
            negatives = [p for vid in selected_ids for p in groups[vid]]
            print(f"  Found {len(negatives)} negative images from UCF101 ({len(selected_ids)} videos).")

            n_neg = len(negatives)
            nt_idx = int(n_neg * 0.7)
            nv_idx = int(n_neg * 0.85)

            neg_splits = {
                'train': negatives[:nt_idx],
                'valid': negatives[nt_idx:nv_idx],
                'test': negatives[nv_idx:]
            }

            for split_name, items in neg_splits.items():
                for img_path in items:
                    dest_img = out_root / split_name / 'images' / f"neg_{img_path.name}"
                    dest_lbl = out_root / split_name / 'labels' / f"neg_{img_path.stem}.txt"
                    shutil.copy(img_path, dest_img)
                    # Create empty label file (background)
                    open(dest_lbl, 'w').close()
        else:
            raise RuntimeError(
                "No .jpg files found in UCF101 root. Run Cell 0.8 first to extract UCF-101 frames before Cell 1."
            )
    else:
        raise RuntimeError(
            f"UCF101 root {ucf101_root} does not exist. Run Cell 0.8 or fix --ucf101_root before Cell 1."
        )


    # 5. Write data.yaml
    print("Writing YOLO data.yaml...")
    yaml_path = out_root / "weapon_v6.yaml"
    with open(yaml_path, 'w', encoding='utf-8') as f:
        f.write(f"path: {out_root.absolute()}\n")
        f.write("train: train/images\n")
        f.write("val: valid/images\n")
        f.write("test: test/images\n\n")
        f.write("nc: 1\n")
        f.write("names: ['weapon']\n")
        
    print(f"YOLO data preparation complete! Data saved to {out_root}")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--hod_root', required=True)
    parser.add_argument('--ucf101_root', required=True)
    parser.add_argument('--output_dir', required=True)
    parser.add_argument('--negative_per_class', type=int, default=2000)
    args = parser.parse_args()
    
    merge_hod_weapons(args.hod_root, args.ucf101_root, args.output_dir, args.negative_per_class)
