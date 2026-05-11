# DANH SÁCH LỖI CẦN SỬA — V6.1 (Chạy lại từ đầu)

## 🔴 CRITICAL — Sửa trước Cell 1-4 (train expert models)

### BUG-C1: model.eval() bị thiếu trong build_features_v6.py
File:    scripts/build_features_v6.py
Vấn đề: Gore, SelfHarm, NSFW không có .eval() → BatchNorm dùng batch stats
         → std = 0.000 toàn bộ expert dims → feature flat vô dụng
Fix:     Sau mỗi model.load_state_dict():
           gore_model.eval()
           selfharm_model.eval()
           nsfw_model.eval()
         Wrap inference trong: with torch.no_grad():
Trang thai: DA SUA (build_features_v6.py da co eval() va extract_all_features co @torch.no_grad)

### BUG-C2: aux = zeros do ManifestFeatureDataset không split 775-dim
File:    src/data/manifest_dataset.py  (L85-93)
         scripts/train_e2e_v6.py       (L216-229, L254-259)
Vấn đề: x = feat[0:775] (toàn bộ), aux = zeros → KL distillation vô nghĩa
         HOẶC shape mismatch clip_dim=768 vs 775 → crash
Fix:     Trong __getitem__:
           x   = feat[0:768]    # CLIP only
           aux = feat[768:775]  # [flow(3), yolo(1), gore(1), selfharm(1), nsfw(1)]
         Cập nhật default_aux_dim = 7 (không phải 6)
Trang thai: DA SUA (ManifestFeatureDataset tu dong tach 775-dim, train_e2e_v6 default_aux_dim=7)

### BUG-C3: Label violence suy từ filename hash → toàn bộ label = 0
File:    scripts/build_features_v6.py  (L405-415)
         scripts/prepare_data_v6.py    (L60-75)
Vấn đề: build_features ghi filename bị hash, mất thông tin nguồn dataset
         prepare_data suy label từ filename → không match → label = 0
Fix:     Giữ cấu trúc thư mục trong output_dir:
           features_v6/RWF-2000/fight/video001.npy   → label = 1
           features_v6/RWF-2000/normal/video002.npy  → label = 0
         HOẶC ghi metadata CSV kèm theo mỗi .npy:
           video_id, dataset, label, split, npy_path
Trang thai: DA SUA (build_features_v6.py ghi features_manifest.csv, prepare_data_v6.py doc manifest)

---

## 🟠 HIGH — Sửa trước Cell 4.5 (validate experts)

### BUG-H1: Gate 1 Gore bị leak — dùng HOD/blood (train data) để validate
File:    scripts/validate_experts.py (L103-117)
Vấn đề: HOD/blood được dùng trong train_gore_v6.py (L279-285)
         Validate lại trên chính data đó → AUC ảo (~1.000 không có nghĩa)
Fix:     validate_experts.py chỉ dùng Blood_Violence.v1 test split
         Loại hoàn toàn HOD/blood, HOD/gun, HOD/knife khỏi validation set
Trang thai: DA SUA (validate_experts.py chi dung Blood_Violence test split)

### BUG-H2: Gate 1 NSFW leak — validate trên full dataset không tách split
File:    scripts/validate_experts.py (L228-245)
         scripts/train_nsfw_v6.py    (L42-46)
Vấn đề: Train dùng hash split (80/10/10), validate dùng toàn bộ folders
         → train samples lẫn vào validation → AUC ảo
Fix:     validate_experts.py áp dụng get_split() giống train_nsfw_v6.py
         Chỉ lấy samples có hash → "test" split
Trang thai: DA SUA (validate_experts.py dung get_split_from_id va split test; train_nsfw_v6.py cap nhat split theo full path)

### BUG-H3: SelfHarm UCF frames overlap train/val/test
File:    scripts/train_selfharm_v6.py (L104, L108-109)
Vấn đề: Negative UCF frames sample ngẫu nhiên không loại trùng
         → cùng frame xuất hiện trong cả train lẫn val/test
         → Val Recall = 1.000 có thể ảo
Fix:     Hash split theo full path (không phải basename):
           split = get_split(full_path, train=0.7, val=0.15, test=0.15)
         Đảm bảo without-replacement giữa 3 tập
Trang thai: DA SUA (train_selfharm_v6.py chia UCF frames theo split hash, khong overlap)

### BUG-H4: aux slicing dùng layout V6.0 (6-dim) thay vì V6.1 (7-dim)
File:    scripts/calibrate_v6.py (L56)
         scripts/evaluate_v6.py  (L62)
Vấn đề: V6.0: [flow(3), yolo(1), gore(1), nsfw(1)] = 6-dim
         V6.1: [flow(3), yolo(1), gore(1), selfharm(1), nsfw(1)] = 7-dim
         → selfharm_feat bị đọc nhầm thành nsfw_feat
Fix:     Cập nhật slicing:
           flow      = aux[0:3]
           yolo      = aux[3:4]
           gore      = aux[4:5]
           selfharm  = aux[5:6]   ← thêm mới
           nsfw      = aux[6:7]   ← dịch +1
Trang thai: DA SUA (calibrate_v6.py va evaluate_v6.py da cap nhat slicing V6.1)

### BUG-H5: calibrate_v6 / evaluate_v6 crash do import sai class
File:    scripts/calibrate_v6.py (L24-45)
         scripts/evaluate_v6.py  (L27-51)
Vấn đề: Import ManifestDataset không tồn tại (phải là ManifestFeatureDataset)
         load_state_dict(checkpoint) thay vì load_state_dict(checkpoint["model_state_dict"])
Fix:     from src.data.manifest_dataset import ManifestFeatureDataset
         model.load_state_dict(ckpt["model_state_dict"])
Trang thai: DA SUA (calibrate_v6.py/evaluate_v6.py dung ManifestFeatureDataset va load model_state_dict)

---

## 🟡 MEDIUM — Sửa trước Cell 5 (build features)

### BUG-M1: Quality augmentation gán nhãn sai cho UCF-Crimes videos
File:    scripts/build_features_v6.py (L412-415)
Vấn đề: Label aug suy từ keyword (fight/violence/crimes) trong filename
         UCF-Crimes videos có thể bị aug sai chiều
         → Violence video bị soften, Normal video bị sharpen → tái tạo shortcut
Fix:     Truyền label từ manifest/dataset metadata thay vì keyword
         Hoặc truyền flag --label-by-dir để dùng tên thư mục
Trang thai: DA SUA MOT PHAN (build_features_v6.py da mo rong infer_violence_label theo thu muc/tu khoa; neu can chinh xac tuyet doi, nen truyen manifest/metadata)

### BUG-M2: YOLO negatives split theo frame không theo video
File:    scripts/prepare_yolo_v6.py (L81-89)
Vấn đề: Frames từ cùng 1 video có thể nằm ở cả train và val/test
         → mAP test bị inflate vì model "đã thấy" video đó
Fix:     Group frames theo video_id trước khi split
         Split theo video-level (80/10/10), sau đó lấy tất cả frames
Trang thai: DA SUA (prepare_yolo_v6.py da split negatives theo video_id)

### BUG-M3: RWF-2000 quality shortcut chưa được probe
Vấn đề: Fight=CCTV mờ, Normal=HD sắc nét → CLIP phân biệt bằng quality
         VideoQualityAugmentor aug_prob=0.4 có thể chưa đủ
Fix:     Sau Cell 8 chạy probe_quality_shortcut() để đo delta score
         Nếu delta > 0.15: tăng aug_prob lên 0.6-0.7, train lại E2E

---

## 📋 THỨ TỰ SỬA VÀ CHẠY LẠI

Bước 1 — Sửa code (30-60 phút):
  BUG-H1, H2, H3  → train_gore, train_nsfw, train_selfharm, validate_experts
  BUG-H4, H5      → calibrate_v6, evaluate_v6
  BUG-M2          → prepare_yolo_v6
  BUG-C2, C3      → manifest_dataset, build_features, prepare_data
  BUG-M1          → build_features (aug label logic)

Bước 2 — Cell 1: Train YOLO (100 epochs, ~60 phút)
Bước 3 — Cell 2: Validate YOLO, gate mAP50 >= 0.70
Bước 4 — Cell 3: Train Gore (25 epochs, ~27 phút)
Bước 5 — Cell 3.5: Train SelfHarm (20 epochs, ~8 phút)
Bước 6 — Cell 4: Train NSFW (20 epochs, ~74 phút)
Bước 7 — Cell 4.5: Validate experts (không leak)
Bước 8 — Cell 5: Build features 775-dim (với .eval() fix, ~5.7 giờ)
  BUG-C1 fix: .eval() + torch.no_grad()
  BUG-C3 fix: giữ cấu trúc thư mục trong output
Bước 9 — Cell 6-8: Train E2E + Evaluate

---

## ⏱ ƯỚC TÍNH THỜI GIAN TỔNG

Cell 1-4.5:  ~3 giờ
Cell 5:      ~5.7 giờ
Cell 6-8:    ~3 giờ
──────────────────
Tổng:        ~12 giờ (2 Kaggle sessions)
