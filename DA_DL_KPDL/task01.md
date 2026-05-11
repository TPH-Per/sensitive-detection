# TASK PROMPT — Implement Video Moderation V6.0 Components

## CONTEXT
Dự án: DA_DL_KPDL/ — Video Moderation V6.0
Runtime: Kaggle T4 16GB (train) / RTX 4050 6GB (inference)
Python: 3.10+, PyTorch, Ultralytics YOLOv8

Đọc kỹ TOÀN BỘ spec này trước khi viết bất kỳ dòng code nào.
Sau mỗi file hoàn thành, chạy smoke test trước khi sang file tiếp theo.

---

## TASK 1 — gore_detector.py
File: src/models/gore_detector.py

### Spec
Backbone: ssl_spatial_best.pth (SwAV ResNet18, 138MB)
Architecture: Frozen backbone + Linear classification head
Input: ảnh RGB tensor [B, 3, H, W], đã normalize ImageNet
Output: gore probability [B, 1], range [0, 1] sau sigmoid

### Chi tiết implementation
```python
class GoreDetector(nn.Module):
    def __init__(self, backbone_path, freeze=True):
        # Load SwAV ResNet18 từ ssl_spatial_best.pth
        # ⚠️ SwAV checkpoint có key "model" hoặc "state_dict" — phải handle cả 2
        # ⚠️ Bỏ projection head (prototypes) — chỉ giữ phần encoder ResNet18
        # ⚠️ Output của ResNet18 là 512-dim (không phải 2048 như ResNet50)
        # Linear head: Linear(512, 256) → ReLU → Dropout(0.3) → Linear(256, 1)
        # Nếu freeze=True: tắt gradient toàn bộ backbone
        pass

    def forward(self, x):
        # x: [B, 3, 224, 224]
        # → backbone → [B, 512] (global average pool)
        # → head → [B, 1] (logits, CHƯA sigmoid)
        # Return logits (không return sigmoid) để dùng BCEWithLogitsLoss
        pass

    def predict_proba(self, x):
        # Return sigmoid(forward(x)) — dùng trong inference
        pass
```

### Dataset loader cần viết kèm
```python
class GoreDataset(Dataset):
    # Positive: Blood_Violence train (11,466) + HOD/blood normal+hard (1,548)
    # Negative: UCF-101 frames (sample ngẫu nhiên, số lượng = positive × 2)
    # ⚠️ HOD format: ảnh trong jpg/, labels trong txt/ (YOLOv5 format)
    #    → Không cần đọc bbox, chỉ cần tên file để biết là positive
    # ⚠️ Blood_Violence: đọc labels/ để verify có blood annotation không
    #    (một số ảnh có thể là negative trong dataset)
    # Transform: RandomHorizontalFlip, ColorJitter(0.2), Resize(224), Normalize(ImageNet)
    pass
```

### Training script
```python
# Optimizer: AdamW, lr=1e-3 cho head (backbone frozen nên không cần backbone lr)
# Loss: BCEWithLogitsLoss(pos_weight=tensor([2.0]))
#       vì negative nhiều gấp 2× positive
# Epochs: 20, EarlyStopping patience=5
# Metric: F1-score, AUC-ROC (không dùng accuracy vì imbalanced)
```

### Smoke test bắt buộc sau khi viết xong
```python
# Test 1 — Shape test
model = GoreDetector("trong_so/ssl_spatial_best.pth")
dummy = torch.randn(4, 3, 224, 224)
out = model(dummy)
assert out.shape == (4, 1), f"Expected (4,1), got {out.shape}"

# Test 2 — Frozen check
for name, param in model.backbone.named_parameters():
    assert not param.requires_grad, f"Backbone param {name} should be frozen"

# Test 3 — Gradient flow check
out = model(dummy)
loss = out.sum()
loss.backward()
for name, param in model.head.named_parameters():
    assert param.grad is not None, f"Head param {name} has no gradient"

# Test 4 — Checkpoint load không lỗi
# Load ssl_spatial_best.pth, print các keys để verify load đúng
# Không được có "unexpected keys" từ prototypes SwAV
```

---

## TASK 2 — nsfw_classifier.py
File: src/models/nsfw_classifier.py

### Spec
Giống GoreDetector nhưng train trên NSFW data.
Backbone: ssl_spatial_best.pth (CÙNG backbone, KHÁC head)
⚠️ QUAN TRỌNG: Gore và NSFW dùng CÙNG frozen backbone nhưng head HOÀN TOÀN độc lập.
   Không share weight head giữa 2 model.

### Dataset loader
```python
class NSFWDataset(Dataset):
    # Positive (16,800 ảnh):
    #   nsfw_dataset_v1/porn/      → 5,600 ảnh
    #   nsfw_dataset_v1/hentai/    → 5,600 ảnh
    #   nsfw_dataset_v1/sexy/      → 5,600 ảnh (ĐÃ AUDIT: đủ tiêu chí)
    # Negative (11,200 ảnh):
    #   nsfw_dataset_v1/neutral/   → 5,600 ảnh
    #   nsfw_dataset_v1/drawings/  → 5,600 ảnh (làm hard negative)
    #
    # ⚠️ Tỉ lệ pos:neg = 16,800:11,200 ≈ 1.5:1 → positive nhiều hơn
    #    → pos_weight = 11200/16800 ≈ 0.67 (nhỏ hơn 1, NGƯỢC với thông thường)
    #    → Hoặc dùng WeightedRandomSampler để sample balanced
```

### Training
```python
# Optimizer: AdamW, lr=1e-3
# Loss: BCEWithLogitsLoss(pos_weight=tensor([0.67]))
# ⚠️ pos_weight < 1 vì positive nhiều hơn negative
# Epochs: 20, EarlyStopping patience=5
```

### Smoke test
```python
# Test 1 — Shape
# Test 2 — Frozen backbone
# Test 3 — Gradient flow qua head
# Test 4 — Predict range: sigmoid output phải nằm trong[1]
# Test 5 — Hard negative test:
#   Load 10 ảnh từ drawings/ → predict_proba → phải < 0.5 trung bình
#   (Nếu model random thì ~0.5, nếu train đúng thì thấp hơn)
```

---

## TASK 3 — yolo_retrain
Không viết file Python mới, dùng Ultralytics CLI.

### Chuẩn bị data.yaml
```yaml
# weapon_v6.yaml
path: /kaggle/working/yolo_weapon_v6
train: train/images
val: valid/images
test: test/images
nc: 1
names: ['weapon']  # ← CHỈ 1 CLASS, bỏ hoàn toàn Class 1 medical
```

### Cách merge HOD gun + knife thành 1 class
```python
# HOD labels dùng class_id từ HOD (gun=0, knife=1 hoặc ngược lại)
# Cần normalize về class_id=0 (weapon) cho tất cả
# Script merge:
def normalize_hod_labels(src_txt, dst_txt):
    # Đọc từng dòng label
    # Thay class_id bất kỳ → 0
    # Giữ nguyên bbox coordinates
    pass

# Cấu trúc sau khi merge:
# yolo_weapon_v6/
#   train/images/ ← gun_normal + gun_hard + knife_normal + knife_hard
#   train/labels/ ← tất cả class_id = 0
#   valid/images/ ← 20% split từ trên
#   test/images/  ← 10% split từ trên
```

### Train command
```bash
yolo detect train \
  model=yolov8n.pt \
  data=weapon_v6.yaml \
  epochs=50 \
  imgsz=640 \
  batch=16 \
  patience=10 \
  project=runs/weapon_v6 \
  name=exp1
```

### Smoke test sau train
```python
# Test 1 — Load model không lỗi
from ultralytics import YOLO
model = YOLO("runs/weapon_v6/exp1/weights/best.pt")

# Test 2 — Inference trên ảnh có vũ khí rõ ràng
# → Phải detect được với conf > 0.5

# Test 3 — Inference trên ảnh không có vũ khí (UCF-101 frame)
# → Không được có detection nào với conf > 0.3

# Test 4 — Kiểm tra output chỉ có 1 class
results = model(test_image)
for r in results:
    assert all(int(c) == 0 for c in r.boxes.cls), "Phát hiện class khác 0"
```

---

## TASK 4 — task_gated_attention.py
File: src/models/task_gated_attention.py

### Spec — Two-Way Cross-Attention (SAM Decoder style)
Đây là module phức tạp nhất. Đọc kỹ trước khi code.

Bước 1 — Token queries Frame (token được update):
Q = task_token [B, 1, D]
K = frame_pool [B, T, D_pool] ← D_pool có thể ≠ D
V = frame_pool [B, T, D_pool]
→ attn_weights [B, 1, T] ← dùng làm temporal saliency
→ token_updated [B, 1, D]

Bước 2 — Frame queries updated Token (frame_pool được update):
Q = frame_pool [B, T, D_pool]
K = token_updated [B, 1, D]
V = token_updated [B, 1, D]
→ frame_pool_updated [B, T, D_pool] ← frame "biết" mình đang phục vụ task nào

Output:
token_updated [B, 1, D] → đưa vào FFN_cls → score
attn_weights [B, T] → temporal saliency map
frame_pool_updated [B, T, D_pool] → có thể dùng thêm nếu cần

text

### Implementation chi tiết
```python
class TwoWayCrossAttention(nn.Module):
    def __init__(self, token_dim, pool_dim, num_heads=8, dropout=0.1):
        # ⚠️ token_dim có thể khác pool_dim
        #    VD: token_dim=768 (CLIP), pool_dim=774 (CLIP+Flow+YOLO+Gore)
        # Cần Linear projection để align dimensions trước khi attention
        # token_proj: Linear(token_dim, d_model)
        # pool_proj:  Linear(pool_dim, d_model)
        # d_model phải chia hết cho num_heads
        # LayerNorm + Dropout sau mỗi attention block
        pass

    def forward(self, task_token, frame_pool):
        # task_token: [B, 1, token_dim]
        # frame_pool: [B, T, pool_dim]
        # Return: token_updated, attn_weights, frame_pool_updated
        pass
```

### TaskGatedAttentionV6 — wrapper cho 3 gates
```python
class TaskGatedAttentionV6(nn.Module):
    def __init__(self, clip_dim=768, aux_dim=6, d_model=256, num_heads=8):
        # V_pool_dim = clip_dim + 3 + 1 + 1 = 773  (CLIP + Flow + YOLO + Gore)
        # S_pool_dim = clip_dim + 3 + 1 = 772       (CLIP + Flow + Gore)
        # N_pool_dim = clip_dim + 1 = 769            (CLIP + NSFW)
        #
        # 3 TwoWayCrossAttention instances — KHÔNG share weight
        # V_gate = TwoWayCrossAttention(d_model, V_pool_dim)
        # S_gate = TwoWayCrossAttention(d_model, S_pool_dim)
        # N_gate = TwoWayCrossAttention(d_model, N_pool_dim)
        #
        # 3 task tokens (learnable parameters):
        # v_token = nn.Parameter(torch.randn(1, 1, d_model))
        # s_token = nn.Parameter(torch.randn(1, 1, d_model))
        # n_token = nn.Parameter(torch.randn(1, 1, d_model))
        pass

    def forward(self, clip_feat, flow_feat, yolo_feat, gore_feat, nsfw_feat):
        # clip_feat:  [B, T, 768]
        # flow_feat:  [B, T, 3]
        # yolo_feat:  [B, T, 1]
        # gore_feat:  [B, T, 1]
        # nsfw_feat:  [B, T, 1]
        #
        # Bước 1 — Tạo pool riêng cho từng gate:
        # V_pool = cat([clip, flow, yolo, gore], dim=-1)  → [B, T, 773]
        # S_pool = cat([clip, flow, gore], dim=-1)        → [B, T, 772]
        # N_pool = cat([clip, nsfw], dim=-1)              → [B, T, 769]
        #
        # Bước 2 — Expand task tokens theo batch size:
        # v_tok = self.v_token.expand(B, -1, -1)  → [B, 1, d_model]
        #
        # Bước 3 — Chạy từng gate
        # v_updated, v_attn, _ = self.V_gate(v_tok, V_pool)
        # s_updated, s_attn, _ = self.S_gate(s_tok, S_pool)
        # n_updated, n_attn, _ = self.N_gate(n_tok, N_pool)
        #
        # Return:
        # v_updated [B,1,d_model], v_attn [B,T]
        # s_updated [B,1,d_model], s_attn [B,T]
        # n_updated [B,1,d_model], n_attn [B,T]
        pass
```

### Smoke test (QUAN TRỌNG — phải pass hết)
```python
B, T, d = 2, 64, 256
gate = TaskGatedAttentionV6(clip_dim=768, d_model=d)

clip  = torch.randn(B, T, 768)
flow  = torch.randn(B, T, 3)
yolo  = torch.randn(B, T, 1)
gore  = torch.randn(B, T, 1)
nsfw  = torch.randn(B, T, 1)

v_tok, v_attn, s_tok, s_attn, n_tok, n_attn = gate(clip, flow, yolo, gore, nsfw)

# Shape checks
assert v_tok.shape  == (B, 1, d),  f"v_tok: {v_tok.shape}"
assert s_tok.shape  == (B, 1, d),  f"s_tok: {s_tok.shape}"
assert n_tok.shape  == (B, 1, d),  f"n_tok: {n_tok.shape}"
assert v_attn.shape == (B, T),     f"v_attn: {v_attn.shape}"
assert s_attn.shape == (B, T),     f"s_attn: {s_attn.shape}"
assert n_attn.shape == (B, T),     f"n_attn: {n_attn.shape}"

# Attention sum check (softmax → phải sum = 1)
assert torch.allclose(v_attn.sum(dim=-1), torch.ones(B), atol=1e-5), \
    "v_attn không sum = 1"

# Isolation check — N_gate KHÔNG thấy YOLO signal
# Nếu thay đổi yolo_feat, n_tok phải không đổi
yolo_alt = torch.randn(B, T, 1)
_, _, _, _, n_tok_alt, _ = gate(clip, flow, yolo_alt, gore, nsfw)
assert torch.allclose(n_tok, n_tok_alt, atol=1e-6), \
    "N_gate bị ảnh hưởng bởi YOLO — lỗi isolation!"

# Gradient flow check
loss = v_tok.sum() + s_tok.sum() + n_tok.sum()
loss.backward()
assert gate.v_token.grad is not None, "v_token không có gradient"
assert gate.s_token.grad is not None, "s_token không có gradient"
assert gate.n_token.grad is not None, "n_token không có gradient"
```

---

## TASK 5 — task_gated_model.py
File: src/models/task_gated_model.py

### Spec
```python
class TaskGatedModelV6(nn.Module):
    def __init__(self, clip_dim=768, d_model=256, max_frames=64, dropout=0.2):
        # TaskGatedAttentionV6 (từ Task 4)
        # 3 FFN_cls độc lập (1 per task):
        #   FFN_cls: Linear(d_model, 64) → ReLU → Dropout → Linear(64, 1)
        # 3 FFN_sal (optional, cho temporal saliency visualization):
        #   FFN_sal: Linear(T, T) → Softmax (normalize saliency map)
        # Positional encoding cho frame sequence
        pass

    def forward(self, clip_feat, flow_feat, yolo_feat, gore_feat, nsfw_feat):
        # Input shapes:
        #   clip_feat: [B, T, 768]
        #   flow_feat: [B, T, 3]
        #   yolo_feat: [B, T, 1]
        #   gore_feat: [B, T, 1]
        #   nsfw_feat: [B, T, 1]
        #
        # 1. Chạy TaskGatedAttentionV6
        #    → v_tok, v_attn, s_tok, s_attn, n_tok, n_attn
        #
        # 2. Squeeze tokens: [B, 1, d_model] → [B, d_model]
        #
        # 3. FFN_cls cho từng task:
        #    v_logit = FFN_v(v_tok.squeeze(1))  → [B, 1]
        #    s_logit = FFN_s(s_tok.squeeze(1))  → [B, 1]
        #    n_logit = FFN_n(n_tok.squeeze(1))  → [B, 1]
        #
        # 4. Concat logits: [B, 3]
        #
        # Return:
        #   logits [B, 3]              ← dùng với BCEWithLogitsLoss
        #   saliency dict {
        #     "violence":  v_attn,    ← [B, T]
        #     "self_harm": s_attn,    ← [B, T]
        #     "nsfw":      n_attn     ← [B, T]
        #   }
        pass
```

### Smoke test
```python
model = TaskGatedModelV6()
B, T = 2, 64
clip  = torch.randn(B, T, 768)
flow  = torch.randn(B, T, 3)
yolo  = torch.randn(B, T, 1)
gore  = torch.randn(B, T, 1)
nsfw  = torch.randn(B, T, 1)

logits, saliency = model(clip, flow, yolo, gore, nsfw)

assert logits.shape == (B, 3)
assert saliency["violence"].shape  == (B, T)
assert saliency["self_harm"].shape == (B, T)
assert saliency["nsfw"].shape      == (B, T)

# Loss backward check
labels = torch.zeros(B, 3)
loss = F.binary_cross_entropy_with_logits(logits, labels)
loss.backward()
print("✅ TaskGatedModelV6 smoke test passed")
```

---

## TASK 6 — build_features_v6.py
File: scripts/build_features_v6.py

### Spec
```python
# Input:  video .mp4 / .avi
# Output: .npy file với shape [T, 774]
#         774 = CLIP(768) + Flow(3) + YOLO(1) + Gore(1) + NSFW(1)
# Thứ tự pipeline:
# 1. TransNet V2 → cắt shots
# 2. Mỗi shot: sample 16 frames đều
# 3. Với mỗi frame, extract song song:
#    a. CLIP ViT-B/32 → 
#    b. Optical Flow Farneback →  (mean, std, p90 magnitude)[2]
#    c. YOLOv8 (best.pt mới) →  (max weapon conf, = 0 nếu không detect)[1]
#    d. GoreDetector.predict_proba() →[1]
#    e. NSFWClassifier.predict_proba() →[1]
# 4. Stack frames: [T_total, 774]
# 5. Save .npy

# ⚠️ Edge cases phải handle:
# - Video không đọc được → log error, skip
# - TransNet V2 không cắt được shot nào → fallback về uniform 64 frames
# - Frame đen / corrupt → detect và replace bằng frame liền kề
# - YOLO không detect gì → yolo_feat = 0.0 (không phải NaN)
# - Gore/NSFW model output NaN → assert + raise error
# - Video quá ngắn (< 8 frames) → duplicate frames để đủ
```

### Validation sau khi extract
```python
def validate_npy(npy_path):
    data = np.load(npy_path)
    T, D = data.shape
    assert D == 774,          f"Expected 774 dims, got {D}"
    assert T >= 1,            f"Empty feature file"
    assert not np.isnan(data).any(), f"NaN detected in {npy_path}"
    assert not np.isinf(data).any(), f"Inf detected in {npy_path}"
    # Check từng feature block không toàn 0:
    assert data[:, :768].std() > 0,  "CLIP features toàn 0 — lỗi extraction"
    assert data[:, 768:771].std() > 0 or True,  # Flow có thể = 0 nếu video tĩnh
    return True
```

---

## QUY TẮC CHUNG KHI IMPLEMENT

1. Mỗi file hoàn thành → chạy smoke test → chỉ sang file tiếp theo khi PASS hết.
2. Không hardcode path — dùng config hoặc argparse.
3. Mọi checkpoint load phải handle cả trường hợp key "model", "state_dict", "backbone".
4. Không dùng .cuda() cứng — dùng device = torch.device("cuda" if torch.cuda.is_available() else "cpu").
5. Log rõ ràng: mỗi bước extract, train epoch đều print progress.
6. Với YOLO: sau retrain, verify output chỉ có class_id = 0, không có class khác.
7. Isolation test cho N_Gate là bắt buộc — đây là lỗi cốt lõi V5.2 cần fix triệt để.
8. Sau khi có đủ 5 components (Gore, NSFW, YOLO, TaskGatedAttn, TaskGatedModel),
   chạy end-to-end test trên 3 video: 1 violence, 1 nsfw, 1 safe.
   Kết quả phải hợp lý trước khi train trên toàn bộ dataset.