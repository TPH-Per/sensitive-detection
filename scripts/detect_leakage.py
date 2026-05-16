import os
import csv
from pathlib import Path
from PIL import Image

def dhash(image_path, hash_size=8):
    try:
        with Image.open(image_path) as img:
            img = img.convert('L').resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
            pixels = list(img.getdata())
            diff = []
            for row in range(hash_size):
                for col in range(hash_size):
                    pixel_left = img.getpixel((col, row))
                    pixel_right = img.getpixel((col + 1, row))
                    diff.append(pixel_left > pixel_right)
            
            decimal_value = 0
            hex_string = []
            for index, value in enumerate(diff):
                if value:
                    decimal_value += 2**(index % 8)
                if (index % 8) == 7:
                    hex_string.append(hex(decimal_value)[2:].rjust(2, '0'))
                    decimal_value = 0
            return ''.join(hex_string)
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return None

def hamming_distance(chash1, chash2):
    return bin(int(chash1, 16) ^ int(chash2, 16)).count('1')

def main():
    datasets_dir = Path("datasets")
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp"}
    
    # We want to audit the main datasets
    target_datasets = ["vit_suicide", "yolo_v2", "yolo_v2_clean", "unified_v1", "selfharm_v2"]
    
    total_leakage = []

    for ds_name in target_datasets:
        ds_path = datasets_dir / ds_name
        if not ds_path.exists():
            continue
            
        print(f"\nAuditing {ds_name}...")
        
        split_hashes = {}
        for split in ["train", "val", "test"]:
            split_path = ds_path / split
            if not split_path.exists():
                continue
                
            print(f"  Hashing {split} split...")
            split_hashes[split] = {}
            for root, _, files in os.walk(split_path):
                for file in files:
                    if Path(file).suffix.lower() in image_extensions:
                        img_path = os.path.join(root, file)
                        h = dhash(img_path)
                        if h:
                            split_hashes[split][img_path] = h
                            
        # Compare across splits
        splits = list(split_hashes.keys())
        for i, split1 in enumerate(splits):
            for split2 in splits[i+1:]:
                print(f"  Comparing {split1} vs {split2}...")
                
                # Check for exact matches (Hamming distance 0) to be fast
                hash_to_paths_1 = {}
                for p, h in split_hashes[split1].items():
                    hash_to_paths_1.setdefault(h, []).append(p)
                    
                for p2, h2 in split_hashes[split2].items():
                    if h2 in hash_to_paths_1:
                        for p1 in hash_to_paths_1[h2]:
                            total_leakage.append({
                                "dataset": ds_name, 
                                "split1": split1, 
                                "img1": str(p1), 
                                "split2": split2, 
                                "img2": str(p2), 
                                "distance": 0
                            })
                            
    # Write combined report
    report_path = "split_leakage_report.csv"
    if total_leakage:
        with open(report_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["dataset", "split1", "img1", "split2", "img2", "distance"])
            writer.writeheader()
            writer.writerows(total_leakage)
        print(f"\nFound {len(total_leakage)} exact cross-split duplicates across datasets. Saved to {report_path}.")
    else:
        print("\nNo exact cross-split leakage found.")

if __name__ == "__main__":
    main()
