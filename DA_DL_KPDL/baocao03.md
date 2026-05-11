# Báo Cáo Số 03: Nâng Cấp Toàn Diện Pipeline V5.2

Báo cáo này liệt kê các thay đổi kỹ thuật nhằm giải quyết triệt để các rủi ro về **Shortcut Learning**, **Source Imbalance** và **Kiến trúc Fusion** đã nêu trong bản Audit.

---

## 1. Nâng Cấp Optical Flow & Gated Fusion (2 Nhánh Riêng Biệt)

### Trạng thái: ✅ Đã xác nhận đúng trong code

Kiến trúc `GatedMotionAuxFusion` (file `src/models/gated_fusion.py`) đã tách thành **2 nhánh kết hợp riêng biệt**, mỗi nhánh có bộ Gate độc lập:

| Nhánh | Đầu vào | Số chiều | Gate |
|-------|---------|----------|------|
| **Motion Branch** | Optical Flow (mean, std, p90) | `[T, 3]` | `motion_gate` |
| **Semantic Branch** | YOLO score + NSFW score | `[T, 3]` | `aux_gate` |

Luồng fusion trong `TaskPromptedTemporalModel`:

```
CLIP [T, 768] → clip_proj → clip_h
                                ↓
Optical Flow [T, 3] → motion_proj → motion_h
                motion_gate = sigmoid(MLP([clip_h ; motion_h]))
                mid = clip_h + motion_gate * motion_h
                                ↓
YOLO+NSFW [T, 3] → aux_proj → semantic_h
                aux_gate = sigmoid(MLP([mid ; semantic_h]))
                fused = mid + aux_gate * semantic_h
                                ↓
                          LayerNorm(fused)
```

**Tại sao tách 2 nhánh?**
- Motion và Semantic là hai loại tín hiệu **khác bản chất**: chuyển động vs. nhận diện vật thể.
- Nếu gộp chung, tín hiệu YOLO mạnh có thể lấn át optical flow yếu → model bỏ qua motion cues.
- Gate riêng cho phép model **tự quyết định** khi nào ưu tiên chuyển động, khi nào ưu tiên vật thể cho từng frame.

---

## 2. Style Augmentation (Trị lỗi "Học Vẹt" Source)

### Trạng thái: ✅ Đã triển khai trong `build_clip_features.py`

### 2.1. Phương pháp

Áp dụng các biến đổi hình ảnh ngẫu nhiên tại Cell 14/15 **trước khi đưa vào CLIP encoder**:

| Phép biến đổi | Tác dụng | Tham số |
|---------------|----------|---------|
| `ColorJitter` | Phá vỡ đặc điểm ánh sáng/màu sắc riêng của từng nguồn | brightness, contrast, saturation = 0.3; hue = 0.03 |
| `RandomGrayscale` | Ép model học hình khối thay vì phụ thuộc màu sắc | p = 0.1 (10% ảnh bị chuyển xám) |
| `GaussianBlur` | Giảm phụ thuộc vào độ nét/nhiễu camera | kernel=3, sigma=(0.1, 1.2) |

### 2.2. Đảm bảo an toàn — KHÔNG gây Data Leak

```
Cell 5: Chia split cố định (train/val/test/challenge)
    ↓
Cell 14 (train): --augment        → CLIP features bị biến đổi ✅
Cell 14 (val):   KHÔNG --augment  → CLIP features gốc          ✅
Cell 14 (test):  KHÔNG --augment  → CLIP features gốc          ✅
```

### 2.3. BUG ĐÃ SỬA: Augmentation chỉ cho CLIP, KHÔNG cho Aux

**Vấn đề phát hiện:** Ban đầu augmentation được áp dụng cho TẤT CẢ frames, bao gồm cả frames dùng tính optical flow và YOLO/NSFW aux. Điều này SAI vì:
- Optical flow đo **chuyển động thực** → nếu bị ColorJitter thì magnitude sai
- YOLO object detection → nếu ảnh bị Grayscale hay Blur thì score bị nhiễu

**Đã sửa:** Trong `build_clip_features.py`, hệ thống giờ tách rõ:
- `original_frames` → dùng cho optical flow, YOLO, NSFW aux (luôn gốc)
- `clip_frames` → dùng cho CLIP encoding (có thể bị augmented)

### 2.4. Đánh giá phương pháp — Có đúng cho dự án không?

**CÓ**, và đây là lý do:

| Câu hỏi | Trả lời |
|---------|---------|
| Có phải phương pháp chuẩn? | ✅ Style augmentation trước feature extraction là standard practice trong transfer learning |
| Có giảm shortcut? | ✅ Phá vỡ source fingerprint (resolution, codec, color profile) |
| Có gây overfit? | ❌ Ngược lại, augmentation **giảm** overfit bằng cách tăng diversity |
| Có gây data leak? | ❌ Không, vì val/test luôn dùng frame gốc |

**Rủi ro cần lưu ý:**
- `augment_strength` quá cao (>0.5) → CLIP features bị nhiễu quá mức → model khó hội tụ
- Nên bắt đầu với strength=0.3, nếu val loss tăng thì giảm xuống 0.2

---

## 3. Cải Tiến WeightedRandomSampler

### Trạng thái: ✅ Đã sửa trong `src/training/engine.py`

### 3.1. Trước và sau

```python
# TRƯỚC (có rủi ro bỏ qua label info):
weights[idx] = max(source_weight, combo_weight)

# SAU (kết hợp cả hai tín hiệu):
weights[idx] = source_weight * combo_weight
```

### 3.2. Tại sao `product` tốt hơn `max`?

Ví dụ cụ thể:
- Source `nsfw_dataset_v1` có 5000 mẫu → `source_weight = 1/√5000 = 0.014`
- Combo `nsfw_dataset_v1::v0_s0_n1` có 3000 mẫu → `combo_weight = 1/√3000 = 0.018`
- Combo `nsfw_dataset_v1::v0_s0_n0` có 2000 mẫu → `combo_weight = 1/√2000 = 0.022`

Với `max()`:
- Cả hai combo đều nhận weight ≈ 0.022 → **không phân biệt** nhãn nsfw=1 vs nsfw=0

Với `product`:
- `v0_s0_n1`: 0.014 × 0.018 = 0.000252
- `v0_s0_n0`: 0.014 × 0.022 = 0.000308
- → Nhãn hiếm (n1) có **tỷ lệ tương đối** cao hơn so với nhãn phổ biến

### 3.3. Rủi ro

- Weight product rất nhỏ → cần normalization (đã có: `weights /= mean`)
- Nếu một combo cực hiếm (vd: 5 mẫu) → weight rất cao → risk of memorization
- **Đã có cap = 10.0** để ngăn chặn → OK

---

## 4. Xác Thực Proxy Gate Recall

### Trạng thái: ⏳ Cần chạy trên Kaggle

Chạy Cell 19 (`evaluate_proxy.py`) trên tập test để xác nhận:
- Recall > 98% trên mọi source video
- Nếu Recall < 95% → cần hạ threshold từ 0.2 xuống 0.15 hoặc 0.1

---

## 5. Kiểm tra Logging Real-Time

### Trạng thái: ✅ Tất cả trainer đã in log trực tiếp

| Training Stage | File | Log mỗi epoch? | Nội dung |
|----------------|------|:---:|----------|
| Proxy Gate (Cell 10) | `proxy_trainer.py` | ✅ | Loss, Recall, Precision, Confusion Matrix |
| NSFW Scorer (Cell 11) | `nsfw_trainer.py` | ✅ | Loss, F1, Recall, Precision, Confusion Matrix |
| SwAV Spatial (Cell 12) | `swav_trainer.py` | ✅ | Loss, KNN Accuracy |
| Temporal SSL (Cell 16) | `temporal_ssl_trainer.py` | ✅ | Loss, AOT Accuracy, Sort Accuracy |
| Multitask (Cell 17, 18) | `engine.py` | ✅ | Loss, F1-Macro, Per-task Confusion Matrix |
| Feature Extraction (Cell 14, 15) | `build_clip_features.py` | ✅ | tqdm progress bar + Augmentation status log |

Tất cả đều dùng `print()` trực tiếp → hiển thị ngay trên Kaggle notebook mà không cần đợi chạy xong.

---

## 6. Đánh Giá Phương Pháp Evaluation Hiện Tại

### 6.1. Các metric đang dùng

| Script | Metric | Thu được gì? |
|--------|--------|-------------|
| `evaluate_multitask.py` | ROC-AUC per-label | Khả năng phân biệt tổng thể (threshold-independent) |
| `evaluate_multitask.py` | Average Precision per-label | Khả năng ranking dương tính |
| `evaluate_multitask.py` | Threshold calibration (Youden, F1, F2, Fβ) | Ngưỡng tối ưu cho từng nhãn |
| `evaluate_multitask.py` | Confusion matrix per-label | TP, FP, FN, TN chi tiết |
| `evaluate_multitask.py` | ROC + PR curve plots | Trực quan hóa hiệu suất |
| `evaluate_challenge.py` | Per-bucket breakdown | So sánh `normal_hard` vs `positive_hard` |
| `engine.py` (training) | val_f1_macro | Monitor checkpoint |
| `engine.py` (training) | Per-task confusion matrix mỗi epoch | Theo dõi từng nhãn riêng |

### 6.2. Đánh giá: Có đúng với tiêu chí dự án không?

**Tiêu chí dự án:** Kiểm duyệt nội dung video (violence, self_harm, nsfw).

| Yêu cầu | Đáp ứng? | Chi tiết |
|----------|:---:|---------|
| Không bỏ sót nội dung nguy hiểm (Recall cao) | ✅ | Proxy gate tối ưu recall, threshold thấp (0.2) |
| Giảm cảnh báo nhầm (Precision cao ở stage cuối) | ✅ | Calibration mode f0.5 ưu tiên precision |
| Đánh giá từng nhãn riêng biệt | ✅ | Per-label confusion matrix, ROC-AUC, AP |
| Kiểm tra trên dữ liệu khó | ✅ | Challenge holdout với bucket `normal_hard` và `positive_hard` |
| Threshold tối ưu cho từng nhãn | ✅ | Tự động tính 4 loại threshold (Youden, F1, F2, Fβ) |
| Không dùng Accuracy làm metric chính | ✅ | Accuracy chỉ in tham khảo, không dùng để chọn model |

### 6.3. Điểm mạnh so với baseline thông thường

1. **Threshold riêng cho từng nhãn**: Thay vì dùng 0.5 chung, mỗi nhãn có threshold tối ưu riêng → recall tốt hơn cho nhãn hiếm
2. **F-beta calibration**: Proxy gate dùng F2 (ưu tiên recall), Final stage dùng F0.5 (ưu tiên precision) → đúng mục đích
3. **Challenge holdout**: Tập dữ liệu khó riêng biệt, không tham gia train/val/test → đo sức bền thực sự
4. **PR curve**: Quan trọng hơn ROC khi data imbalanced → dự án đã có

### 6.4. Điểm cần lưu ý

- **Chưa có per-source evaluation**: Nên thêm breakdown theo source trong `evaluate_multitask.py` để phát hiện shortcut
- **per_label F1 macro có thể che giấu vấn đề**: Nếu self_harm F1=0.1 nhưng violence F1=0.9 → F1_macro=0.5 trông "trung bình" nhưng self_harm thất bại
- **Nên xem kỹ confusion matrix per-label thay vì chỉ nhìn F1 macro**

---

## 7. Trạng Thái Các Trọng Số & Quy Trình Chạy Lại

| Stage | File Trọng Số | Có cần chạy lại? | Lý do |
|-------|--------------|:---:|-------|
| Proxy Gate (Cell 10) | `proxy_efficientnet_best.pth` | ❌ | Không bị ảnh hưởng bởi thay đổi |
| NSFW Scorer (Cell 11) | `nsfw_scorer_best.pth` | ❌ | Không bị ảnh hưởng |
| SwAV Spatial (Cell 12) | `ssl_spatial_best.pth` | ❌ | Không bị ảnh hưởng |
| YOLO (Cell 13) | `yolov8n_weapons/best.pt` | ❌ | Không bị ảnh hưởng |
| **Features Temporal (Cell 14)** | `.npy` files | **✅** | Optical flow mới + augmentation |
| **Features Multitask (Cell 15)** | `.npy` files | **✅** | Augmentation + aux features mới |
| **Temporal SSL (Cell 16)** | `temporal_ssl_best.pth` | **✅** | Input features thay đổi |
| **SSL Temporal (Cell 17)** | `ssl_temporal_best.pth` | **✅** | Input features thay đổi |
| **Multitask (Cell 18)** | `finetune_multitask_best.pth` | **✅** | Input features thay đổi + sampler mới |

**Thứ tự chạy lại:** Cell 14 → Cell 15 → Cell 16 → Cell 17 → Cell 18 → Cell 19/20/23.

---

## 8. Tổng Kết Rủi Ro

| # | Rủi ro | Mức độ | Biện pháp đã có |
|---|--------|--------|-----------------|
| 1 | Augmentation quá mạnh → features nhiễu | Thấp | Cap strength=0.3, có thể giảm |
| 2 | Product weight quá nhỏ cho combo hiếm | Thấp | Đã có normalize + cap 10.0 |
| 3 | self_harm chỉ 2 dataset, diversity thấp | Trung bình | Augmentation giúp phần nào, nhưng không thể thay thế dữ liệu thực |
| 4 | Proxy gate bỏ sót video mới (domain shift) | Trung bình | Cần validate recall trên test (Cell 19) |
| 5 | Val/Test cùng source distribution với Train | Trung bình | Cần thêm per-source evaluation sau train |

---
*Ngày cập nhật: 22/04/2026*
