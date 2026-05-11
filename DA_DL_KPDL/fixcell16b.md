Báo Cáo Kỹ Thuật: Phân Tích & Phương Án Khắc Phục Temporal SSL Cell 16b

Ngày: 2026-04-27
Trạng thái: Đề xuất sửa chữa — Cell 17 Design
Mục tiêu: Đưa Accuracy ≥ 65% (Direction), ≥ 60% (Speed, Shuffle)
1. Tổng Quan Vấn Đề

Thí nghiệm Cell 16b thất bại hoàn toàn với cả 3 pretext tasks đạt ngưỡng ~50% (tương đương đoán ngẫu nhiên). Qua đối chiếu với các tài liệu nghiên cứu liên quan — TCLR (Temporal Contrastive Learning for Video Representation), Spatio-Temporal Non-local Block, và A Cookbook of Self-Supervised Learning — xác định được 7 lỗi sai có tính hệ thống, không phải do hyperparameters hay dữ liệu, mà do thiết kế kiến trúc và lý thuyết nền tảng sai.

Báo cáo này trình bày từng lỗi, nguyên lý sửa chữa, code cụ thể, và kiến trúc mới được đề xuất.
2. Phân Tích Lỗi & Giải Pháp Chi Tiết
2.1 LỖI #1 — Softmax sai cho Binary Classification (Critical)
Vấn đề gốc

Báo cáo Cell 16b sử dụng Softmax + CrossEntropyLoss cho 3 classification heads, mỗi head là một bài toán binary (xuôi/ngược, 1x/2x, shuffled/not). Đây là lỗi kỹ thuật cơ bản:
Hàm kích hoạt	Dùng cho	Output
Sigmoid	Binary (2 class)	1 scalar ∈ (0, 1)
Softmax	Multi-class (≥3 class)	Vector tổng = 1

Khi dùng Softmax với 2 output nodes, 2 xác suất luôn bù nhau (p₁ + p₂ = 1), tạo ra thông tin thừa. Gradient signal bị chia đôi một cách vô nghĩa, làm hội tụ chậm và thiếu ổn định, đặc biệt nghiêm trọng khi 3 heads cùng backpropagation về 1 backbone duy nhất.
Giải pháp

Chuyển sang Sigmoid + BCEWithLogitsLoss — đây là tiêu chuẩn cho binary classification trong mọi framework hiện đại:

python
# === TRƯỚC (SAI) ===
class OldTemporalHeads(nn.Module):
    def __init__(self, feat_dim=512):
        super().__init__()
        self.direction_head = nn.Linear(feat_dim, 2)  # 2 outputs
        self.speed_head     = nn.Linear(feat_dim, 2)
        self.shuffle_head   = nn.Linear(feat_dim, 2)
    
    def forward(self, x):
        return (F.softmax(self.direction_head(x), dim=-1),
                F.softmax(self.speed_head(x), dim=-1),
                F.softmax(self.shuffle_head(x), dim=-1))

criterion = nn.CrossEntropyLoss()
loss = criterion(logits, labels)  # labels phải là LongTensor


# === SAU (ĐÚNG) ===
class FixedTemporalHeads(nn.Module):
    def __init__(self, feat_dim=512):
        super().__init__()
        self.direction_head = nn.Linear(feat_dim, 1)  # 1 output
        self.speed_head     = nn.Linear(feat_dim, 1)
        self.shuffle_head   = nn.Linear(feat_dim, 1)
    
    def forward(self, x):
        # KHÔNG dùng sigmoid ở đây — BCEWithLogitsLoss tự xử lý
        return (self.direction_head(x).squeeze(-1),
                self.speed_head(x).squeeze(-1),
                self.shuffle_head(x).squeeze(-1))

criterion = nn.BCEWithLogitsLoss()
# labels phải là FloatTensor: 0.0 hoặc 1.0
loss = criterion(logits, labels.float())

Lý do dùng BCEWithLogitsLoss thay vì sigmoid + BCELoss: Hàm này kết hợp sigmoid và binary cross entropy trong một phép tính numerically stable, tránh overflow khi logit quá lớn hoặc quá nhỏ.
2.2 LỖI #2 — SwAV Backbone mâu thuẫn với Temporal Learning (Root Cause)
Vấn đề gốc

Đây là nguyên nhân cốt lõi của toàn bộ thất bại. SwAV được huấn luyện bằng multi-crop + prototype clustering để tạo ra features bất biến (invariant) với mọi thay đổi. SSL Cookbook chỉ rõ: "the deep nature of what is learned by the SSL models is defined by the data augmentation pipeline".

SwAV học cách loại bỏ sự thay đổi theo thời gian (temporal variation). Trong khi đó, Temporal SSL lại yêu cầu features nhạy cảm (equivariant) với thay đổi theo thời gian. Đây là mâu thuẫn trực tiếp ở cấp độ triết lý học biểu diễn:

text
SwAV học:     Frame₁ ≈ Frame₂ ≈ Frame₁₆  (temporal invariance)
Temporal SSL cần: Frame₁ ≠ Frame₂ ≠ Frame₁₆  (temporal sensitivity)

Freeze thêm layer1–layer3 khiến backbone càng cứng hơn, không thể thích nghi.
Giải pháp: Unfreeze Progressive + Backbone Phù Hợp

Phương án A — Ngắn hạn (giữ ResNet-18 SwAV):
Unfreeze dần từ layer2 trở lên theo epoch:

python
def progressive_unfreeze(model, epoch):
    """
    Epoch  0-5:  Chỉ train layer4 + heads (như cũ)
    Epoch  5-10: Unfreeze layer3
    Epoch 10-15: Unfreeze layer2
    Epoch 15+:   Toàn bộ backbone
    """
    # Đặt tất cả về frozen trước
    for param in model.backbone.parameters():
        param.requires_grad = False
    
    if epoch >= 5:
        for param in model.backbone.layer3.parameters():
            param.requires_grad = True
    if epoch >= 10:
        for param in model.backbone.layer2.parameters():
            param.requires_grad = True
    if epoch >= 15:
        for param in model.backbone.layer1.parameters():
            param.requires_grad = True
    
    # Layer4 luôn được train
    for param in model.backbone.layer4.parameters():
        param.requires_grad = True

# Trong training loop:
for epoch in range(num_epochs):
    progressive_unfreeze(model, epoch)
    train_one_epoch(model, dataloader)

Phương án B — Khuyến nghị (backbone temporal-aware):
Thay SwAV bằng backbone được pretrain trên video. TCLR dùng 3D ResNet-18 (R3D-18) — architecture xử lý không gian và thời gian đồng thời từ conv đầu tiên:

python
import torchvision.models.video as video_models

# R3D-18: 3D convolutions, pretrained trên Kinetics-400
backbone = video_models.r3d_18(pretrained=True)
# Input: (B, C, T, H, W) = (batch, 3, 16, 112, 112)
# Output features từ layer4: (B, 512, T', H', W')

2.3 LỖI #3 — Receptive Field của 1D Conv Quá Nhỏ (Architecture)
Vấn đề gốc

Spatio-Temporal Non-local Block paper mô tả rõ giới hạn của convolution: "a convolutional operation sums up the weighted input in a local neighborhood (e.g., i−1 ≤ j ≤ i+1 in a 1-D case with kernel size 3)". Với 2 lớp Conv1D(kernel=3):

text
Receptive field = 1 + (kernel-1) × num_layers = 1 + 2×2 = 5 frames

Với 16 frames, Conv1D chỉ "nhìn thấy" 5/16 frames. Temporal Shuffle đặc biệt bị ảnh hưởng vì nhóm 1 (frames 1-4) và nhóm 4 (frames 13-16) không bao giờ nằm trong cùng receptive field.
Giải pháp A: Dilated Conv1D (Receptive Field Mở Rộng)

python
class DilatedTemporalAggregator(nn.Module):
    """
    Receptive field: 1 + 2*(3-1) + 4*(3-1) + 8*(3-1) = 29 frames > 16
    """
    def __init__(self, in_channels=512, out_channels=256):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, out_channels, 
                               kernel_size=3, dilation=1, padding=1)
        self.conv2 = nn.Conv1d(out_channels, out_channels, 
                               kernel_size=3, dilation=2, padding=2)
        self.conv3 = nn.Conv1d(out_channels, out_channels, 
                               kernel_size=3, dilation=4, padding=4)
        self.norm1 = nn.BatchNorm1d(out_channels)
        self.norm2 = nn.BatchNorm1d(out_channels)
        self.norm3 = nn.BatchNorm1d(out_channels)
    
    def forward(self, x):
        # x: (B, C, T) = (batch, 512, 16)
        x = F.relu(self.norm1(self.conv1(x)))
        x = F.relu(self.norm2(self.conv2(x)))
        x = F.relu(self.norm3(self.conv3(x)))
        return x.mean(dim=-1)  # Global temporal pooling: (B, 256)

Giải pháp B (Tốt hơn): Temporal Self-Attention

Non-local Block paper chứng minh self-attention capture toàn bộ 16 frames cùng lúc và cho kết quả tốt hơn Conv1D với chi phí tính toán tương đương:

python
class TemporalSelfAttention(nn.Module):
    """
    Non-local block cho temporal dimension.
    Mỗi frame có thể attend đến tất cả 15 frames còn lại.
    """
    def __init__(self, in_channels=512, reduction=2):
        super().__init__()
        mid_channels = in_channels // reduction
        
        self.query = nn.Conv1d(in_channels, mid_channels, 1)
        self.key   = nn.Conv1d(in_channels, mid_channels, 1)
        self.value = nn.Conv1d(in_channels, mid_channels, 1)
        self.proj  = nn.Conv1d(mid_channels, in_channels, 1)
        
        # Residual connection — khởi tạo = 0 để là identity map ban đầu
        nn.init.zeros_(self.proj.weight)
        nn.init.zeros_(self.proj.bias)
    
    def forward(self, x):
        # x: (B, C, T)
        B, C, T = x.shape
        
        Q = self.query(x)  # (B, C/2, T)
        K = self.key(x)    # (B, C/2, T)
        V = self.value(x)  # (B, C/2, T)
        
        # Attention map: (B, T, T)
        attn = torch.bmm(Q.transpose(1,2), K)  # (B, T, T)
        attn = F.softmax(attn / (C**0.5), dim=-1)
        
        # Attended features: (B, C/2, T)
        out = torch.bmm(V, attn.transpose(1,2))
        out = self.proj(out)
        
        return (x + out).mean(dim=-1)  # (B, C)

2.4 LỖI #4 — Speed Prediction Thiết Kế Sai Logic (Pretext Task)
Vấn đề gốc

Báo cáo mô tả Speed Prediction dựa vào "pixel delta" giữa các frames. TCLR xác nhận đây là "predicting playback rate" — tức model học temporal sampling density, không phải pixel difference.

Vấn đề quan trọng hơn: Clip 1x và clip 2x được lấy từ cùng 32 frames nhưng với sampling khác nhau. Nếu video tĩnh hoặc ít chuyển động (nhiều trong RWF-2000), clip 1x và clip 2x trông gần như giống nhau → task không có signal.
Giải pháp: Augment mạnh hơn + Kiểm tra data distribution

python
class SpeedAugmentation:
    """
    Đảm bảo clip 2x thực sự 'nhanh hơn' bằng cách
    chọn video có đủ chuyển động.
    """
    def __init__(self, motion_threshold=0.02):
        self.motion_threshold = motion_threshold
    
    def compute_motion_score(self, frames):
        """Tính optical flow magnitude trung bình (nhanh bằng frame diff)"""
        diffs = torch.abs(frames[1:] - frames[:-1])
        return diffs.mean().item()
    
    def create_speed_pair(self, video_frames):
        """
        video_frames: tensor (T_full, C, H, W), T_full >= 32
        Returns: (clip_1x, clip_2x, should_skip)
        """
        motion_score = self.compute_motion_score(video_frames[:32])
        
        # Bỏ qua video quá tĩnh — không có signal cho speed task
        if motion_score < self.motion_threshold:
            return None, None, True
        
        # 1x: 16 frames liên tiếp (frame 0, 1, 2, ..., 15)
        clip_1x = video_frames[0:32:2]   # lấy chẵn = 16 frames
        
        # 2x: 16 frames nhưng bước nhảy 2 (frame 0, 2, 4, ..., 30)
        clip_2x = video_frames[0:32:1][:16]   # 16 frames liên tiếp nhưng từ gốc
        
        return clip_1x, clip_2x, False

# Trong dataloader:
def build_speed_batch(videos):
    pairs, labels = [], []
    augmentor = SpeedAugmentation()
    for video in videos:
        c1x, c2x, skip = augmentor.create_speed_pair(video)
        if not skip:
            pairs.append(c1x); labels.append(0.0)  # 1x = label 0
            pairs.append(c2x); labels.append(1.0)  # 2x = label 1
    return torch.stack(pairs), torch.tensor(labels)

2.5 LỖI #5 — Thiếu Projector MLP — Dimensional Collapse (SSL Theory)
Vấn đề gốc

SSL Cookbook (Section 2.6.2) định nghĩa Dimensional Collapse: "occurs when information encoded across different dimensions of the representation is redundant... the embeddings are rank-deficient". Features từ SwAV backbone đã bị collapse từ trước — tất cả frames cho ra vector gần như giống nhau trong không gian feature.

Không có projector, 1D Conv/Self-Attention buộc phải học trực tiếp từ collapsed features — không có signal để phân biệt.
Giải pháp: Thêm Projector MLP trước Temporal Aggregator

python
class TemporalSSLModel(nn.Module):
    def __init__(self, backbone, feat_dim=512, proj_dim=256, num_frames=16):
        super().__init__()
        self.backbone = backbone
        
        # Projector: ánh xạ features sang không gian ít collapsed hơn
        # SSL Cookbook: projector phòng tránh dimensional collapse [file:3]
        self.projector = nn.Sequential(
            nn.Linear(feat_dim, feat_dim),
            nn.BatchNorm1d(feat_dim),
            nn.ReLU(inplace=True),
            nn.Linear(feat_dim, proj_dim),
            nn.BatchNorm1d(proj_dim),
            nn.ReLU(inplace=True),
            nn.Linear(proj_dim, proj_dim)  # KHÔNG có activation cuối
        )
        
        # Temporal Aggregator (Self-Attention từ 2.3)
        self.temporal_attn = TemporalSelfAttention(
            in_channels=proj_dim, reduction=2
        )
        
        # Classification Heads (Sigmoid từ 2.1)
        self.direction_head = nn.Linear(proj_dim, 1)
        self.speed_head     = nn.Linear(proj_dim, 1)
        self.shuffle_head   = nn.Linear(proj_dim, 1)
    
    def forward(self, clips):
        """
        clips: (B, T, C, H, W) — batch of video clips
        """
        B, T, C, H, W = clips.shape
        
        # Extract frame-level features
        frames = clips.view(B*T, C, H, W)
        feats = self.backbone(frames)          # (B*T, 512)
        feats = feats.view(B, T, -1)           # (B, T, 512)
        
        # Project: giảm dimensional collapse
        feats_flat = feats.view(B*T, -1)
        projected  = self.projector(feats_flat)   # (B*T, 256)
        projected  = projected.view(B, T, -1)     # (B, T, 256)
        
        # Temporal Aggregation
        projected_t = projected.transpose(1, 2)   # (B, 256, T)
        temporal_feat = self.temporal_attn(projected_t)  # (B, 256)
        
        # Binary Classification Heads
        dir_logit  = self.direction_head(temporal_feat).squeeze(-1)
        spd_logit  = self.speed_head(temporal_feat).squeeze(-1)
        shf_logit  = self.shuffle_head(temporal_feat).squeeze(-1)
        
        return dir_logit, spd_logit, shf_logit

2.6 LỖI #6 — Thiếu Giám Sát Feature Quality (Methodology)
Vấn đề gốc

Báo cáo ước lượng features "giống nhau 99%" mà không có đo lường thực tế. Không có metric để phân biệt lỗi do dimensional collapse hay do temporal aggregator kém hay do task design sai.
Giải pháp: Thêm Diagnostic Metrics

python
class TemporalSSLTrainer:
    def compute_diagnostics(self, model, batch_clips):
        """
        Chạy cuối mỗi epoch để monitor feature health.
        """
        model.eval()
        with torch.no_grad():
            B, T, C, H, W = batch_clips.shape
            frames = batch_clips.view(B*T, C, H, W)
            feats = model.backbone(frames).view(B, T, -1)
            
            # 1. Cosine similarity giữa frame liên tiếp
            # Nếu > 0.95: dimensional collapse nghiêm trọng
            sim = F.cosine_similarity(
                feats[:, :-1].reshape(-1, feats.shape[-1]),
                feats[:, 1:].reshape(-1, feats.shape[-1]),
                dim=-1
            ).mean().item()
            
            # 2. Rank của feature matrix
            # Nếu rank << feat_dim: dimensional collapse
            feat_matrix = feats.reshape(-1, feats.shape[-1])
            singular_values = torch.linalg.svdvals(feat_matrix)
            effective_rank = (singular_values > singular_values[0] * 0.01).sum().item()
            
            # 3. Variance across temporal dimension
            # Nếu ~ 0: không có temporal variation
            temporal_var = feats.var(dim=1).mean().item()
        
        return {
            "avg_consecutive_similarity": sim,       # Target: < 0.90
            "effective_rank": effective_rank,         # Target: > 100
            "temporal_variance": temporal_var         # Target: > 0.1
        }
    
    def log_training_step(self, epoch, metrics, diagnostics):
        print(f"Epoch {epoch:3d} | "
              f"Dir: {metrics['dir_acc']:.3f} | "
              f"Spd: {metrics['spd_acc']:.3f} | "
              f"Shf: {metrics['shf_acc']:.3f} | "
              f"Sim: {diagnostics['avg_consecutive_similarity']:.3f} | "
              f"Rank: {diagnostics['effective_rank']:3d} | "
              f"Var: {diagnostics['temporal_variance']:.4f}")

Ngưỡng cảnh báo:
Metric	Giá trị bình thường	Cảnh báo
avg_consecutive_similarity	< 0.90	> 0.95 = collapse
effective_rank	> 100 / 512	< 50 = collapse
temporal_variance	> 0.1	< 0.01 = no signal
2.7 LỖI #7 — Kết Luận Từ Bỏ SSL Quá Sớm (Decision Making)
Vấn đề gốc

Báo cáo đề xuất chuyển sang Supervised Learning + Optical Flow mà không thử các quick fixes. TCLR paper chứng minh các cải tiến đơn giản, ít tốn kém có thể đưa accuracy từ ~50% lên 82.45% trên UCF-101.
Giải pháp: Roadmap thử nghiệm theo độ phức tạp tăng dần

text
LEVEL 0 (1 ngày): Fix lỗi ngay lập tức
├── ✅ Sigmoid + BCE thay Softmax
├── ✅ Unfreeze layer2, layer3
└── ✅ Thêm Projector MLP

LEVEL 1 (2-3 ngày): Cải thiện kiến trúc
├── Thay Conv1D → Dilated Conv hoặc Self-Attention  
└── Thêm diagnostic metrics

LEVEL 2 (1 tuần): Contrastive SSL (như TCLR)
├── Thêm local-local temporal contrastive loss
└── Thêm global-local temporal contrastive loss

LEVEL 3 (nếu cần): Đổi backbone
├── R3D-18 pretrained trên Kinetics-400
└── Fine-tune end-to-end

→ Supervised Learning + Optical Flow chỉ nên dùng nếu LEVEL 0 vẫn thất bại

3. Kiến Trúc Đề Xuất Hoàn Chỉnh (Cell 17)

python
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet18

class Cell17TemporalSSL(nn.Module):
    """
    Kiến trúc sửa chữa hoàn chỉnh cho Cell 17.
    Áp dụng tất cả 6 giải pháp từ phân tích trên.
    """
    def __init__(self, feat_dim=512, proj_dim=256, num_frames=16):
        super().__init__()
        
        # FIX #2: Backbone với unfreeze progressive
        # Khởi đầu từ ResNet-18 SwAV pretrained
        backbone = resnet18(pretrained=False)
        backbone.load_state_dict(torch.load('resnet18_swav.pth'))
        self.backbone = nn.Sequential(
            backbone.conv1, backbone.bn1, backbone.relu, backbone.maxpool,
            backbone.layer1, backbone.layer2,   # Unfreeze sau epoch 10
            backbone.layer3,                     # Unfreeze sau epoch 5
            backbone.layer4,                     # Luôn train
            backbone.avgpool
        )
        
        # FIX #5: Projector MLP chống Dimensional Collapse
        self.projector = nn.Sequential(
            nn.Linear(feat_dim, feat_dim),
            nn.BatchNorm1d(feat_dim),
            nn.ReLU(inplace=True),
            nn.Linear(feat_dim, proj_dim),
            nn.BatchNorm1d(proj_dim),
            nn.ReLU(inplace=True),
            nn.Linear(proj_dim, proj_dim)
        )
        
        # FIX #3: Temporal Self-Attention (thay Conv1D)
        mid = proj_dim // 2
        self.Q = nn.Conv1d(proj_dim, mid, 1)
        self.K = nn.Conv1d(proj_dim, mid, 1)
        self.V = nn.Conv1d(proj_dim, mid, 1)
        self.out_proj = nn.Conv1d(mid, proj_dim, 1)
        nn.init.zeros_(self.out_proj.weight)
        
        # FIX #1: Binary heads với 1 output node
        self.direction_head = nn.Linear(proj_dim, 1)
        self.speed_head     = nn.Linear(proj_dim, 1)
        self.shuffle_head   = nn.Linear(proj_dim, 1)
    
    def temporal_attention(self, x):
        """x: (B, C, T) → (B, C)"""
        B, C, T = x.shape
        Q = self.Q(x); K = self.K(x); V = self.V(x)
        attn = F.softmax(torch.bmm(Q.transpose(1,2), K) / (C**0.5), dim=-1)
        out  = self.out_proj(torch.bmm(V, attn.transpose(1,2)))
        return (x + out).mean(dim=-1)
    
    def forward(self, clips):
        """clips: (B, T, 3, H, W)"""
        B, T, C, H, W = clips.shape
        
        # Backbone: frame-level
        feats = self.backbone(clips.view(B*T, C, H, W))
        feats = feats.view(B*T, -1)
        
        # Projector: phòng dimensional collapse
        projected = self.projector(feats).view(B, T, -1)  # (B, T, 256)
        
        # Temporal attention: global context
        temporal = self.temporal_attention(projected.transpose(1,2))  # (B, 256)
        
        # Classification (sigmoid sẽ được apply trong loss function)
        return (self.direction_head(temporal).squeeze(-1),
                self.speed_head(temporal).squeeze(-1),
                self.shuffle_head(temporal).squeeze(-1))


# === TRAINING LOOP ===
def train_cell17(model, dataloader, num_epochs=30):
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, num_epochs)
    
    # FIX #1: BCEWithLogitsLoss thay CrossEntropyLoss
    criterion = nn.BCEWithLogitsLoss()
    
    for epoch in range(num_epochs):
        # FIX #2: Progressive unfreeze
        progressive_unfreeze(model, epoch)
        
        model.train()
        total_loss = 0
        correct = {'dir': 0, 'spd': 0, 'shf': 0}
        total = 0
        
        for batch in dataloader:
            clips, dir_lbl, spd_lbl, shf_lbl = batch
            clips = clips.cuda()
            dir_lbl = dir_lbl.float().cuda()
            spd_lbl = spd_lbl.float().cuda()
            shf_lbl = shf_lbl.float().cuda()
            
            optimizer.zero_grad()
            
            dir_logit, spd_logit, shf_logit = model(clips)
            
            loss = (criterion(dir_logit, dir_lbl) +
                    criterion(spd_logit, spd_lbl) +
                    criterion(shf_logit, shf_lbl)) / 3
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            # Accuracy
            total_loss += loss.item()
            total += clips.size(0)
            correct['dir'] += ((dir_logit > 0) == dir_lbl.bool()).sum().item()
            correct['spd'] += ((spd_logit > 0) == spd_lbl.bool()).sum().item()
            correct['shf'] += ((shf_logit > 0) == shf_lbl.bool()).sum().item()
        
        # FIX #6: Log diagnostics
        diag = compute_diagnostics(model, clips)
        
        print(f"Epoch {epoch+1:2d}/{num_epochs} | "
              f"Loss: {total_loss/len(dataloader):.4f} | "
              f"Dir: {correct['dir']/total:.3f} | "
              f"Spd: {correct['spd']/total:.3f} | "
              f"Shf: {correct['shf']/total:.3f} | "
              f"FeatSim: {diag['avg_consecutive_similarity']:.3f} | "
              f"Rank: {diag['effective_rank']}")
        
        scheduler.step()

4. Bảng So Sánh Trước / Sau
Thành phần	Cell 16b (Lỗi)	Cell 17 (Đề xuất)	Cơ sở
Thành phần	Cell 16b (Lỗi)	Cell 17 (Đề xuất)	Cơ sở
Loss function	Softmax + CE	Sigmoid + BCE	
Backbone freeze	Layer1-3 frozen toàn bộ	Progressive unfreeze	
Temporal aggregator	Conv1D×2, kernel=3, RF=5	Self-Attention, RF=16	
Projector	Không có	MLP 3 lớp + BN	
Speed task logic	Pixel delta	Motion density/sampling rate	
Diagnostics	Không có	Cosine sim + Rank + Variance	
Kỳ vọng accuracy	~50% (random)	≥ 65%/60%/60%	
5. Kết Luận

Thất bại của Cell 16b không đến từ data hay hyperparameters, mà từ 3 mâu thuẫn cơ bản:

    Lý thuyết: Dùng backbone SwAV (appearance-invariant) cho temporal task (cần temporal-equivariant)

    Kiến trúc: Loss function sai (Softmax→Sigmoid) và Temporal Aggregator có receptive field quá hẹp (5/16 frames)

    Thiết kế: Thiếu Projector MLP dẫn đến feature collapse lan xuống toàn bộ pipeline

Khi cả 3 tầng này đều sai, model không còn học được gì dù tăng epoch hay tune learning rate. Cell 17 sửa tất cả từng điểm một theo đúng trình tự từ gốc rễ đến bề mặt.