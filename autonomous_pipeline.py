import os
import urllib.request
import zipfile
import shutil
import pandas as pd
from ultralytics import YOLO

# ==========================================
# GIAI ĐOẠN 1: TỰ ĐỘNG THU THẬP DỮ LIỆU
# ==========================================
print("\n[PHASE 1] TỰ ĐỘNG THU THẬP VÀ XỬ LÝ DỮ LIỆU...")
DATASET_URL = "https://ultralytics.com/assets/coco8.zip"
ZIP_PATH = "downloaded_data.zip"
EXTRACT_DIR = "auto_collected_data"

if not os.path.exists(EXTRACT_DIR):
    print("  -> Đang tải dữ liệu thực tế từ Internet...")
    urllib.request.urlretrieve(DATASET_URL, ZIP_PATH)
    
    print("  -> Đang giải nén dữ liệu...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(EXTRACT_DIR)
    
    os.remove(ZIP_PATH)
    print("  -> Tải và giải nén thành công.")
else:
    print("  -> Dữ liệu đã được thu thập từ trước.")

# Chuẩn bị file YAML
yaml_content = f"""
path: {os.path.abspath(EXTRACT_DIR)}/coco8
train: images/train
val: images/val
nc: 1
names:
  0: target_object
"""
yaml_path = "auto_target.yaml"
with open(yaml_path, 'w') as f:
    f.write(yaml_content)

# Remap tất cả các nhãn trong dataset mẫu thành class 0 để giả lập target
for split in ['train', 'val']:
    label_dir = os.path.join(EXTRACT_DIR, 'coco8', 'labels', split)
    if os.path.exists(label_dir):
        for filename in os.listdir(label_dir):
            if filename.endswith(".txt"):
                filepath = os.path.join(label_dir, filename)
                with open(filepath, 'r') as f:
                    lines = f.readlines()
                with open(filepath, 'w') as f:
                    for line in lines:
                        parts = line.strip().split()
                        if parts:
                            parts[0] = '0' # Ép về class 0
                            f.write(" ".join(parts) + "\n")

print("[PHASE 1] HOÀN TẤT: Dữ liệu đã sẵn sàng để train.\n")

# ==========================================
# GIAI ĐOẠN 2 & 3: TỰ ĐỘNG TRAIN, TEST & DIAGNOSE
# ==========================================
print("[PHASE 2 & 3] KHỞI ĐỘNG HỆ THỐNG SMART AUTO-FINETUNE TRÊN DỮ LIỆU MỚI...")

TARGET_MAP = 0.90
MAX_TRIALS = 5

def diagnose_training(results_csv):
    if not os.path.exists(results_csv):
        return "ERROR", 0.0

    df = pd.read_csv(results_csv)
    df.columns = df.columns.str.strip()
    
    try:
        train_loss = df['train/box_loss'] + df['train/cls_loss'] + df['train/dfl_loss']
        val_loss = df['val/box_loss'] + df['val/cls_loss'] + df['val/dfl_loss']
        map50_95 = df['metrics/mAP50-95(B)'].iloc[-1]
        map50 = df['metrics/mAP50(B)'].iloc[-1]
    except KeyError:
        return "ERROR", 0.0

    print(f"  -> Đánh giá mô hình: mAP50 = {map50:.4f}, mAP50-95 = {map50_95:.4f}")
    
    loss_decrease = train_loss.iloc[0] - train_loss.iloc[-1]
    if map50_95 < 0.40 and loss_decrease < 0.5:
        print("  -> CHẨN ĐOÁN: UNDERFITTING (Mô hình chưa học được)")
        return "UNDERFIT", map50_95

    if len(val_loss) > 3:
        if (val_loss.iloc[-1] > val_loss.iloc[-3]) and (train_loss.iloc[-1] < train_loss.iloc[-3]):
            print("  -> CHẨN ĐOÁN: OVERFITTING (Cần regularization)")
            return "OVERFIT", map50_95
            
    if map50_95 >= TARGET_MAP:
        print("  -> CHẨN ĐOÁN: SUCCESS (Đã đạt chuẩn, sẵn sàng deploy)")
        return "SUCCESS", map50_95
        
    print("  -> CHẨN ĐOÁN: CẦN TRAINING THÊM (Chưa đạt Target mAP)")
    return "GOOD_BUT_LOW_MAP", map50_95

params = {
    "epochs": 10,
    "lr0": 0.01,
    "dropout": 0.0,
    "augment": False,
    "weight_decay": 0.0005
}

best_map = 0
best_model_path = ""

for trial in range(1, MAX_TRIALS + 1):
    print(f"\n[{trial}/{MAX_TRIALS}] ĐANG HUẤN LUYỆN VỚI THÔNG SỐ: {params}")
    
    model = YOLO('yolov8n.pt')
    run_name = f'auto_pipeline_trial_{trial}'
    
    results = model.train(
        data=yaml_path,
        epochs=params["epochs"],
        imgsz=320,
        lr0=params["lr0"],
        dropout=params["dropout"],
        weight_decay=params["weight_decay"],
        augment=params["augment"],
        project='full_auto_runs',
        name=run_name,
        device='cpu',
        verbose=False,
        plots=False
    )
    
    run_dir = results.save_dir
    csv_path = os.path.join(run_dir, "results.csv")
    status, current_map = diagnose_training(csv_path)
    
    if current_map > best_map:
        best_map = current_map
        best_model_path = os.path.join(run_dir, "weights", "best.pt")
        
    if status == "SUCCESS":
        print("\n🏆 QUÁ TRÌNH TỰ ĐỘNG THU THẬP, HUẤN LUYỆN VÀ TINH CHỈNH ĐÃ THÀNH CÔNG!")
        break
    elif status == "OVERFIT":
        params["dropout"] = 0.3
        params["augment"] = True
        params["weight_decay"] = 0.001
        params["epochs"] += 5
    elif status == "UNDERFIT":
        params["epochs"] += 10
        params["lr0"] = min(params["lr0"] * 1.5, 0.1)
    elif status == "GOOD_BUT_LOW_MAP":
        params["epochs"] += 10

print(f"\n[KẾT QUẢ CUỐI CÙNG] Model xịn nhất: {best_model_path} (mAP: {best_map:.4f})")
