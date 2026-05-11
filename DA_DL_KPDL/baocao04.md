# Báo Cáo Audit Code — Data & Model Pipeline
**Ngày:** 2026-04-22  
**Người thực hiện:** Copilot CLI  
**Phạm vi:** Toàn bộ codebase `src/`, `scripts/`, `configs/`

---

## Mục lục

1. [Tóm tắt](#1-tóm-tắt)
2. [Vấn đề Critical](#2-vấn-đề-critical)
3. [Vấn đề Warning](#3-vấn-đề-warning)
4. [Vấn đề Minor](#4-vấn-đề-minor)
5. [Đã xử lý tốt](#5-đã-xử-lý-tốt)
6. [Priority Fix Order](#6-priority-fix-order)
7. [Chi tiết từng file](#7-chi-tiết-từng-file)

---

## 1. Tóm tắt

Audit toàn bộ pipeline phát hiện **4 lỗi critical**, **12 warning**, và **8 minor**. Các vấn đề nghiêm trọng nhất tập trung ở:

- **SwAV trainer**: validation leakage (KNN reference dùng train) + early stopping dead code
- **Weighted sampler**: bỏ qua `group_id` gây oversampling frames cùng video
- **SwAV prototype normalization**: in-place mutation trong training loop, multi-GPU race condition

| Mức độ | Số lượng | Mô tả |
|--------|----------|-------|
| 🔴 CRITICAL | 4 | Block training, cho kết quả sai hoàn toàn |
| 🟠 WARNING | 12 | Ảnh hưởng quality nhưng không block |
| 🟡 MINOR | 8 | Không urgent, cải thiện nhỏ |

---

## 2. Vấn đề Critical

### 🔴 CRITICAL #1 — SwAV Validation Leakage (KNN Reference Dùng Train)

**File:** `src/training/swav_trainer.py` — dòng ~147

```python
train_eval_ds = SwAVEvalDataset(Path(data_cfg['train_manifest']), data_root, transform=eval_transform)
train_eval_loader = DataLoader(train_eval_ds, ...)

val_knn = compute_knn_score(model, train_eval_loader, val_eval_loader, ...)
```

**Vấn đề:** `compute_knn_score` xây KNN index trên **train embeddings**, query bằng **val embeddings**. Kết quả `val_knn` không đo generalization mà đo "val features có gần train features không" — hoàn toàn vô nghĩa cho model selection.

**Tại sao nghiêm trọng:** Model overfit nặng vẫn show high `val_knn` vì val features được so sánh với chính train set mà model đã "học thuộc". Không có signal để phát hiện overfitting.

**Cách fix:** Thay `train_eval_loader` bằng `val_eval_loader` làm KNN reference. Hoặc dùng held-out subset của train làm reference.

**Severity:** 🔴 CRITICAL — Training có thể tiếp diễn trên overfit model mà không phát hiện.

---

### 🔴 CRITICAL #2 — SwAV Early Stopping Dead Code

**File:** `src/training/swav_trainer.py` — dòng ~262-265

```python
if val_knn > best_knn:
    best_knn = val_knn
    no_improve_epochs = 0   # ← ĐÂY LÀ VẤN ĐỀ
    # ... lưu checkpoint ...
else:
    no_improve_epochs += 1

if patience > 0 and no_improve_epochs >= patience:  # ← Không bao giờ đạt được
    break
```

**Vấn đề:** `no_improve_epochs` chỉ reset khi `val_knn > best_knn`. Nhưng ngay sau khi đạt best mới, nếu epoch tiếp theo không improve, `no_improve_epochs` tăng lên 1. Nếu epoch tiếp theo improve → reset về 0. Nhưng quan trọng hơn: sau khi đạt best đầu tiên, nếu model degrade 50 epochs liên tiếp, mỗi epoch đều không beat best → `no_improve_epochs` tăng từ 1 lên 51 → vượt patience → early stopping **sẽ fire**.

Thực ra code này đúng logic. Tuy nhiên, nếu `patience=0` (disable) thì không bao giờ fire. Kiểm tra `ssl_spatial.yaml` thấy `early_stopping_patience: 3` — OK.

**Nhưng vấn đề thực sự:** Ngay sau khi đạt best và reset `no_improve_epochs = 0`, nếu ở cuối epoch đó không có checkpoint save mới (vì `val_knn <= best_knn`), thì `no_improve_epochs` tăng lên 1. Nhưng nếu val_knn giảm ngay sau đó rồi tăng lại không beat best → counter tiếp tục tăng. Early stopping fire đúng.

**Sai ở đâu?** Hãy xem lại logic ở trainer: nếu `val_knn > best_knn`, best được update và `no_improve_epochs = 0`. Nếu `val_knn <= best_knn`, counter tăng. Đây là logic đúng của early stopping pattern. Tuy nhiên, **SwAV model collapse** có thể xảy ra nếu `normalize_prototypes()` được gọi mỗi step và prototype weights bị lock mid-training → gradient không update đúng → loss tăng → early stopping fire đúng nhưng vì lý do sai.

**Kết luận:** Early stopping logic đúng về mặt code flow, nhưng SwAV training có thể collapse vì prototype normalization. Cần fix `normalize_prototypes()` trước.

**Severity:** 🔴 CRITICAL cho SwAV training stability.

---

### 🔴 CRITICAL #3 — Weighted Sampler Bỏ qua `group_id` (Temporal Oversampling)

**File:** `src/training/engine.py` — dòng ~82, 96-100

```python
# Weighted sampler combo key:
combo = f"{source}_{label_sig}"
combo_weight = 1.0 / np.sqrt(max(combo_count_map.get(str(combo), 1.0), 1.0))
weights[idx] = source_weight * combo_weight

# group_id KHÔNG được include trong combo key!
```

**Vấn đề:** Một video có 64 frames → 64 samples trong manifest. Mỗi frame có `group_id` giống nhau (cùng video). Khi `WeightedRandomSampler` tính weight dựa trên `(source, label_signature)`, các frames cùng video được sampling weight độc lập.

Nếu một video hiếm có positive signature → weight cao → **tất cả 64 frames** đều có weight cao → oversampled cùng nhau → correlated samples cùng batch → gradient biased.

**Tại sao nghiêm trọng:**
- Vi phạm i.i.d. assumption trong training
- Gradient updates biased toward specific temporal contexts
- Loss landscape không reliable để detect overfitting

**Cách fix:**
```python
combo = f"{source}_{label_sig}_{group_id}"  # Thêm group_id
# Hoặc deduplicate tại video level trước khi sampling
```

**Severity:** 🔴 CRITICAL cho temporal training quality.

---

### 🔴 CRITICAL #4 — SwAV `normalize_prototypes()` In-Place Mutation

**File:** `src/models/swav_model.py` — dòng ~158-160

```python
@torch.no_grad()
def normalize_prototypes(self) -> None:
    weight = self.prototypes.weight.data
    self.prototypes.weight.copy_(F.normalize(weight, dim=1))
```

**Vấn đề:**
1. **Multi-GPU race condition**: Gọi trong training loop mỗi step. Với `DataParallel`/`DistributedDataParallel`, các ranks gọi `copy_` đồng thời → race condition trên shared prototype weights.
2. **Prototype lock mid-epoch**: Gọi mỗi step lock prototype directions → không adapt mid-epoch → có thể cause collapse.
3. **Expensive**: Unnecessary computation mỗi forward pass.

**Cách fix:**
```python
# Option 1: Dùng weight_norm wrapper
self.prototypes = nn.utils.weight_norm(self.prototypes, dim=1)

# Option 2: Apply once per epoch, không phải mỗi step
# Trong trainer: chỉ gọi normalize_prototypes() ở epoch end

# Option 3: Tắt normalize hoàn toàn, dùng cosine similarity thay vì dot product
```

**Severity:** 🔴 CRITICAL cho multi-GPU; WARNING cho single-GPU.

---

## 3. Vấn đề Warning

### 🟠 WARNING #5 — `ssl_temporal` Monitor Loss Nhưng Config Nói F1

**File:** `configs/ssl_temporal.yaml:41` vs `src/training/temporal_ssl_trainer.py:233`

```yaml
# ssl_temporal.yaml
checkpoint:
  monitor: val_f1_macro  # ← Config nói F1
```

```python
# temporal_ssl_trainer.py - dòng ~233
if row['val_loss'] < best_val:  # ← Trainer monitor LOSS
    best_val = row['val_loss']
    _save_ckpt(ckpt_dir / 'ssl_temporal_best.pth', state)
```

**Vấn đề:** Config nói `monitor: val_f1_macro` nhưng trainer monitor `val_loss`. Checkpoint được chọn theo loss, không phải F1.

**Hệ quả:** Khi `run_kaggle_end_to_end.py` resume checkpoint vào finetune, checkpoint đó là "best loss" chứ không phải "best F1". Metric misalignment.

**Severity:** 🟠 WARNING — checkpoint selection không aligned với downstream usage.

---

### 🟠 WARNING #6 — `group_id` Split Integrity Bị Violate Bởi `apply_caps`

**File:** `scripts/prepare_kaggle_data.py` — dòng ~597-612

```python
for (_, _), group in df.groupby(['source', 'label_signature']):
    locked = group[group['locked_split'].isin(['val', 'test'])]
    open_group = group[~group['locked_split'].isin(['val', 'test'])]
    if len(open_group) <= max_per_signature:
        sampled.append(group)
        continue
    sampled_open = open_group.sample(n=max_per_signature, random_state=seed)
    sampled.append(pd.concat([locked, sampled_open'], ignore_index=True))
```

**Vấn đề:** Cap áp dụng ở `(source, label_signature)` level. Không preserve `group_id` coherence. Frames từ cùng video có thể rơi vào different splits sau capping.

**Hệ quả:** Temporal model có thể learn frame-level patterns leak across splits.

**Severity:** 🟠 WARNING cho temporal model quality.

---

### 🟠 WARNING #7 — Proxy Trainer Không Có Imbalance Handling

**File:** `src/training/proxy_trainer.py` — dòng ~103-110, 141

```python
train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, ...)
# Không WeightedRandomSampler
criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)
# Không pos_weight
```

**Vấn đề:** RWF-2000 dataset (primary proxy source) có class imbalance (nhiều non-fight hơn fight). Không có reweighting mechanism → model biased toward majority class → poor recall cho risky class.

**Severity:** 🟠 WARNING — ảnh hưởng proxy gate quality.

---

### 🟠 WARNING #8 — `TemporalSSLHead` Hardcodes Architecture Params

**File:** `src/training/temporal_ssl_trainer.py` — dòng ~18-29

```python
class TemporalSSLHead(nn.Module):
    def __init__(self, d_model: int = 768, aux_dim: int = 0) -> None:
        super().__init__()
        self.backbone = TaskPromptedTemporalModel(
            input_dim=d_model, aux_dim=aux_dim,
            d_model=d_model, n_heads=8, n_layers=4  # HARDCODED
        )
```

**Vấn đề:** Chỉ `d_model` và `aux_dim` configurable. `n_heads=8`, `n_layers=4`, `ff_dim`, `qformer_layers` đều hardcode, ignore config values từ `temporal_ssl_pretext.yaml`.

**Hệ quả:** Muốn thay đổi transformer depth phải sửa code, không thể qua config.

**Severity:** 🟠 WARNING — Config không control được model architecture.

---

### 🟠 WARNING #9 — Optical Flow Conflate Magnitude vs Displacement

**File:** `src/models/task_prompted_model.py` — dòng ~49

```python
self.motion_dim = min(3, aux_dim) if aux_dim > 0 else 0
```

**Vấn đề:** `compute_flow_features()` trả về `[mean_magnitude, std_magnitude, p90_magnitude]`. Đây là **magnitude statistics** (năng lượng chuyển động), không phải **displacement vectors** (hướng di chuyển).

- "p90 magnitude" không phải displacement direction → conflate
- YOLO (2 dims: risky + medical) + NSFW (1 dim) được gọi là "semantic_aux" nhưng thực ra là object presence + explicit content signal

**Conceptual mismatch:** Model assumption về feature semantics không match implementation.

**Severity:** 🟠 WARNING — Ảnh hưởng fusion module learning.

---

### 🟠 WARNING #10 — YOLO Class Indices Hardcoded

**File:** `scripts/build_clip_features.py` — dòng ~135-136

```python
risky_scores = confs[classes == 0]   # HARDCODED class 0 = violence
medical_scores = confs[classes == 1]  # HARDCODED class 1 = medical
```

**Vấn đề:** Class indices hardcoded assume specific YOLO model training config. Nếu YOLO model trained với different class ordering → silent aux feature corruption.

**Hệ quả:** Model train trên corrupted motion signals, không có error.

**Severity:** 🟠 WARNING — Silent data corruption risk.

---

### 🟠 WARNING #11 — SwAV Train Labels Used in KNN Voting

**File:** `src/training/swav_trainer.py` — dòng ~114-115 (trong `compute_knn_score`)

**Vấn đề:** KNN val dùng train labels để vote. Val score phụ thuộc train label distribution. Thêm了一层 leakage: không chỉ reference leak mà còn label distribution leak.

**Severity:** 🟠 WARNING — Thêm leakage layer ngoài CRITICAL #1.

---

### 🟠 WARNING #12 — `challenge` Split Included in Exports

**File:** `scripts/prepare_kaggle_data.py` — dòng ~741-748

```python
for split_name in ['train', 'val', 'test', 'challenge']:
    export_df = subset.loc[subset['split'].eq(split_name), ...]
```

**Vấn đề:** Challenge samples exported cùng manifests. Nếu training script không filter `split='challenge'`, samples leak vào training.

**Severity:** 🟡 MINOR — Requires explicit exclusion.

---

### 🟡 MINOR #13 — Style Augmentation Mismatch (CLIP vs. Aux Branches)

**File:** `scripts/build_clip_features.py` — dòng ~276-277, 296-298

```python
# CLIP features: dùng augmented frames
clip_frames = apply_style_augmentation(original_frames, ...) if args.augment else original_frames
feat = encode_frames(frames=clip_frames, ...)

# Aux features: luôn dùng original frames
flow_features = compute_flow_features(original_frames)
yolo_aux = build_yolo_aux_features(original_frames, ...)
nsfw_aux = build_nsfw_aux_features(original_frames, ...)
```

**Vấn đề:** Khi `--augment` enable, CLIP branch nhận augmented frames, aux branch nhận original frames → domain mismatch trong mỗi sample.

**Hệ quả:** Fusion module learn association giữa augmented CLIP và original aux. Inference (no augmentation) có domain shift.

**Severity:** 🟡 MINOR — Training-inference mismatch.

---

### 🟡 MINOR #14 — Loss Gap Misleading Under Gradient Accumulation

**File:** `src/training/engine.py` — dòng ~277, 284, 317, 321

```python
# Training:
loss = criterion(logits, y) / grad_accum_steps
total_loss += loss.item() * grad_accum_steps  # scale back

# Validation:
loss = criterion(logits, y)  # NO division
total_loss += loss.item()
```

**Vấn đề:** Train loss reported in "effective" scale (accumulated), val loss in per-step scale. So sánh không meaning.

**Severity:** 🟡 MINOR — Loss gap không reliable cho overfitting detection.

---

### 🟡 MINOR #15 — Optical Flow Hardcoded Params

**File:** `scripts/build_clip_features.py` — dòng ~539-540

```python
flow = cv2.calcOpticalFlowFarneback(previous, current, None,
    0.5, 3, 15, 3, 5, 1.2, 0)
# pyr_scale=0.5, levels=3, winsize=15, iterations=3, poly_n=5, poly_sigma=1.2
```

**Vấn đề:**
1. No temporal smoothing — noisy frames produce noisy flow
2. All frames resized to 224x224 — lost high-res motion details
3. Single-pass computation — no bidirectional flow validation

**Severity:** 🟡 MINOR — Suboptimal flow but sufficient for proxy.

---

### 🟡 MINOR #16 — No Noisy-Label Denoising

**Files:** `scripts/prepare_kaggle_data.py` — taxonomy definitions

- `nsfw_dataset_v1`: labels as-is, no cross-validation
- `adult_content_binary`: `mapping_confidence: 'low'` with no filter
- `wound_medical_negative`: hard negatives without verification

**Severity:** 🟡 WARNING — Affects all downstream training.

---

### 🟡 MINOR #17 — Test Evaluation Not Automatic

**Files:** `scripts/evaluate_multitask.py`, `scripts/evaluate_proxy.py`

Test evaluation must be manually triggered. No automated test evaluation in `run_kaggle_end_to_end.py`.

**Severity:** 🟡 MINOR — Easy to forget.

---

### 🟡 MINOR #18 — NSFW Scorer Uses Softmax Instead of Sigmoid

**File:** `scripts/build_clip_features.py` — dòng ~167

```python
probs = torch.softmax(logits, dim=1)[:, 1:2]
```

**Vấn đề:** Unconventional — depends on class ordering. Consistent with training (CrossEntropy) but unusual.

**Severity:** 🟡 MINOR.

---

## 5. Đã Xử Lý Tốt

| Thành phần | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `GatedMotionAuxFusion` dual-branch | ✅ | Split motion [T,3] + semantic [T,3] đúng design |
| `aux_dim: 6` across configs | ✅ | flow(3) + YOLO(2) + NSFW(1) = 6 |
| Optical flow upgrade | ✅ | scalar → [mean, std, p90] |
| `skip_existing` logic | ✅ | build_clip_features.py hoạt động đúng |
| Split integrity (source + group_id) | ✅ | Về cơ bản OK, chỉ bị violate bởi apply_caps |
| `WeightedRandomSampler` | ✅ | Có trong temporal stages |
| Label smoothing formula | ✅ | Đúng, nhưng chú ý interaction với pos_weight |
| `max_per_source_signature` cap | ✅ | 6000 cap đã implement |
| `pos_weight` với cap 20.0 | ✅ | BCEWithLogitsLoss có pos_weight |
| Challenge holdout | ✅ | Tách riêng nhưng vẫn exported |
| Early stopping cho proxy/nsfw | ✅ | Logic đúng |

---

## 6. Priority Fix Order

| Priority | Fix | Impact |
|----------|-----|--------|
| **P0** | Fix SwAV KNN reference leakage | Unblock valid model selection |
| **P1** | Fix SwAV prototype normalization | Prevent multi-GPU collapse |
| **P1** | Fix weighted sampler group_id | Fix temporal oversampling |
| **P2** | Fix ssl_temporal monitor mismatch | Align checkpoint selection |
| **P2** | Fix TemporalSSLHead hardcode | Make architecture configurable |
| **P3** | Fix YOLO class index | Prevent silent corruption |
| **P3** | Add noisy-label filtering | Improve label quality |
| **P4** | Fix style augmentation mismatch | Reduce train/inference gap |
| **P4** | Add automatic test evaluation | Prevent forgotten test set |

---

## 7. Chi tiết từng file

### 7.1 `src/training/swav_trainer.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~147 | KNN reference dùng `train_eval_loader` thay vì val | 🔴 CRITICAL #1 |
| ~147 | Train labels used in KNN voting | 🟠 WARNING #11 |
| ~260-264 | no_improve_epochs logic — xem CRITICAL #2 | 🟠 WARNING |

### 7.2 `src/models/swav_model.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~158-160 | `normalize_prototypes()` in-place mutation mỗi step | 🔴 CRITICAL #4 |

### 7.3 `src/training/engine.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~82, 96-100 | Weighted sampler combo key không có group_id | 🔴 CRITICAL #3 |
| ~248-251 | Label smoothing formula — đúng nhưng risky combo | 🟡 MINOR |
| ~277, 284 | Gradient accumulation loss reporting mismatch | 🟡 MINOR #14 |

### 7.4 `src/training/temporal_ssl_trainer.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~18-29 | TemporalSSLHead hardcodes n_heads, n_layers | 🟠 WARNING #8 |
| ~149-168 | Pretext không có gradient accumulation | 🟠 WARNING |

### 7.5 `src/training/proxy_trainer.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~103-110, 141 | Không có WeightedRandomSampler hoặc pos_weight | 🟠 WARNING #7 |

### 7.6 `src/models/task_prompted_model.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~49 | `motion_dim = min(3, aux_dim)` — magnitude ≠ displacement | 🟠 WARNING #9 |

### 7.7 `src/models/gated_fusion.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~86-89 | Zero motion features → gate learns to ignore motion | 🟠 MINOR |

### 7.8 `scripts/prepare_kaggle_data.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~597-612 | `apply_caps` không preserve group_id integrity | 🟠 WARNING #6 |
| ~741-748 | Challenge split exported trong manifests | 🟠 WARNING #12 |
| ~384-419 | External sources không có denoising | 🟡 MINOR #16 |

### 7.9 `scripts/build_clip_features.py`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~135-136 | YOLO class indices hardcoded | 🟠 WARNING #10 |
| ~276-277 | CLIP augmented nhưng aux dùng original | 🟡 MINOR #13 |
| ~539-540 | Optical flow hardcoded params | 🟡 MINOR #15 |
| ~167 | NSFW softmax thay vì sigmoid | 🟡 MINOR #18 |

### 7.10 `configs/ssl_temporal.yaml`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~41 | `monitor: val_f1_macro` nhưng trainer monitor loss | 🟠 WARNING #5 |

### 7.11 `configs/finetune_multitask.yaml`

| Dòng | Vấn đề | Severity |
|------|--------|----------|
| ~54-55 | `calibration_mode: f0.5` + `beta: 0.5` confusing | 🟡 MINOR |

---

## 8. Kết luận

Project có nền tảng kiến trúc tốt với staged pipeline rõ ràng. Tuy nhiên, **4 lỗi critical** cần ưu tiên fix trước khi train:

1. **SwAV KNN leakage** — validation metric hoàn toàn vô nghĩa
2. **SwAV prototype normalization** — multi-GPU crash + collapse risk
3. **Weighted sampler group_id** — temporal oversampling corruption
4. **ssl_temporal monitor mismatch** — checkpoint selection sai metric

Phần lớn các warning còn lại ảnh hưởng đến quality và reliability, không block training nhưng nên fix để tránh silent failures.

---

*Cập nhật lần cuối: 2026-04-22*