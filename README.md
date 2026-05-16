# Hệ Thống Kiểm Duyệt Đa Phương Tiện (Content Moderation Pipeline)

Dự án này cung cấp một hệ thống kiểm duyệt nội dung tự động đa phương tiện (Ảnh tĩnh và Video) chuyên sâu, tập trung vào ba tác vụ chính: **Bạo lực (Violence), Nhạy cảm (NSFW), và Tự hại (Self-harm)**. 

Hệ thống được thiết kế theo kiến trúc **Đa tầng (Staged Pipeline)** với sự tham gia của nhiều mô hình chuyên gia, kết hợp giữa mô hình phân loại ảnh (ViT), mô hình hiểu chuỗi thời gian (VideoMAE) và các trạm gác cổng tối ưu hóa hiệu năng, giúp hệ thống hoạt động chính xác và tiết kiệm tài nguyên.

---

## 🏗 Kiến Trúc Hệ Thống (Pipeline Architecture)

Hệ thống xử lý phân tách riêng biệt hai loại nội dung: **Hình ảnh** và **Video**.

### 1. Phân Hệ Kiểm Duyệt Hình Ảnh Tĩnh (Image Pipeline)
Xử lý theo lô (batch_size=8) bằng kiến trúc **ViT (Vision Transformer)** tiêu chuẩn.
- **Bạo lực (Violence):** Sử dụng `jaranohaal/vit-base-violence-detection` (ViT-B/16).
- **Nhạy cảm (NSFW):** Sử dụng mô hình `AdamCodd/vit-base-nsfw-detector` để phân tích. (Mô hình trả về điểm số nhị phân SFW/NSFW, với nhiều ngưỡng threshold khác nhau để phân biệt nội dung "sexy" và "nude").
- **Phát triển tương lai (NudeNet):** Repo đã tích hợp thêm khả năng kiểm duyệt bằng Object Detection thông qua `NudeNet`, cho phép nhận diện và vẽ Bounding Box chính xác từng bộ phận nhạy cảm (Exposed vs Covered) thay vì chấm điểm toàn ảnh.

### 2. Phân Hệ Kiểm Duyệt Video (Video Pipeline - V7)
Đây là hệ thống xương sống cốt lõi, không phân tích hình ảnh tĩnh mà đánh giá video như một dòng chảy thời gian (Temporal Dynamics) với kiến trúc **Video-Native Backbone**.

Luồng đi của video:
1. **Trạm gác cổng (Proxy Gate):** Một mạng nhẹ (EfficientNet-B0) lấy mẫu ngẫu nhiên 8 frames. Nếu cảnh hoàn toàn an toàn (phong cảnh, người đi bộ...), luồng sẽ dừng lại ngay lập tức. Nếu nghi ngờ, video đi tiếp vào lớp sâu.
2. **Khung VideoMAE (Video-Native Backbone):** Lấy mẫu 16 khung hình đại diện và đưa vào mạng `VideoMAE (Video Masked Autoencoders)` đã được tinh chỉnh (fine-tuned) bằng **LoRA**. Mô hình này học được gia tốc, luồng chuyển động thay vì chỉ nhìn bề mặt pixel.
3. **Cổng Lai Ghép Tín Hiệu (Sigmoid Residual Fusion Gate):** Kết hợp Video Embedding (từ VideoMAE) với các Tín hiệu chuyên gia phụ trợ (`aux_summary` - gồm Gore, NSFW scorer, Optical Flow). Cổng này có nhiệm vụ quyết định mức độ tin tưởng vào các thông tin phụ trợ để ngăn chặn mô hình bị "dắt mũi" bởi các shortcut sai lệch.
4. **Mạng Quan Tòa Ngữ Cảnh (CLIP Sport Activity Context):** Xử lý điểm yếu chí mạng của VideoMAE (hay nhầm lẫn video thể thao đối kháng thành bạo lực). Hệ thống bóc tách các khung hình căng thẳng nhất đưa cho CLIP Zero-shot đánh giá (Sport vs Violence). Nếu là thể thao, điểm số bạo lực lập tức bị dập tắt (Suppress Factor).
5. **3 Đầu Ra Độc Lập (Heads):** Cho ra điểm số cuối cùng của V_Head (Violence) và N_Head (NSFW) (được train bằng Pseudo-labels - Weak Distillation).

### 3. Tích Hợp Server (AI Worker)
- File `colab_worker.py` liên tục (poll mỗi 5s) lấy dữ liệu từ Firebase.
- Nhận diện, đẩy qua luồng xử lý và trả về 3 mức độ (Level 0: Safe, Level 1: Blur - Làm mờ, Level 2: Ban - Cấm/Ẩn).

---

## 🚀 Khởi Chạy Và Sử Dụng

### Yêu Cầu Môi Trường
- Python 3.10+
- PyTorch (CUDA hỗ trợ)
- Các thư viện cần thiết trong `requirements-kaggle.txt`

### Cài Đặt
```bash
# Cài đặt môi trường
pip install -r requirements-kaggle.txt

# (Tuỳ chọn) Cài đặt NudeNet để sử dụng Object Detection cho luồng NSFW
pip install nudenet opencv-python gradio
```

### Cách Khởi Chạy
**1. Chạy AI Worker (Xử lý hàng đợi Firebase):**
```bash
python colab_worker.py
```

**2. Demo UI Trình Duyệt cho NudeNet:**
```bash
python gradio_nudenet.py
# Truy cập http://127.0.0.1:7860 để trải nghiệm tính năng khoanh vùng vùng kín.
```

**3. Khởi chạy luồng suy luận Video (Offline test):**
```bash
python run_app_cpu.py # Hoặc test_full_pipeline.py
```

---

## 📁 Cấu Trúc Thư Mục Chính
- `/src/models/`: Chứa định nghĩa kiến trúc mô hình (VideoMAE LoRA, Fusion Gate, Gated Attention, v.v.).
- `/scripts/`: Các script phục vụ fine-tune, huấn luyện và đánh giá (Evaluate) qua từng phiên bản V6, V7.
- `/configs/`: Tham số YAML của pipeline.
- `app.py`: Định nghĩa Interface Inference tổng để các Worker gọi tới.
- `colab_worker.py`: Xử lý giao tiếp thời gian thực với Firebase.
- `activity_context.py`: Lớp bảo vệ (CLIP) giúp xử lý các cú lừa False Positive của các môn thể thao.
- `gradio_nudenet.py` / `demo_nudenet_visual.py`: Các file demo công cụ NSFW Object Detection bằng NudeNet.
