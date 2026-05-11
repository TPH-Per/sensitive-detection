# Prompt kiểm tra sẵn sàng chạy pipeline — Video Moderation V5.2

**Mục đích:** Trước khi bắt đầu session Kaggle mới để chạy Cell 14 → 15b (Feature Extraction),
hãy đọc qua checklist này và xác nhận từng điểm.

---

## ✅ Đã hoàn thành (không cần kiểm tra lại)

| Hạng mục | File | Trạng thái |
|----------|------|-----------|
| Style augmentation (CLIP only, aux dùng frame gốc) | `scripts/build_clip_features.py` dòng 275-298 | ✅ Đã sửa |
| WeightedRandomSampler dùng `product` thay vì `max()` | `src/training/engine.py` dòng 100 | ✅ Đã sửa |
| SwAV early stopping patience = 5 (thay vì 3) | `configs/ssl_spatial.yaml` dòng 32 | ✅ Đã sửa |
| TemporalSSLHead nhận arch params từ config | `src/training/temporal_ssl_trainer.py` dòng 18-49 | ✅ Đã sửa |
| temporal_ssl_trainer honor `checkpoint.monitor` từ config | `src/training/temporal_ssl_trainer.py` dòng 138-144, 261-280 | ✅ Đã sửa |
| Cell 14/15 có `--augment --augment_strength 0.3` cho train split | `capnhat01.md` Cell 14, 15 | ✅ Đã thêm |
| Cell 14c/15c/15d helper zip và download | `capnhat01.md` Cell 14c, 15c, 15d | ✅ Đã thêm |
| Cell 15e khôi phục features từ /kaggle/input | `capnhat01.md` Cell 15e | ✅ Đã thêm |

---

## 🔍 Checklist cần kiểm tra trước khi chạy Kaggle

### 1. Config `ssl_temporal.yaml` — Chỉnh monitor metric

**Vấn đề:** `configs/ssl_temporal.yaml` đang có `monitor: val_f1_macro` nhưng
`temporal_ssl_trainer.py` không output F1 — chỉ output `val_loss`, `val_aot_acc`, `val_sort_acc`.

**Hành động cần làm:**
Mở `configs/ssl_temporal.yaml` và đổi:
```yaml
# TRƯỚC (sai — stage này không có val_f1_macro):
checkpoint:
  monitor: val_f1_macro
  mode: max

# SAU (đúng — dùng val_loss để chọn best checkpoint):
checkpoint:
  monitor: val_loss
  mode: min
```

---

### 2. Kiểm tra `scripts/build_clip_features.py` có nhận `--augment` flag

Chạy lệnh này để xác nhận:
```bash
python scripts/build_clip_features.py --help | grep augment
```
Kỳ vọng thấy: `--augment`, `--augment_strength`

---

### 3. Kiểm tra YOLO & NSFW checkpoint đã có

Trước khi chạy Cell 14, đảm bảo 2 file này đã tồn tại:
```
/kaggle/working/artifacts/yolo_runs/yolov8n_weapons/weights/best.pt    ← Cell 13 output
/kaggle/working/artifacts/checkpoints/nsfw_scorer_best.pth             ← Cell 11 output
/kaggle/working/artifacts/checkpoints/ssl_spatial_best.pth             ← Cell 12 output (SwAV)
```

---

### 4. Kiểm tra labels CSV đầu vào của Cell 14/15

```bash
ls /kaggle/working/artifacts/data_prep/labels/
```
Kỳ vọng thấy:
- `labels_temporal_train.csv`, `labels_temporal_val.csv`, `labels_temporal_test.csv`
- `labels_multitask_train.csv`, `labels_multitask_val.csv`, `labels_multitask_test.csv`
- `labels_multitask_challenge.csv` (nếu có challenge holdout)

---

### 5. Kiểm tra dung lượng disk Kaggle

Feature extraction sẽ tạo ra nhiều file `.npy`. Ước tính:
- Temporal (3 splits): ~3-8 GB tùy số samples
- Multitask (3 splits): ~2-6 GB
- Challenge: ~0.5-1 GB

Kiểm tra còn đủ chỗ:
```bash
df -h /kaggle/working
```

---

### 6. Kiểm tra session còn đủ thời gian

Cell 14+15+15b ước tính mất **4-8 giờ** (tùy dataset size).
Kaggle cho phép tối đa 12h/session với GPU T4 x2.

Nên chạy Cell 14 (temporal) trước, zip luôn (Cell 14c) nếu gần hết thời gian,
rồi mở session mới để chạy Cell 15+15b.

---

## 📋 Thứ tự chạy đề xuất

### SESSION 1 — Spatial SSL (đã xong)
```
Cell 1-4   → Setup
Cell 5-9   → Data prep
Cell 10    → Train Proxy EfficientNet
Cell 11    → Train NSFW Scorer
Cell 12    → Train SwAV Spatial SSL   ← SwAV best KNN = 0.7022 ✅
Cell 13    → Train YOLO
```

### SESSION 2 — Feature Extraction (cần chạy tiếp)
```
Cell 14    → Build temporal features (train: +augment, val/test: no augment)
Cell 14c   → Zip & download temporal features
Cell 15    → Build multitask features (train: +augment, val/test: no augment)
Cell 15c   → Zip & download multitask features
Cell 15b   → Build challenge features (no augment)
Cell 15d   → Zip & download challenge features
```

### GIỮA SESSION 2 và 3
```
Upload 3 zip lên Kaggle Datasets:
  - "temporal-features"  ← từ Cell 14c
  - "multitask-features" ← từ Cell 15c
  - "challenge-features" ← từ Cell 15d
```

### SESSION 3 — Temporal Training
```
Cell 1-4   → Setup lại
Cell 15e   → Khôi phục features từ /kaggle/input (đổi tên dataset cho đúng)
Cell 16    → Temporal SSL Pretext    (resume từ ssl_spatial_best.pth)
Cell 17    → Temporal Supervised     (resume từ temporal_ssl_last.pth)
Cell 18    → Multitask Fine-tune     (resume từ ssl_temporal_last.pth)
```

### SESSION 4 — Evaluation
```
Cell 19    → evaluate_proxy.py
Cell 20    → evaluate_multitask.py
Cell 21    → evaluate_challenge.py
```

---

## ⚠️ Lưu ý quan trọng khi upload features lên Kaggle Dataset

Khi upload zip lên Kaggle, giải nén trong Settings và đặt tên dataset cho đúng.
Sau đó trong **Cell 15e**, sửa đúng tên dataset:

```python
FEATURE_DATASETS = {
    "temporal-features": "/kaggle/input/temporal-features",       # ← tên THỰC của dataset
    "multitask-features": "/kaggle/input/multitask-features",
    "challenge-features": "/kaggle/input/challenge-features",
}
```

Cell 15e sẽ tự động:
1. Copy files từ `/kaggle/input/` → `/kaggle/working/artifacts/`
2. Fix đường dẫn tuyệt đối trong tất cả manifest CSV

---

## 🎯 Mục tiêu chất lượng sau khi train xong

| Metric | Ngưỡng tối thiểu | Mục tiêu |
|--------|-----------------|---------|
| Proxy Recall (risky) | ≥ 0.80 | ≥ 0.90 |
| Multitask ROC-AUC | ≥ 0.85 | ≥ 0.92 |
| Challenge Holdout — normal_hard bucket | Precision ≤ 0.05 FPR | - |
| Challenge Holdout — positive_hard bucket | Recall ≥ 0.75 | ≥ 0.85 |

---

*Cập nhật: 2026-04-22 | Phiên bản pipeline: V5.2*
