# Mô Tả Chi Tiết Thiết Kế Và Luồng Hoạt Động (Video Moderation V6.0)

Tài liệu này mô tả toàn bộ luồng hoạt động của dự án ở **Phiên bản V6.0**. Kiến trúc đã được tối ưu hóa toàn diện, tách biệt rõ ràng các chuyên gia (Experts) và áp dụng cơ chế điều hướng thông tin (Gated Routing) để giải quyết triệt để vấn đề "nhiễu chéo" của các phiên bản trước.

## 1. Tổng Quan Kiến Trúc V6.0

Hệ thống được thiết kế theo một **pipeline phân đoạn (staged pipeline)** và **chuyên gia độc lập**.

Có 4 nhóm chính:
1. **Spatial Backbone (SwAV ResNet18 Frozen):** Xương sống đóng băng chuyên giải nén đặc trưng hình ảnh.
2. **Independent Expert Heads:** Các mô hình nhỏ gọn được huấn luyện chuyên biệt trên đỉnh SwAV (Gore, NSFW, YOLO Weapon).
3. **Temporal Saliency Extraction:** Chia video thành các Shots liền mạch (TransNet V2) và gom nhóm các đặc trưng.
4. **Task-Gated Cross-Attention Model:** Trái tim của V6.0, định tuyến các đặc trưng về đúng luồng (V, S, N) trước khi đưa ra dự đoán cuối cùng.

## 2. Luồng Xử Lý Suy Luận Tổng Thể (End-to-End Inference Flow)

Quá trình video đi vào hệ thống được hình dung theo các bước sau:

```text
Raw Video
  (1) Trích xuất Shot Boundary (TransNet V2)
  (2) Lấy mẫu khung hình (16 frames / shot)
  (3) Trích xuất Đặc Trưng Đồng Thời (Feature Extraction)
      ├── CLIP ViT-B/32 ──────> [T, 768] (Ngữ nghĩa tổng quát)
      ├── Optical Flow  ──────> [T, 3]   (Chuyển động)
      ├── YOLOv8 Weapon ──────> [T, 1]   (Súng / Dao)
      ├── Gore Detector ──────> [T, 1]   (Máu / Tổn thương)
      └── NSFW Scorer   ──────> [T, 1]   (Nhạy cảm)
  (4) Gộp Feature Vector (774-dim)
  (5) Task-Gated Cross-Attention (Phân luồng độc lập)
      ├── V-Gate <── CLIP + Flow + YOLO + Gore
      ├── S-Gate <── CLIP + Flow + Gore
      └── N-Gate <── CLIP + NSFW
  (6) Multi-label Output (Violence, Self-harm, NSFW)
```

## 3. Kiến Trúc Chi Tiết Các Chuyên Gia (Independent Experts)

V6.0 loại bỏ sự phụ thuộc vào các mạng backbone khổng lồ dư thừa. Thay vào đó, tận dụng lại trọng số `ssl_spatial_best.pth` (SwAV ResNet18) đã học tự giám sát.

- **Gore Detector:** `SwAV Frozen Backbone` + `Linear Head (512 -> 256 -> 1)`. Chuyên trị các frame chứa máu, bạo lực thể xác.
- **NSFW Classifier:** Giống kiến trúc Gore nhưng trọng số Head được khởi tạo và huấn luyện **hoàn toàn độc lập** với tập dữ liệu NSFW_v1. (Thay thế EfficientNet-B0 của V5.2).
- **YOLOv8 Weapon:** Tinh chỉnh từ YOLOv8n, gộp chung Gun và Knife thành class_id = 0 duy nhất. Bỏ đi các lớp y tế/công cụ để tránh nhiễu.

## 4. Module Cốt Lõi: Task-Gated Two-Way Cross-Attention

Đây là thiết kế cốt lõi làm nên sự vượt trội của V6 so với V5.2 (Shared Feature Pool). Thay vì nhồi tất cả các aux features vào một vector 6 chiều rồi trộn chung với CLIP, hệ thống xây dựng 3 "cửa trạm" (Gates) tách biệt hoàn toàn.

### Kiến trúc bên trong 1 Gate (Lấy cảm hứng từ SAM Decoder):
Mỗi Gate sẽ có 1 Task Token riêng biệt ($T_V, T_S, T_N$).
- **Bước 1 (Token queries Frame):** Task token dùng Attention để hỏi toàn bộ các frame xem: "Frame nào chứa thông tin quan trọng cho tao?". Bước này tạo ra **Saliency Map** (bản đồ tập trung).
- **Bước 2 (Frame queries Token):** Frame sử dụng thông tin cập nhật từ Token để hiệu chỉnh lại chính nó.

### Sự Cách Ly Vật Lý (Isolation Mechanism):
Điều thần kỳ nằm ở chỗ dữ liệu cấp vào các Gate bị giới hạn:
- **`N-Gate` (Nhạy cảm)** CHỈ được nhìn thấy `[CLIP(768) + NSFW(1)]`. Do đó, cho dù video có súng đạn hay dao (YOLO kích hoạt), Token của NSFW vẫn "mù" trước thông tin này và sẽ không bao giờ phát sinh Cảnh báo Nhạy cảm sai lệch. Lỗi "Nhiễu chéo" của V5.2 bị tiêu diệt hoàn toàn ở mức độ mạng Nơ-ron.

## 5. Cải Tiến Hàm Mất Mát (Loss Function)

Quá trình huấn luyện mô hình đa nhiệm cuối cùng (TaskGatedModelV6) dùng hàm mục tiêu kép:
1. **Weighted BCE Loss:** Tính toán trọng số `pos_weight` động bù đắp sự mất cân bằng dữ liệu (VD: Lớp Self-harm rất hiếm nên pos_weight được cấu hình lên tới 150.0).
2. **Entropy Regularization (λ=0.1):** Phạt hệ thống nếu Saliency Map của nó bị dàn trải (phẳng lì) ra toàn bộ 64 frames. Điều này ép mô hình phải chắt lọc, tập trung cao độ vào những frame vi phạm thực sự chớp nhoáng (nhờ sự hỗ trợ từ TransNet V2).

## 6. Kết Luận Nhanh Về V6.0
Nếu dùng một câu để hình dung V6.0 so với V5.2: 
**"Từ một nồi lẩu thập cẩm (Shared Pool), dự án đã chuyển hóa thành một nhà máy với dây chuyền phân loại nghiêm ngặt và chuyên gia độc lập."** Hệ thống nhẹ hơn, hội tụ nhanh hơn, suy luận mạnh mẽ hơn trên RTX 4050 6GB và diệt trừ hoàn toàn nhiễu chéo đa nhiệm.
