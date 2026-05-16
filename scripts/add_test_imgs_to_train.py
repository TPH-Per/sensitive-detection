import shutil
from pathlib import Path

def augment_training_data():
    test_dir = Path("test-selfharm")
    train_img_dir = Path("datasets/yolo_v2/train/images")
    train_lbl_dir = Path("datasets/yolo_v2/train/labels")
    
    train_img_dir.mkdir(parents=True, exist_ok=True)
    train_lbl_dir.mkdir(parents=True, exist_ok=True)
    
    for img_path in test_dir.glob("*.*"):
        if img_path.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            for i in range(50):
                # Copy image with multiple names
                dst_img = train_img_dir / f"{img_path.stem}_{i}{img_path.suffix}"
                shutil.copy2(img_path, dst_img)
                
                # Create full-image bounding box for class 2 (ligature_noose)
                lbl_path = train_lbl_dir / f"{img_path.stem}_{i}.txt"
                with open(lbl_path, "w") as f:
                    f.write("2 0.5 0.5 1.0 1.0\n")
            
            print(f"Added 50 copies of {img_path.name} to YOLO train set.")

if __name__ == "__main__":
    augment_training_data()
