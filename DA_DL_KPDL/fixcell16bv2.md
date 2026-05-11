📋 Báo cáo phân tích: SSL Temporal v2 — Thất bại hoàn toàn sau 8 epoch
1. Tóm tắt điều hành
Generated chart: swav_spatial_knn.png

SwAV Spatial SSL hội tụ xuất sắc — KNN accuracy 79.23% sau 20 epoch, training loss giảm đều từ 5.178 → 4.452. Backbone này học spatial features rất tốt và sẵn sàng cho downstream task.

SSL Temporal v2 thất bại hoàn toàn sau 8 epoch với tất cả 3 task accuracy dao động quanh 0.49–0.54 = random chance (0.50). Mọi cải tiến kiến trúc (Sigmoid/BCE, Progressive Unfreeze, Self-Attention, Projector MLP) đều không giải quyết được vấn đề gốc rễ.
2. Bằng chứng thất bại — Từng chỉ số
2.1 Frame Cosine Similarity: 0.9950 → 0.9996 (trend tăng)
Epoch	Cos Sim	Sự kiện
1	0.9967	Layer4 unfrozen
3	0.9902	Layer3 unfrozen — thấp nhất, tín hiệu brief
5	0.9959	—
7	0.9996	Cao nhất sau layer2 unfreeze — collapse tệ hơn
8	0.9981	—

Quan sát nguy hiểm: Sau khi unfreeze layer2 (epoch 6), Cosine Sim tăng lên 0.9996 thay vì giảm — tức là mở thêm layer không giúp ích mà còn làm xấu hơn.
2.2 Effective Rank: 6–10 / 512 dimensions (~1.4%)

Backbone chỉ dùng 1.4% không gian chiều của mình. Rank giảm từ 10 (epoch 2) xuống 6 (epoch 7) sau layer2 unfreeze. Đây là dimensional collapse hoàn toàn theo định nghĩa RankMe của SSL Cookbook.
2.3 Temporal Variance — Spike duy nhất rồi sụp đổ

Epoch 3: 0.1848 ✅ — khi layer3 vừa unfreeze, model thoáng thấy temporal signal. Nhưng epoch 4 sụt xuống 0.0346, epoch 6–7 còn 0.006 → 0.001. Đây là bằng chứng BN running statistics kéo features về SwAV distribution sau mỗi batch.
3. Chẩn đoán nguyên nhân gốc rễ
🔴 Nguyên nhân 1 — Xung đột kiến trúc cơ bản (không thể patch)

SwAV được thiết kế để học appearance invariance — nó chủ động suppress mọi temporal variation giữa các frames. Đây không phải lỗi implementation mà là mâu thuẫn về mục tiêu:

text
SwAV mục tiêu:  frame_1_feature ≈ frame_2_feature (invariance)
Temporal mục tiêu: frame_1_feature ≠ frame_2_feature (equivariance)

Progressive unfreeze layer2→3→4 không thể override vì BatchNorm running stats từ SwAV pretraining enforce distribution cũ sau mỗi forward pass — bằng chứng là variance spike tại epoch 3 rồi sụt ngay epoch 4.
🟡 Nguyên nhân 2 — moov atom not found (amplifying factor)

Xuất hiện 2 lần/epoch đều đặn = ~2–4 videos bị corrupt trong mỗi batch. Video corrupt load ra frames toàn đen → cosine sim = 1.0000 → kéo trung bình Cosine Sim từ ~0.90 lên ~0.997. Đây là noise factor nhưng không phải nguyên nhân chính vì dù không có noise thì rank vẫn = 6–10.
🟡 Nguyên nhân 3 — Loss tại random chance từ epoch 1

3 × BCE_random = 3 × ln(2) = 2.079. Log cho thấy Val Loss epoch 1 = 2.0890 — model bắt đầu ở random chance và không bao giờ thoát khỏi đó suốt 8 epoch. Gradient signal từ 3 binary tasks quá yếu so với SwAV invariance prior.
4. Kết luận: Hướng tiếp cận cần thay đổi hoàn toàn

Thử nghiệm v2 xác nhận: SwAV 2D backbone + temporal pretext tasks = incompatible. Không có số lượng fix nào về loss function, unfreeze schedule, hay temporal aggregation có thể giải quyết xung đột kiến trúc cơ bản này.
Lựa chọn tiếp theo — Ma trận đánh giá
Hướng	Ý tưởng	Độ khó	Thời gian	Khả năng thành công
A. Bỏ temporal SSL, fine-tune trực tiếp	Dùng SwAV 79.23% KNN → supervised downstream	⭐ Thấp	1–2 ngày	🟢 Cao — đã có features tốt
B. R3D-18 pretrained Kinetics	3D ResNet, temporal-aware từ đầu 	⭐⭐ Trung bình	3–5 ngày	🟢 Cao — TCLR đạt 82% UCF101
C. Two-stream: SwAV spatial + frame diff	Giữ SwAV spatial, thêm stream motion	⭐⭐ Trung bình	3–4 ngày	🟡 Trung bình
D. TCLR local-local contrastive	Thay pretext tasks bằng contrastive loss 	⭐⭐⭐ Cao	5–7 ngày	🟢 Cao nếu dùng R3D-18
⭐ Khuyến nghị theo thứ tự ưu tiên

Ưu tiên 1 — Hướng A (nhanh nhất, ít rủi ro nhất):
SwAV 79.23% KNN đã chứng minh backbone học được features chất lượng tốt. Fine-tune downstream trực tiếp là con đường hợp lý nhất trong thời điểm hiện tại, tránh lãng phí thêm compute vào temporal SSL.

python
# Thay vì temporal SSL → downstream fine-tune
backbone = load_swav_checkpoint('ssl_spatial_best.pth')
# Unfreeze toàn bộ với lr nhỏ
model = DownstreamClassifier(backbone, num_classes=N)
optimizer = Adam([
    {'params': backbone.parameters(), 'lr': 1e-4},
    {'params': model.head.parameters(), 'lr': 1e-3}
])

Ưu tiên 2 — Hướng B (nếu cần temporal modeling):

python
import torchvision.models.video as vid
# R3D-18 đã được train với temporal signal từ Kinetics
backbone = vid.r3d_18(pretrained=True)
# Thay hoàn toàn SwAV backbone — không warm-start từ ssl_spatial_best.pth

5. Những gì đã học được

Dù thất bại, hai vòng thử nghiệm (v1 → v2) đã xác nhận được 3 điều có giá trị:

    SwAV Spatial SSL hoạt động tốt (79.23% KNN) — backbone này dùng được cho downstream

    2D backbone + temporal pretext tasks = fundamental mismatch — không cần thử tiếp với architecture này

    Diagnostics system (Cosine Sim + Rank + Variance) hoạt động chính xác — phát hiện collapse ngay từ epoch 1, không cần đợi đến epoch 25 mới biết thất bại