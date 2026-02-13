# Tài liệu Mô hình — Content Moderation System

---

## Tại sao tách thành 2 model riêng?

Khi nói "nội dung nhạy cảm", thực chất nó bao gồm 2 loại hoàn toàn khác nhau: **khỏa thân (NSFW)** và **bạo lực (Violence)**. Hai loại này khác nhau về bản chất thị giác.

- Với **NSFW**, model cần nhận diện những đặc trưng như màu da, hình dạng bộ phận cơ thể, tư thế của người trong ảnh. Đây là những đặc trưng thiên về **vật thể cụ thể** — có thể chỉ ra được "cái này ở đây, cái kia ở kia" trên bức ảnh.

- Với **Violence**, model cần nhận diện những thứ trừu tượng hơn: hành động đánh đá, biểu cảm đau đớn, bối cảnh hỗn loạn, máu me. Đây là những đặc trưng thiên về **hành động và ngữ cảnh** — không thể vẽ một cái hộp quanh "hành vi bạo lực" được, mà phải nhìn tổng thể cả bức ảnh mới phán đoán được.

Vì bản chất 2 loại khác nhau như vậy, nếu ép 1 model làm cả 2 việc, model đó phải học đồng thời 2 bộ features rất khác nhau. Kết quả là nó sẽ không giỏi việc nào cả. Tách thành 2 model riêng biệt, mỗi model chuyên 1 nhiệm vụ, cho độ chính xác cao hơn đáng kể.

---

## Tại sao cả 2 model đều dùng ViT (Vision Transformer)?

Cả Violence và NSFW đều được giải quyết bằng bài toán **Image Classification** (phân loại ảnh) — tức model nhìn toàn bộ bức ảnh và trả lời "ảnh này thuộc loại gì?". Không cần xác định vị trí cụ thể trên ảnh (bounding box), chỉ cần kết luận Yes/No.

### Tại sao Transformer chứ không phải CNN?

Điểm khác biệt cốt lõi nằm ở cách model "nhìn" bức ảnh.

**CNN (như ResNet, VGG)** nhìn ảnh theo kiểu **từ cục bộ mở rộng dần**. Layer đầu tiên chỉ nhìn vùng 3×3 pixels, layer tiếp theo nhìn vùng 5×5, rồi 7×7, cứ thế mở rộng dần qua nhiều layers. Nghĩa là nếu Người A ở góc trái ảnh và Người B ở góc phải ảnh, CNN phải đi qua rất nhiều layers mới "thấy" được cả 2 người cùng lúc để hiểu rằng họ đang tương tác với nhau. Thông tin về mối quan hệ giữa 2 vùng xa nhau trong ảnh có thể bị mất hoặc yếu đi qua nhiều layers.

**Transformer (ViT)** nhìn ảnh theo kiểu **toàn cảnh ngay từ đầu**. Cơ chế Self-Attention cho phép mọi vùng trong ảnh "nhìn thấy" mọi vùng khác ngay từ layer đầu tiên. Patch chứa Người A ở góc trái ngay lập tức "kết nối" với patch chứa Người B ở góc phải. Model hiểu được ngay rằng "2 người này đang tương tác" và từ đó phán đoán "tương tác này là bạo lực" — tất cả chỉ trong vài layers.

Đặc tính **global context** này của Transformer không chỉ phù hợp cho Violence (nhận diện hành động tổng thể) mà còn phù hợp cho NSFW (nhận diện ngữ cảnh tổng thể của bức ảnh — tư thế, bối cảnh, sự kết hợp giữa các vùng cơ thể). Vì vậy cả 2 model đều sử dụng kiến trúc ViT.

### ViT hoạt động như thế nào?

ViT (Vision Transformer) xử lý ảnh qua các bước:

1. **Chia ảnh thành patches**: Ảnh 224×224 được chia thành grid 14×14 = **196 patches**, mỗi patch 16×16 pixels.
2. **Embedding**: Mỗi patch được flatten và chiếu qua linear projection thành 1 vector 768 chiều (embedding).
3. **Thêm [CLS] token**: Thêm 1 token đặc biệt ở đầu sequence, token này sẽ tích lũy thông tin tổng thể của ảnh.
4. **Position Embedding**: Thêm thông tin vị trí cho mỗi patch (patch ở góc trên trái khác patch ở giữa).
5. **Transformer Encoder**: 12 layers, mỗi layer gồm Multi-Head Self-Attention + Feed-Forward Network. Qua mỗi layer, các patches "giao tiếp" với nhau, trao đổi thông tin.
6. **Classification Head**: Lấy output của [CLS] token → qua 1 linear layer → softmax → xác suất cho từng class.

---

## Model 1: ViT Violence Detection

| Thông tin | Chi tiết |
|-----------|----------|
| HuggingFace | `jaranohaal/vit-base-violence-detection` |
| Base model | `google/vit-base-patch16-224-in21k` |
| Kiến trúc | Vision Transformer (ViT-Base/16) |
| Task | Image Classification (violence / non-violence) |
| Output | 2 classes: `0 = non-violence`, `1 = violence` |
| Training data | Real Life Violence Situations Dataset (Kaggle) |
| Test accuracy | 98.8% |
| Model size | ~330MB |

### Bản chất bài toán Violence

Bạo lực là **hành động**, không phải vật thể. Khi nhìn một bức ảnh 2 người đánh nhau, không thể chỉ tay vào 1 vùng cụ thể trên ảnh và nói "bạo lực nằm ở đây". Phải nhìn tổng thể: người A đang giơ nắm đấm, người B đang né, biểu cảm 2 người đều căng thẳng, xung quanh có thể hỗn loạn — tất cả kết hợp lại mới kết luận được "đây là bạo lực".

Vì vậy, bài toán violence chỉ cần trả lời **1 câu hỏi đơn giản**: "Bức ảnh này có bạo lực hay không?" — tức là bài toán **Image Classification**, không cần biết bạo lực ở vị trí nào trong ảnh.

ViT với cơ chế Self-Attention nhìn được **global context** ngay từ layer đầu tiên, rất phù hợp cho việc nhận diện hành động tổng thể như bạo lực.

---

## Model 2: ViT NSFW Detection (AdamCodd)

| Thông tin | Chi tiết |
|-----------|----------|
| HuggingFace | `AdamCodd/vit-base-nsfw-detector` |
| Base model | `google/vit-base-patch16-224-in21k` |
| Kiến trúc | Vision Transformer (ViT-Base/16) |
| Task | Image Classification (nsfw / sfw) |
| Output | 2 classes: `0 = nsfw`, `1 = normal` |
| Model size | ~330MB |
| Precision | ~97% trên benchmark |

### Bản chất bài toán NSFW

Mặc dù NSFW liên quan đến vật thể cụ thể (body parts), trong hệ thống này ta sử dụng **Image Classification** thay vì Object Detection. Lý do:

1. **Mục đích cuối cùng chỉ là Yes/No**: Hệ thống chỉ cần trả lời "ảnh này có nhạy cảm không?", không cần vẽ bounding box chỉ ra vùng nào vi phạm. Dùng Classification đơn giản hơn và nhanh hơn.

2. **ViT hiểu ngữ cảnh tổng thể**: Không phải cứ thấy da thịt là NSFW. Ảnh bãi biển người mặc đồ bơi ≠ NSFW. Ảnh tranh vẽ nude nghệ thuật ≠ NSFW (tùy ngữ cảnh). ViT nhìn được toàn bộ bức ảnh — bối cảnh, tư thế, mức độ — để đưa ra phán đoán chính xác hơn.

3. **AdamCodd/vit-base-nsfw-detector đã được fine-tune sẵn** trên dữ liệu NSFW lớn với độ chính xác cao (~97%), không cần tự collect data và train từ đầu.

4. **Tốc độ inference nhanh**: Classification chỉ trả về 1 con số score, nhanh hơn nhiều so với Object Detection phải quét toàn bộ ảnh tìm vùng vi phạm.

### Tại sao không dùng NudeNet?

NudeNet là model **Object Detection** (Faster R-CNN + ResNet-50), chuyên detect và **định vị** body parts trên ảnh (vẽ bounding box). NudeNet mạnh hơn ở việc chỉ ra **chính xác vùng nào** vi phạm, nhưng:

- Nặng hơn về computation (~40ms vs ~15ms cho ViT classification)
- Hệ thống chỉ cần Yes/No, không cần bounding box
- ViT classification đủ chính xác cho nhu cầu này

→ Chọn ViT classification cho cả 2 task vì **đơn giản, nhanh, đủ chính xác**, và thống nhất kiến trúc.

---

## Tiền xử lý Input cho từng model

### ViT Violence — Tiền xử lý

Sử dụng `torchvision.transforms` thủ công:

**Bước 1 — Đọc ảnh**: Đọc file ảnh, convert sang RGB.

**Bước 2 — Resize cố định 224×224**: ViT yêu cầu input chính xác 224×224 pixels. Lý do: ViT chia ảnh thành grid 14×14 patches (mỗi patch 16×16 pixels), nên ảnh phải đúng kích thước 224 = 14 × 16. Ảnh sẽ bị kéo giãn/co lại cho vừa, nhưng không ảnh hưởng accuracy vì model đã được train với cách resize này.

**Bước 3 — ToTensor**: Chuyển ảnh PIL sang PyTorch tensor, giá trị pixel tự động chuyển từ [0, 255] về [0, 1].

**Bước 4 — Normalize**: Chuẩn hóa với `mean=[0.5, 0.5, 0.5]` và `std=[0.5, 0.5, 0.5]`. Công thức: `pixel = (pixel - 0.5) / 0.5`, đưa giá trị pixel từ [0, 1] về khoảng **[-1, 1]**. Mỗi model có chuẩn hóa riêng vì chúng được train khác nhau.

**Bước 5 — Unsqueeze batch**: Thêm dimension batch (từ shape `[3, 224, 224]` thành `[1, 3, 224, 224]`) vì model luôn nhận input theo batch.

```python
violence_transform = transforms.Compose([
    transforms.Resize((224, 224)),       # Bước 2
    transforms.ToTensor(),               # Bước 3
    transforms.Normalize(                # Bước 4
        mean=[0.5, 0.5, 0.5],
        std=[0.5, 0.5, 0.5]
    )
])

# Sử dụng:
input_tensor = violence_transform(image).unsqueeze(0).to(device)  # Bước 5
```

### ViT NSFW — Tiền xử lý

Sử dụng `ViTImageProcessor` từ HuggingFace (đóng gói toàn bộ tiền xử lý):

**Bước 1 — Đọc ảnh**: Đọc file ảnh, convert sang RGB.

**Bước 2 — Resize + Center Crop 224×224**: `ViTImageProcessor` tự động resize ảnh về 224×224, có thể kết hợp center crop để giữ tỷ lệ tốt hơn.

**Bước 3 — Normalize**: Chuẩn hóa theo thống kê ImageNet: `mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`. Khác với Violence model dùng `[0.5, 0.5, 0.5]` — vì AdamCodd model được fine-tune từ ViT pre-trained trên ImageNet, nên dùng chuẩn hóa ImageNet.

**Bước 4 — Tensor + Batch**: Convert sang tensor, tự thêm batch dimension.

```python
nsfw_processor = ViTImageProcessor.from_pretrained("AdamCodd/vit-base-nsfw-detector")

# Sử dụng — tất cả tiền xử lý được thực hiện tự động:
inputs = nsfw_processor(images=image, return_tensors="pt")
inputs = {k: v.to(device) for k, v in inputs.items()}
```

> **Lưu ý**: Tuy cả 2 đều là ViT-Base/16 cùng kiến trúc, nhưng chuẩn hóa khác nhau (Violence: `[-1, 1]`, NSFW: ImageNet stats). Nếu dùng sai chuẩn hóa, accuracy sẽ giảm đáng kể vì model nhận input khác hoàn toàn so với lúc training.

---

## Tối ưu Pipeline — Bỏ qua model thứ 2 nếu đã phát hiện

Nếu ảnh đã bị gắn nhãn nhạy cảm bởi model đầu tiên, không cần chạy model thứ 2 nữa. Vì mục đích cuối cùng chỉ là xác định "ảnh này có nhạy cảm hay không" — chỉ cần 1 trong 2 model nói "có" là đủ kết luận.

### Với ảnh đơn (Image)

**Thứ tự chạy: ViT Violence trước → ViT NSFW sau.**

Cả 2 đều là ViT classification nên tốc độ tương đương (~15ms mỗi model). Tuy nhiên, chạy Violence trước vì:

- Violence thường có tính chất **khẩn cấp hơn** NSFW (liên quan đến an toàn người dùng)
- Nếu ảnh có bạo lực → skip NSFW luôn, tiết kiệm 1 lần inference
- Trong thực tế, tỷ lệ violence thường thấp hơn NSFW trên mạng xã hội, nên phần lớn thời gian vẫn phải chạy cả 2

```
Ảnh → ViT Violence → score > 0.7?
                      ├─ CÓ  → return "violence" (bỏ qua NSFW)
                      └─ KHÔNG → ViT NSFW → score > 0.7?
                                            ├─ CÓ  → return "nsfw"
                                            └─ KHÔNG → return "an toàn"
```

### Với Video — Trích frames bằng ffmpeg

#### Bước 1: Trích frames từ video bằng ffmpeg

Thay vì đọc video bằng OpenCV (hạn chế codec), hệ thống sử dụng **ffmpeg** — công cụ xử lý media mạnh nhất, hỗ trợ **mọi codec video** (H.264, H.265/HEVC, VP9, AV1, MPEG4...).

```
Video gốc (bất kỳ codec) → ffmpeg → Ảnh JPG (từng frame)
```

**Cách trích frames:**

```
Video 10 giây, 30 FPS
     ▼
ffmpeg -vf "fps=1/1" → Trích 1 frame mỗi 1 giây
     ▼
Tổng frames trích = 10 frames (tại giây 0, 1, 2, ..., 9)
```

Mỗi frame được lưu thành file ảnh `.jpg` riêng biệt, sau đó load bằng `PIL.Image.open()`.

**Tại sao 1 frame/giây thay vì 1 frame mỗi 5 frames?**

- Trích theo **thời gian** (1 frame/giây) thay vì theo **index frame** (mỗi 5 frame) để kết quả không phụ thuộc vào FPS của video
- Video 30 FPS và 60 FPS đều trích cùng số frames (= số giây)
- 1 giây là khoảng thời gian đủ ngắn để không bỏ sót đoạn nhạy cảm, đồng thời đủ dài để không lặp lại nội dung giống nhau

**Tại sao dùng ffmpeg thay vì OpenCV?**

| | OpenCV (`cv2.VideoCapture`) | ffmpeg |
|---|---|---|
| Codec hỗ trợ | Hạn chế (H.264, MPEG4) | **Mọi codec** (H.264, H.265, VP9, AV1, WebM...) |
| Định dạng file | MP4, AVI | **MP4, AVI, MKV, MOV, WebM, FLV...** |
| Trên Colab | Thiếu codec → lỗi | Có sẵn, hoạt động ổn định |
| Cách trích frame | Đọc tuần tự từng frame | Seek trực tiếp → nhanh hơn |

#### Bước 2: Lấy thông tin video bằng ffprobe

Trước khi trích frames, dùng `ffprobe` (đi kèm ffmpeg) để lấy metadata:

```
ffprobe video.mp4 → {
    "fps": 30.0,
    "duration": 10.5,      // giây
    "total_frames": 315,
    "codec": "h264",
    "resolution": "1920x1080"
}
```

Thông tin này được trả về trong kết quả API để client biết chi tiết về video.

#### Bước 3: Chạy từng frame qua pipeline

10 frames (video 10 giây) lần lượt đi qua pipeline:

```
Frame giây 0:
  ViT Violence → score: 0.12 (< 0.7) → KHÔNG
  ViT NSFW → score: 0.05 (< 0.7) → KHÔNG
  → Frame này AN TOÀN

Frame giây 1:
  ViT Violence → score: 0.08 → KHÔNG
  ViT NSFW → score: 0.03 → KHÔNG
  → AN TOÀN

Frame giây 2:
  ViT Violence → score: 0.85 → CÓ VIOLENCE ⚠️
  ViT NSFW → BỎ QUA (đã biết nhạy cảm) ⏭️
  → NHẠY CẢM (violence)

Frame giây 3:
  ViT Violence → score: 0.91 → CÓ VIOLENCE ⚠️
  ViT NSFW → BỎ QUA ⏭️
  → NHẠY CẢM (violence)

Frame giây 4:
  ViT Violence → score: 0.25 → KHÔNG
  ViT NSFW → score: 0.88 → CÓ NSFW ⚠️
  → NHẠY CẢM (nsfw)

Frame giây 5-9:
  (giả sử đều an toàn)
```

#### Bước 4: Tổng hợp kết quả — Tính toán chi tiết

Sau khi chạy xong 10 frames:

```
═══ VIOLENCE RATIO ═══

Số frames bị violence = 2 (giây 2, 3)
Tổng frames sampled   = 10

violence_ratio = 2 ÷ 10 = 0.20 = 20%

So sánh với threshold 10%:
20% > 10% → VIDEO CÓ BẠO LỰC ⚠️


═══ NSFW RATIO ═══

Số frames bị nsfw = 1 (giây 4)
Tổng frames sampled = 10

nsfw_ratio = 1 ÷ 10 = 0.10 = 10%

So sánh với threshold 10%:
10% = 10% → KHÔNG vượt threshold (phải > 10%, không phải >=)
→ VIDEO KHÔNG BỊ NSFW ✅

(Chỉ 1 frame bị detect → có thể false positive
 → threshold 10% giúp lọc bỏ trường hợp này)


═══ KẾT LUẬN CUỐI CÙNG ═══

is_sensitive = violence_detected OR nsfw_detected
is_sensitive = True OR False
is_sensitive = True

categories = ["violence"]
(Chỉ có violence vượt threshold, nsfw không vượt)
```

#### Bước 5: Tại sao threshold 10%?

```
Threshold quá thấp (5%):
├─ 10 frames × 5% = 0.5 → chỉ cần 1 frame bị detect
├─ 1 frame false positive → cả video bị gán nhạy cảm
└─ → QUÁ NHẠY, nhiều false positive

Threshold quá cao (30%):
├─ 10 frames × 30% = 3 → cần 3+ frames mới detect
├─ Đoạn bạo lực ngắn (1-2 giây = 1-2 frames) bị bỏ sót
└─ → QUÁ THOÁNG, bỏ sót vi phạm

Threshold 10%:
├─ 10 frames × 10% = 1 → cần hơn 1 frame (tức ít nhất 2)
├─ 1 frame false positive → OK, không bị gán nhạy cảm
├─ Đoạn vi phạm thật (thường kéo dài) → 2+ frames → detect được
└─ → CÂN BẰNG giữa false positive và false negative
```

---

## Tổng kết kiến trúc hệ thống

```
                    ┌─────────────────────────────────────────┐
                    │         Content Moderation API           │
                    │            (FastAPI + Ngrok)              │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              ┌─────▼─────┐               ┌──────▼──────┐
              │   IMAGE    │               │    VIDEO     │
              └─────┬─────┘               └──────┬──────┘
                    │                             │
                    │                     ┌───────▼───────┐
                    │                     │  ffprobe info  │
                    │                     │  ffmpeg frames │
                    │                     └───────┬───────┘
                    │                             │
                    │                     (1 frame / giây)
                    │                             │
              ┌─────▼─────────────────────────────▼─────┐
              │                                         │
        ┌─────▼──────┐      score > 0.7?          ┌────▼─────┐
        │ ViT Violence│──── CÓ → return ──────────│  SKIP    │
        │ (2 classes) │                            │  NSFW    │
        └─────┬──────┘                            └──────────┘
              │ KHÔNG
        ┌─────▼──────┐
        │  ViT NSFW  │──── score > 0.7? → return
        │ (2 classes) │
        └────────────┘
```

| Thành phần | Công nghệ | Vai trò |
|------------|-----------|---------|
| Model Violence | `jaranohaal/vit-base-violence-detection` (ViT-Base/16) | Classification: violence / non-violence |
| Model NSFW | `AdamCodd/vit-base-nsfw-detector` (ViT-Base/16) | Classification: nsfw / normal |
| Video frame extraction | `ffmpeg` + `ffprobe` | Trích 1 frame/giây, hỗ trợ mọi codec |
| Image loading | `PIL (Pillow)` | Load ảnh frame cho model |
| API Server | `FastAPI` + `Uvicorn` | REST API endpoints |
| Tunnel | `Ngrok` | Public URL cho API |
| GPU | `CUDA` (Tesla T4 trên Colab) | Tăng tốc inference |
