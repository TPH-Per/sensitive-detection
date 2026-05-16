import csv
import os
from pathlib import Path

def clean_leakage():
    report_file = "split_leakage_report.csv"
    if not os.path.exists(report_file):
        print(f"{report_file} not found.")
        return
        
    removed_count = 0
    with open(report_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            img2 = row['img2']
            
            if os.path.exists(img2):
                try:
                    os.remove(img2)
                    removed_count += 1
                    
                    # Check for yolo label file
                    img_path = Path(img2)
                    if "images" in img_path.parts:
                        parts = list(img_path.parts)
                        idx = parts.index("images")
                        parts[idx] = "labels"
                        label_path = Path(*parts).with_suffix(".txt")
                        if label_path.exists():
                            os.remove(label_path)
                            
                except Exception as e:
                    print(f"Error removing {img2}: {e}")
                    
    print(f"Removed {removed_count} leaked images (and corresponding labels) from validation/test sets.")

if __name__ == "__main__":
    clean_leakage()
