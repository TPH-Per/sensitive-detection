# 🛡️ Sensitive Content Detection

Hệ thống phát hiện nội dung nhạy cảm (Violence + NSFW) trong ảnh và video sử dụng AI.

## 📌 Tổng quan

Hệ thống sử dụng **2 model ViT (Vision Transformer)** chạy trên Google Colab GPU để phân tích nội dung:

| Model | Task | HuggingFace |
|-------|------|-------------|
| Violence Detection | Phát hiện bạo lực | `jaranohaal/vit-base-violence-detection` |
| NSFW Detection | Phát hiện nội dung khỏa thân | `AdamCodd/vit-base-nsfw-detector` |

**Kiến trúc tổng quan:**

```
Client (GUI HTML) → Ngrok Tunnel → FastAPI Server (Colab GPU)
                                        ├── ViT Violence
                                        └── ViT NSFW
```

## 🚀 Hướng dẫn Demo

### Yêu cầu

- Tài khoản [Google Colab](https://colab.research.google.com/) (miễn phí, có GPU)
- Tài khoản [Ngrok](https://ngrok.com/) (miễn phí) — để tạo public URL cho API

### Bước 1: Chuẩn bị Ngrok Token

1. Đăng ký tại [ngrok.com](https://dashboard.ngrok.com/signup)
2. Vào [Dashboard → Your Authtoken](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Copy token

### Bước 2: Chạy Notebook trên Colab

1. Upload file `detect.ipynb` lên Google Colab
   - Truy cập [colab.research.google.com](https://colab.research.google.com/)
   - **File → Upload notebook** → chọn file `detect.ipynb`

2. Bật GPU
   - **Runtime → Change runtime type → T4 GPU → Save**

3. Chạy tuần tự từng cell:

   | Cell | Mô tả | Thời gian |
   |------|--------|-----------|
   | Cell 1 | Kiểm tra GPU | ~2s |
   | Cell 2 | Cài thư viện | ~30s |
   | Cell 3 | Load 2 models từ HuggingFace | ~1-2 phút |
   | Cell 4 | Khai báo hàm xử lý | ~1s |
   | Cell 5 | Test ảnh mẫu | ~5s |
   | Cell 5b | Test video mẫu | ~30s |
   | Cell 6 | Chạy FastAPI server | ~2s |
   | Cell 7 | **Ngrok tunnel** — paste token vào đây | ~3s |
   | Cell 8 | Test API | ~5s |

4. **Quan trọng** — Ở Cell 7, thay `PASTE_TOKEN_CUA_BAN` bằng ngrok token của bạn:
   ```python
   NGROK_TOKEN = "your_ngrok_token_here"
   ```

5. Sau khi Cell 7 chạy xong, sẽ hiện URL dạng:
   ```
   🌐 API: https://xxxx-xxxx.ngrok-free.dev
   ```
   Copy URL này.

### Bước 3: Mở GUI Test

1. Mở file `gui_test.html` bằng trình duyệt (Chrome/Edge/Firefox)
2. Paste URL API vào ô input → nhấn **Kết nối**
3. Khi hiện **● Online** → sẵn sàng test

### Bước 4: Test

**Test ảnh:**
1. Chọn tab **Image Scan**
2. Upload ảnh (JPG, PNG, WEBP)
3. Nhấn **Quét ảnh**
4. Xem kết quả: AN TOÀN / NHẠY CẢM + điểm score

**Test video:**
1. Chọn tab **Video Scan**
2. Upload video (MP4, AVI, MOV, MKV, WebM — mọi codec)
3. Nhấn **Quét video** (mất 1-3 phút tùy độ dài)
4. Xem kết quả: số frames phân tích, tỷ lệ violence/nsfw

## 📁 Cấu trúc project

```
├── detect.ipynb          # Notebook chính — chạy trên Google Colab
├── gui_test.html         # Giao diện test — mở trên trình duyệt
├── tai_lieu_mo_hinh.md   # Tài liệu chi tiết về models
└── README.md             # Hướng dẫn này
```

## ⚙️ API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| GET | `/health` | Kiểm tra trạng thái server |
| POST | `/moderate/image` | Upload ảnh để kiểm duyệt |
| POST | `/moderate/video` | Upload video để kiểm duyệt |
| GET | `/docs` | Swagger UI — API documentation |

### Ví dụ Response — Image

```json
{
  "is_sensitive": false,
  "categories": [],
  "violence": { "is_violence": false, "score": 0.0523 },
  "nsfw": { "is_nsfw": false, "score": 0.0112, "all_scores": { "nsfw": 0.0112, "normal": 0.9888 } }
}
```

### Ví dụ Response — Video

```json
{
  "is_sensitive": true,
  "categories": ["violence"],
  "details": {
    "total_frames": 300,
    "sampled_frames": 10,
    "fps": 30.0,
    "duration": 10.0,
    "codec": "h264",
    "resolution": "1920x1080",
    "violence": { "sensitive_count": 3, "ratio": 0.3, "detected": true },
    "nsfw": { "sensitive_count": 0, "ratio": 0.0, "detected": false }
  }
}
```

## 🔧 Tech Stack

- **Models**: Vision Transformer (ViT-Base/16) — HuggingFace
- **Backend**: FastAPI + Uvicorn (Python)
- **GPU**: Google Colab T4 (CUDA)
- **Video Processing**: ffmpeg + ffprobe
- **Tunnel**: Ngrok
- **Frontend**: HTML + Vanilla JS + CSS
