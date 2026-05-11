# Hướng Dẫn Chạy Video Moderation V6.0 Trên Kaggle
# (Kiến Trúc 2 Tầng Test Set Độc Lập — KL Distillation & Validation Protocol)

**LƯU Ý QUAN TRỌNG:** Toàn bộ pipeline mất khoảng 6-9 giờ trên T4 x2. Để tránh Kaggle Session Timeout (9 tiếng), quy trình này được chia thành **2 SESSION RIÊNG BIỆT**.
**GHI CHÚ:** Tài liệu đã cập nhật cho V6.1 (aux 7-dim, SelfHarm gate, split hash theo full path).
**ĐIỀU KIỆN MÔI TRƯỜNG:** Notebook Kaggle nên bật **Internet = ON** cho lần chạy đầu tiên, vì Cell 0 và các cell train/extract cần tải:
- package từ `pip`
- `TransNetV2` từ GitHub
- `yolov8n.pt`
- `ResNet18 ImageNet weights`
- `openai/clip-vit-base-patch32`

Nếu bạn muốn chạy với Internet = OFF, bạn phải tự attach sẵn toàn bộ các pretrained weights/cache nói trên dưới dạng Kaggle Dataset.

================================================================================
# 🟢 SESSION 1: Feature Extraction & Teacher Training (Mất ~3-5 giờ)
================================================================================

Bạn hãy copy tuần tự các cell dưới đây và dán vào Kaggle Notebook (Accelerator: GPU T4 x2).

**Tóm tắt đánh giá/test theo cell:**
- Cell 2.5: YOLO test set (mAP50).
- Cell 4.5: Expert test (Gore/NSFW/SelfHarm) sau khi train xong cả 3 expert.
- Cell 8: E2E final test set (đánh giá mù, chỉ chạy 1 lần).

**Bản đồ dataset theo cell (tóm tắt):**
| Cell | Dataset chính | Xử lý / Mục tiêu |
|---|---|---|
| 0.8 | UCF-101 videos | Trích 2 frame/video -> `/kaggle/working/ucf101_frames` |
| 1 | HOD gun/knife + UCF-101 frames | Gộp class weapon, split train/val/test (negative theo video id) |
| 2/2.5 | YOLO dataset (weapon_v6.yaml) | Train + test mAP50 |
| 3 | Blood_Violence + HOD blood/gun/knife + Wound + UCF-101 frames | Train GoreDetector, pos_weight auto, log metrics CSV |
| 3.5 | Self Harm + Suicide Detection + HOD gun + Blood_Violence + Wound + UCF-101 frames | Train SelfHarmDetector, augment online |
| 4 | NSFW dataset (porn/hentai/sexy/neutral/drawings) | Split theo `get_split_from_id`, train NSFW |
| 4.5 | Blood_Violence test + SelfHarm val/test + UCF-101 val/test | Gate 1+2 cho 3 experts |
| 5 | RWF-2000 + UCF-Crimes + UCF-101 (videos) | Extract 775-dim features, quality_aug chỉ dùng cho train |
| 6 | features_manifest.csv | Stratified split 70/15/15, lock test |
| 7/7b | train/val manifests | E2E training |
| 7.5 | val manifest | Calibrate thresholds |
| 8 | test manifest | Final evaluation |

---

## Cell 0: Setup môi trường & Mã nguồn
Cài đặt các thư viện cần thiết và chuẩn bị mã nguồn V6.0.
*(Giả sử mã nguồn bạn đã upload thành Kaggle Dataset tên là `da-dl-kpdl-code`)*
```python
# Copy mã nguồn vào /kaggle/working để có quyền ghi (nếu upload dạng dataset)
!cp -r /kaggle/input/da-dl-kpdl-code/DA_DL_KPDL /kaggle/working/DA_DL_KPDL
%cd /kaggle/working/DA_DL_KPDL

import os
os.environ["HF_HOME"] = "/kaggle/working/.cache/huggingface"

!pip install -q -r requirements-kaggle.txt iterative-stratification albumentations
!pip install -q git+https://github.com/soCzech/TransNetV2.git
```

---

## Cell 0.5: Pre-Training Sanity Check
Kiểm tra cấu trúc model, VRAM và khả năng import các module V6.0.
```python
!python scripts/sanity_check_v6.py
```

---

## Cell 0.8: ⚡ Extract UCF-101 Frames (Bắt buộc trước Cell 1, 3, 3.5)
YOLO và GoreDetector cần `.jpg` frames từ UCF-101 làm negatives.
Nếu bỏ qua, model sẽ fallback về **ảnh đen** → GoreDetector học shortcut sửng tối.
```python
import cv2, os, random
from pathlib import Path

UCF_DIR = "/kaggle/input/datasets/pevogam/ucf101/UCF101/UCF-101"
OUT_DIR = "/kaggle/working/ucf101_frames"
os.makedirs(OUT_DIR, exist_ok=True)

random.seed(42)
all_avi = sorted(Path(UCF_DIR).rglob("*.avi"))
random.shuffle(all_avi)
sampled = all_avi[:3000]  # 3000 videos x 2 frames = ~6000 negatives

cnt = 0
for avi_path in sampled:
    cap = cv2.VideoCapture(str(avi_path))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    for frac in [0.25, 0.75]:  # 2 frames per video
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * frac))
        ret, frame = cap.read()
        if ret:
            out_name = f"{avi_path.stem}_{frac:.2f}.jpg"
            cv2.imwrite(f"{OUT_DIR}/{out_name}", frame)
            cnt += 1
    cap.release()

print(f"Extracted {cnt} frames to {OUT_DIR}")
```

---

## Cell 0.9: Tự dò HOD Paths (Khuyến nghị)
HOD trên Kaggle đang có thư mục timestamp như `gun-2026.../gun`, `knife-2026.../knife`, `blood-2026.../blood`.
Cell này giúp tránh hardcode sai path.
```python
from pathlib import Path

HOD_BASE = Path("/kaggle/input/datasets/caoqucph/data-dl/HOD/HOD")
HOD_BLOOD = next(HOD_BASE.glob("blood-*/blood"))
HOD_GUN   = next(HOD_BASE.glob("gun-*/gun"))
HOD_KNIFE = next(HOD_BASE.glob("knife-*/knife"))

print("HOD_BLOOD =", HOD_BLOOD)
print("HOD_GUN   =", HOD_GUN)
print("HOD_KNIFE =", HOD_KNIFE)
```

---

## Cell 1: Chuẩn bị dữ liệu YOLO Weapon
Gộp Gun + Knife thành class `0` (weapon).
```python
!python scripts/prepare_yolo_v6.py \
  --hod_root /kaggle/input/datasets/caoqucph/data-dl/HOD/HOD \
  --ucf101_root /kaggle/working/ucf101_frames \
  --output_dir /kaggle/working/yolo_weapon_v6 \
  --negative_per_class 2000
```

---

## Cell 2: Huấn luyện YOLOv8 Weapon Detector
Mô hình này cung cấp tín hiệu `yolo_feat`.
**GATE YOLO: Đảm bảo mAP50 ≥ 0.70 trước khi đi tiếp.**
*Nếu checkpoint YOLO hiện tại được train trước khi sửa split negative theo video-level, hãy train lại từ đầu để test metric không bị ảo.*
```python
!yolo detect train \
  model=yolov8n.pt \
  data=/kaggle/working/yolo_weapon_v6/weapon_v6.yaml \
  epochs=100 imgsz=640 batch=32 patience=30 \
  project=/kaggle/working/runs/weapon_v6 name=exp1 device=0

!mkdir -p /kaggle/working/trong_so
!cp /kaggle/working/runs/weapon_v6/exp1/weights/best.pt /kaggle/working/trong_so/yolov8_weapon_v6_best.pt
```

---

## Cell 2.5: ⚡ GATE YOLO — Evaluate trên Test Set
Đánh giá mù trên tập Test.
**GATE YOLO: Đảm bảo test_mAP50 ≥ 0.70 trước khi đi tiếp.**
Nếu FAIL, bạn phải bổ sung thêm dữ liệu và huấn luyện lại.
```python
!yolo detect val \
  model=/kaggle/working/trong_so/yolov8_weapon_v6_best.pt \
  data=/kaggle/working/yolo_weapon_v6/weapon_v6.yaml \
  split=test \
  project=/kaggle/working/runs/weapon_v6_test
```

---

## Cell 3: Huấn luyện GoreDetector (Expert 1) — V6.1
Huấn luyện trên Blood_Violence (filtered via categorize_image) + HOD blood/gun/knife + Wound dataset.
**Yêu cầu**: Cell 0.8 phải chạy xong (UCF-101 frames tại `/kaggle/working/ucf101_frames`).
`scan_blood_violence_dataset()` sẽ chạy tự động trước khi train — `pos_weight` tính tự động từ actual ratio.
*Trainer sẽ ghi thêm `metrics/*.csv` theo epoch để bạn vẽ train/val loss, AUC, F1, Recall, Precision và kiểm tra overfit/underfit.*
```python
!python scripts/train_gore_v6.py \
  --blood_violence_dir "/kaggle/input/datasets/caoqucph/data-dl/Blood_Violence.v1-blood-violence-dataset.yolov8" \
  --hod_blood_dir      "{HOD_BLOOD}" \
  --hod_gun_dir        "{HOD_GUN}" \
  --hod_knife_dir      "{HOD_KNIFE}" \
  --wound_dir          "/kaggle/input/datasets/caoqucph/data-dl/Wound_dataset copy" \
  --ucf101_dir         "/kaggle/working/ucf101_frames" \
  --output_dir         /kaggle/working/trong_so \
  --unfreeze_from_layer 4 \
  --batch_size 64 \
  --epochs 25 \
  --lr_backbone 1e-4 \
  --lr_head 1e-3 \
  --reweight_mode sampler \
  --device cuda
```

---

## Cell 3.5: Huấn luyện SelfHarmDetector (Expert S — V6.1 MÓI)
Teacher mới cho S_Gate. Thay thế GoreDetector (coverage ~50%) bằng SelfHarmDetector (coverage ~85%).
**Hard Negatives: HOD/gun (1,565) + Blood_Violence (800) — thiết kế đúng mục tiêu.**
*Lưu ý: SelfHarm train đã có augment online trong `selfharm_train_transform()`; Suicide Detection train không cần augment offline thêm trừ khi AUC/Recall vẫn thấp sau khi đánh giá lại.*
*SelfHarm Gate 1 đã thêm UCF-101 val/test hard negatives theo cùng hash split 70/15/15 như train; nếu Recall giảm sau rerun thì đó thường là metric cũ quá ảo, không phải model hỏng.*
```python
!python scripts/train_selfharm_v6.py \
  --selfharm_dir "/kaggle/input/datasets/caoqucph/data-dl/Self Harm Detection.v1i.yolov8" \
  --suicide_dir  "/kaggle/input/datasets/caoqucph/data-dl/Suicide Detection.v1i.yolov8(1)" \
  --hod_gun_dir  "{HOD_GUN}" \
  --blood_violence_dir "/kaggle/input/datasets/caoqucph/data-dl/Blood_Violence.v1-blood-violence-dataset.yolov8" \
  --wound_dir    "/kaggle/input/datasets/caoqucph/data-dl/Wound_dataset copy" \
  --ucf101_dir   "/kaggle/working/ucf101_frames" \
  --output_dir /kaggle/working/trong_so \
  --reweight_mode sampler \
  --batch_size 64 --epochs 20
```

---

## Cell 4: Huấn luyện NSFWClassifier (Expert N)
Huấn luyện trên image dataset NSFW.
*Nếu split NSFW trước đây dùng basename hash cũ, hãy train lại sau khi cập nhật `get_split_from_id` để tránh lệch split.*
```python
!python scripts/train_nsfw_v6.py \
  --nsfw_root "/kaggle/input/datasets/caoqucph/data-dl/nsfw_dataset_v1(1)/nsfw_dataset_v1" \
  --output_dir /kaggle/working/trong_so \
  --batch_size 128 --epochs 20
```

---

## Cell 4.5: ⚡ TẦNG 1 TEST SET — Validate Experts (Gate 1+2)
**DỮNG LẠI nêu FAIL.** Kiểm tra AUC/Recall cả 3 Experts trước khi trích xuất features.
- GoreDetector:       AUC ≥ 0.88, Recall ≥ 0.80
- SelfHarmDetector:   AUC ≥ 0.78, Recall ≥ 0.75 (n=87, CI ±0.08)
- NSFWClassifier:     AUC ≥ 0.91, drawings < 0.35
*BUG-H1 đã fix: Gore validation chỉ dùng `Blood_Violence/test`; **không dùng HOD blood** để tránh leakage.*
*SelfHarm Gate 1 hiện lấy negative pool từ Blood_Violence valid + UCF-101 val/test frames (hard negatives, cùng hash split 70/15/15 như train) để giảm chỉ số ảo.*
```python
!python scripts/validate_experts.py \
  --gore_weight /kaggle/working/trong_so/gore_detector_v6_best.pth \
  --selfharm_weight /kaggle/working/trong_so/selfharm_detector_v6_best.pth \
  --nsfw_weight /kaggle/working/trong_so/nsfw_classifier_v6_best.pth \
  --blood_violence_dir "/kaggle/input/datasets/caoqucph/data-dl/Blood_Violence.v1-blood-violence-dataset.yolov8" \
  --sh_val_dir "/kaggle/input/datasets/caoqucph/data-dl/Self Harm Detection.v1i.yolov8/valid/images" \
  --sh_test_dir "/kaggle/input/datasets/caoqucph/data-dl/Self Harm Detection.v1i.yolov8/test/images" \
  --ucf101_dir "/kaggle/working/ucf101_frames" \
  --nsfw_root "/kaggle/input/datasets/caoqucph/data-dl/nsfw_dataset_v1(1)/nsfw_dataset_v1"
```

## Cell 5: Trích xuất Features 775-dim V6.1 (Chỉ Video Dirs)
Sử dụng YOLO, Gore, **SelfHarm**, NSFW experts để tạo file `.npy` 775-dim.
*Nếu Cell 4.5 báo ECE > 0.10, cập nhật `--gore_T`, `--nsfw_T`, `--selfharm_T` tương ứng.*
*Nếu Cell 4.5 cho `best_T=1.00` cho cả 3 expert thì giữ `--gore_T 1.00 --nsfw_T 1.00 --selfharm_T 1.00` như mặc định bên dưới.*
*`label_violence` giờ được auto-infer theo taxonomy tường minh nếu chưa có seed manifest: `RWF/Fight=1`, `RWF/NonFight=0`, `UCF-Crimes` các class `Abuse, Arrest, Arson, Assault, Burglary, Explosion, Fighting, RoadAccidents, Robbery, Shooting = 1`, còn `UCF-101` và normal folders = 0.*
*Safe mode mặc định được khuyến nghị cho lần chạy đầu: **không bật `quality_aug`**. Cách này sạch hơn về ML nếu bạn chưa seed trước split metadata.*
*`--quality_aug` chỉ nên bật khi `features_manifest.csv` seed sẵn có cột `split=train/val/test`; khi đó script chỉ augment các hàng `split=train`. Nếu **không có split metadata**, script sẽ **tự tắt quality augmentation** để tránh làm bẩn val/test trước Cell 6.*
```python
# CÀI ĐẶT FFMPEG NẾU CHƯA CÓ TRƯỚC KHI CHẠY (BẮT BUỘC)
!apt-get update && apt-get install -y ffmpeg
!pip install ffmpeg-python
```

```python
# PRECHECK KHÔNG DÙNG HEREDOC (tránh lỗi /bin/bash wanted `PY`)
from pathlib import Path
import glob
import shutil

def first_existing(cands):
    for p in cands:
        if p and Path(p).exists():
            return str(p)
    return ""

YOLO_WEIGHT = first_existing([
    "/kaggle/working/trong_so/yolov8_weapon_v6_best.pt",
    *sorted(glob.glob("/kaggle/working/runs/weapon_v6/*/weights/best.pt"), reverse=True),
])
GORE_WEIGHT = "/kaggle/working/trong_so/gore_detector_v6_best.pth"
SELFHARM_WEIGHT = "/kaggle/working/trong_so/selfharm_detector_v6_best.pth"
NSFW_WEIGHT = "/kaggle/working/trong_so/nsfw_classifier_v6_best.pth"

required_paths = [
    "/kaggle/working/DA_DL_KPDL/scripts/build_features_v6.py",
    YOLO_WEIGHT,
    GORE_WEIGHT,
    SELFHARM_WEIGHT,
    NSFW_WEIGHT,
    "/kaggle/input/datasets/vulamnguyen/rwf2000/RWF-2000",
    "/kaggle/input/datasets/bypktt/ucf-crimes",
    "/kaggle/input/datasets/pevogam/ucf101/UCF101/UCF-101",
]

missing = [p for p in required_paths if (not p) or (not Path(p).exists())]
if missing:
    raise FileNotFoundError("Missing required path(s):\n- " + "\n- ".join(missing))

if shutil.which("ffmpeg") is None:
    raise RuntimeError("ffmpeg chưa có trong PATH")

print("YOLO_WEIGHT =", YOLO_WEIGHT)
print("GORE_WEIGHT =", GORE_WEIGHT)
print("SELFHARM_WEIGHT =", SELFHARM_WEIGHT)
print("NSFW_WEIGHT =", NSFW_WEIGHT)
print("PRECHECK PASS")
```

```python

# SAFE DEFAULT: extract features khong quality augmentation
!python scripts/build_features_v6.py \
  --video_dirs \
    /kaggle/input/datasets/vulamnguyen/rwf2000/RWF-2000 \
    /kaggle/input/datasets/bypktt/ucf-crimes \
    /kaggle/input/datasets/pevogam/ucf101/UCF101/UCF-101 \
  --output_dir /kaggle/working/features_v6 \
  --yolo_weight     "{YOLO_WEIGHT}" \
  --gore_weight     "{GORE_WEIGHT}" \
  --nsfw_weight     "{NSFW_WEIGHT}" \
  --selfharm_weight "{SELFHARM_WEIGHT}" \
  --gore_T     1.00 \
  --nsfw_T     1.00 \
  --selfharm_T 1.00 \
  --ucf101_sample_n 1200 \
  --batch_size 32 --device cuda \
  --skip_existing
```

*Chỉ khi bạn đã seed sẵn `/kaggle/working/features_v6/features_manifest.csv` với cột `video_path,label_violence,split`, mới thêm lại `--quality_aug --aug_prob 0.4` vào lệnh trên.*

---

## Cell 5.5: ⚡ GATE 3 — Validate .npy Files
Kiểm tra ngẫu nhiên feature để đảm bảo quá trình trích xuất không lỗi.
*Lưu ý: Gate 3 hiện chỉ `FAIL` khi có **hard issues** (shape/NaN/Inf/out-of-range/global stuck).*
*Các cảnh báo "expert flat theo thời gian" trên video de/non-gore được xem là **soft warning** và không chặn pipeline.*
```python
!python scripts/validate_features.py --features_dir /kaggle/working/features_v6 --n_sample 100
```

---

## Cell 5.6: LƯU TRỮ DỮ LIỆU SESSION 1 (Chống Timeout)
Lưu toàn bộ weights và features để download xuống và tải lên lại thành 1 Kaggle Dataset riêng, chuẩn bị cho Session 2.
```python
# Nén dữ liệu để tiện tải về
!tar -czf /kaggle/working/session1_weights.tar.gz /kaggle/working/trong_so
!tar -czf /kaggle/working/session1_features.tar.gz /kaggle/working/features_v6

!echo "✅ ĐÃ LƯU XONG. Vui lòng tải 2 file .tar.gz về máy, tạo Kaggle Dataset mới (VD: v6-features-weights) rồi mới sang Session 2."
```

================================================================================
# 🔵 SESSION 2: Resume Extraction & Model E2E Training (Sáng mai)
================================================================================

*Lưu ý quan trọng cho Sáng Mai:*
*1. Bạn phải Add Data (Kaggle Dataset) chứa `trong_so` và `features_v6` đã lưu từ đêm qua vào Notebook.*
*2. Setup lại môi trường bằng cách chạy lại **Cell 0**; nếu cần validate/debug các expert, chạy lại thêm **Cell 0.9** để re-define `HOD_BLOOD`, `HOD_GUN`, `HOD_KNIFE`.*
*3. Copy dữ liệu từ thư mục Input qua Working để Resume:*
```python
!cp -r /kaggle/input/ten_dataset_cua_ban/trong_so /kaggle/working/
!cp -r /kaggle/input/ten_dataset_cua_ban/features_v6 /kaggle/working/
```
*4. Nếu Session 2 cần resume Cell 5, nhớ cài lại `ffmpeg` như phần đầu Cell 5 nếu runtime mới chưa có sẵn.*
*5. Chạy lại y hệt **Cell 5** ở trên. Tham số `--skip_existing` sẽ lập tức bỏ qua các file `.npy` đã tạo hôm qua và chạy tiếp số video còn lại cực nhanh.*
*6. Khi Cell 5 báo xong 100%, mới đi tiếp xuống Cell 6.*

---

## Cell 6: Chuẩn bị Manifest & Stratified Split
Chia dữ liệu 70/15/15. **LOCK Test Set ngay tại đây.**
```python
!python scripts/prepare_data_v6.py \
  --features_dir /kaggle/working/features_v6 \
  --output_dir /kaggle/working/manifests_v6 \
  --val_ratio 0.15 --test_ratio 0.15 --seed 42
```

---

## Cell 6.5: Sanity Check Feature Dimension (774/775)
Kiểm tra nhanh dimension trước khi train để tránh lệch kênh.
```python
import numpy as np
import pandas as pd
from pathlib import Path

FEATURES_DIR = Path("/kaggle/working/features_v6")
MANIFEST = Path("/kaggle/working/manifests_v6/train_manifest.csv")

df = pd.read_csv(MANIFEST)
row = df.sample(1, random_state=42).iloc[0]

def load_arr(p):
  p = Path(p)
  if not p.is_absolute():
    p = FEATURES_DIR / p
  arr = np.load(p)
  if arr.ndim == 1:
    arr = arr[None, :]
  return arr

x = load_arr(row["feature_path"])
aux_path = row.get("aux_feature_path", "")
has_aux = "aux_feature_path" in df.columns and isinstance(aux_path, str) and aux_path.strip() != ""

if has_aux:
  aux = load_arr(aux_path)
  aux_dim = aux.shape[1]
  print("aux_dim =", aux_dim)
  if aux_dim not in (6, 7):
    raise ValueError(f"Unexpected aux_dim={aux_dim} (expect 6 or 7)")
else:
  total_dim = x.shape[1]
  print("total_dim =", total_dim)
  if total_dim not in (774, 775):
    raise ValueError(f"Unexpected total_dim={total_dim} (expect 774 or 775)")

print("DIMENSION CHECK PASS")
```

---

## Cell 7: [ABLATION] Tìm Temperature T Tốt Nhất
Chạy thử nghiệm 20 epochs cho T ∈ {1.0, 2.0, 4.0}.
*Lưu ý: Mọi tiến trình đều hiển thị log trực tiếp giúp bạn theo dõi early stopping.*
```python
# Chạy ablation 1 lần (script tự chạy đủ T=1.0/2.0/4.0)
!python scripts/train_e2e_v6.py \
  --train_manifest /kaggle/working/manifests_v6/train_manifest.csv \
  --val_manifest /kaggle/working/manifests_v6/val_manifest.csv \
  --features_dir /kaggle/working/features_v6 \
  --output_dir /kaggle/working/ablation_T \
  --epochs 20 --ablation
```
*Nếu log xuất hiện `TrainLoss: nan` hoặc `ValLoss: nan` thì xem là `NO-GO`, dừng và đồng bộ lại file `scripts/train_e2e_v6.py` trước khi chạy lại Cell 7.*

---

## Cell 7b: [FULL] Huấn Luyện Full E2E Model V6
Sử dụng T tốt nhất từ Cell 7 (mặc định khuyến nghị 2.0). 
**GATE 4: Monitor training health mỗi epoch trong logs.**
```python
!python scripts/train_e2e_v6.py \
  --train_manifest /kaggle/working/manifests_v6/train_manifest.csv \
  --val_manifest /kaggle/working/manifests_v6/val_manifest.csv \
  --features_dir /kaggle/working/features_v6 \
  --output_dir /kaggle/working/trong_so \
  --temperature 2.0 \
  --epochs 50 --lambda_dist 0.5 --lambda_ent 0.1 --warmup_epochs 5 --patience 10
```

---

## Cell 7.5: ⚡ Calibrate Threshold (VAL SET)
Tìm ngưỡng dự đoán tối ưu trên tập Validation.
```python
!python scripts/calibrate_v6.py \
  --val_manifest /kaggle/working/manifests_v6/val_manifest.csv \
  --features_dir /kaggle/working/features_v6 \
  --model_weight /kaggle/working/trong_so/task_gated_v6_best.pth
```

---

## Cell 8: ⚡ TẦNG 2 TEST SET — Final Evaluation
**CHỈ CHẠY 1 LẦN DUY NHẤT.** Đây là đánh giá cuối cùng trên video-level test set độc lập.
```python
# Thay --thresh_v/s/n bằng kết quả từ Cell 7.5
!python scripts/evaluate_v6.py \
  --test_manifest /kaggle/working/manifests_v6/test_manifest.csv \
  --features_dir /kaggle/working/features_v6 \
  --model_weight /kaggle/working/trong_so/task_gated_v6_best.pth \
  --thresh_v 0.95 --thresh_s 0.3 --thresh_n 0.5
```

---

**Nguyên tắc Vàng V6.0:**
1. **Tầng 1 (Expert Test)**: Đảm bảo Teacher giỏi trước khi Distill.
2. **Tầng 2 (E2E Test)**: Đánh giá mù sau khi đã chốt model/ngưỡng.
3. **Task Isolation**: N_Gate không bao giờ nhìn thấy YOLO/Flow.
4. **Data Leakage**: MD5 Hash verify tính nhất quán của split.

---

## Cell 8.5: Tải Về Chỉ Trọng Số (Không kèm features/code)
Đóng gói đúng 5 trọng số cần cho infer/demo local: YOLO + 3 experts + TaskGated.
```python
from pathlib import Path
import zipfile
import hashlib
from IPython.display import FileLink, display

weights_dir = Path("/kaggle/working/trong_so")
out_zip = Path("/kaggle/working/v6_weights_only.zip")

needed = [
    "yolov8_weapon_v6_best.pt",
    "gore_detector_v6_best.pth",
    "selfharm_detector_v6_best.pth",
    "nsfw_classifier_v6_best.pth",
    "task_gated_v6_best.pth",
]

missing = [n for n in needed if not (weights_dir / n).exists()]
if missing:
    raise FileNotFoundError("Thiếu trọng số:\n- " + "\n- ".join(missing))

if out_zip.exists():
    out_zip.unlink()

with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for name in needed:
        fp = weights_dir / name
        zf.write(fp, arcname=f"trong_so/{name}")

sha256 = hashlib.sha256(out_zip.read_bytes()).hexdigest()
print(f"Created: {out_zip}")
print(f"Size MB: {out_zip.stat().st_size / (1024 * 1024):.2f}")
print(f"SHA256 : {sha256}")

display(FileLink(str(out_zip)))
```

*Nếu không bấm được link, mở panel bên phải `Output/Working`, tìm `v6_weights_only.zip` rồi Download trực tiếp.*
