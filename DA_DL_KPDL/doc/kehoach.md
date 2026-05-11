KẾ HOẠCH TRIỂN KHAI DỰ ÁN DEEP LEARNING: HỆ THỐNG KIỂM DUYỆT VIDEO V5.1
GIAI ĐOẠN 1: KHỞI TẠO VÀ ĐỊNH NGHĨA MỤC TIÊU (Tuần 1)
Mục tiêu: Đặt nền móng vững chắc, xác định rõ các chỉ số thành công trước khi code.

    Bước 1.1: Định nghĩa Chỉ số Đánh giá (Performance Metrics) cho từng trạm: Không sử dụng Accuracy (độ chính xác) chung chung vì dữ liệu kiểm duyệt rất mất cân bằng.
        Trạm 1 (EfficientNet-B0): Tối ưu hóa Recall (Độ phủ) đạt > 98% (thà bắt nhầm còn hơn bỏ lọt).
        Trạm 2c (YOLOv8-nano): Tối ưu hóa mAP@0.5 trên các class hung khí, lưỡi lam.
        Trạm 3 (Temporal Transformer): Sử dụng F1-Score và Confusion Matrix (Ma trận nhầm lẫn) để đảm bảo mô hình không còn nhầm lẫn chéo giữa Bạo lực - Tự hại - NSFW.
    Bước 1.2: Thiết lập Môi trường & Phần cứng: Cài đặt PyTorch, chuẩn bị GPU, thiết lập các thư viện theo dõi quá trình huấn luyện (như TensorBoard hoặc Weights & Biases) để giám sát Loss và Gradient.

GIAI ĐOẠN 2: CHUẨN BỊ VÀ TIỀN XỬ LÝ DỮ LIỆU (Tuần 2 - 3)
Mục tiêu: Xây dựng tập dữ liệu đa dạng, chất lượng cao để triệt tiêu False Positive.

    Bước 2.1: Gom nhóm và làm sạch dữ liệu (Data Curation):
        Dữ liệu Không gian (Spatial): NSFW dataset, Self Harm/Suicide Detection (ảnh tĩnh), và đặc biệt là Medical Dataset (Hard Negatives: dao mổ, máu phẫu thuật).
        Dữ liệu Thời gian (Temporal): UCF-101 hoặc Kinetics-400 (chứa hành vi vật lý thực tế để tránh học vẹt).
    Bước 2.2: Tiền xử lý (Preprocessing): Chuẩn hóa ảnh (Image Normalization) về dải giá trị [-1, 1], cấu hình mini-batch (ví dụ 16 frames/batch cho CLIP để tránh tràn RAM).
    Bước 2.3: Tăng cường dữ liệu (Data Augmentation):
        Áp dụng Multi-crop (cắt nhiều góc độ: 2 crop lớn + nhiều crop nhỏ) phục vụ cho thuật toán SwAV.
        Áp dụng thay đổi độ sáng/tương phản (Color Jittering), lật ngang, và nhiễu ngẫu nhiên.
        Augmentation thời gian: Thay đổi tốc độ phát video (frame rates) hoặc cắt clip ở các mốc thời gian khác nhau.

GIAI ĐOẠN 3: LẬP TRÌNH VÀ TÍCH HỢP KIẾN TRÚC PIPELINE (Tuần 4 - 6)
Mục tiêu: Code và ráp nối các Module độc lập thành một luồng (Pipeline) thống nhất.

    Bước 3.1: Cấu hình Trạm Gác cổng (Trạm 0 & Trạm 1):
        Tích hợp TransNetV2 để cắt Scene.
        Fine-tune EfficientNet-B0 bằng nhãn mềm (Label Smoothing) và Loss Cross-Entropy trên dữ liệu an toàn/nguy hiểm. Cấu hình ngưỡng threshold thấp để đóng vai trò "Radar không gian".
    Bước 3.2: Lập trình Trạm Trích xuất (Trạm 2):
        Cấu hình CLIP ViT-B/32: Xóa lớp projection head, lấy trực tiếp vector 768-chiều (raw CLS token).
        Tích hợp Optical Flow (Trạm 2b) để xuất độ lớn chuyển động.
        Triển khai Chiến lược Lấy mẫu Lai (Hybrid Sampling) cho YOLOv8 (Trạm 2c): Lập trình bộ lọc lấy 4 frames cách đều nhau (bắt tĩnh) + 4 frames có biến thiên Optical Flow mạnh nhất (bắt động).
    Bước 3.3: Lập trình Bộ não (Trạm 3 - Temporal Transformer):
        Mở rộng d_model (chiều không gian) lên 512 hoặc 768 để đạt mốc ~25 triệu tham số (khắc phục Underfitting).
        Lập trình cơ chế Q-Former Cross-Attention cho 3 Task Tokens (V_TOKEN, S_TOKEN, N_TOKEN) đóng vai trò là Query để truy xuất 64 frames.
        Lập trình lớp Gated Asymmetric Fusion kết hợp đặc trưng CLIP và Aux Features (Flow/YOLO).

GIAI ĐOẠN 4: LỘ TRÌNH HUẤN LUYỆN 3 BƯỚC SSL (Tuần 7 - 10)
Mục tiêu: Chạy quá trình huấn luyện cốt lõi, trị dứt điểm bệnh "đoán bừa" và "học vẹt".

    Bước 4.1: Tiền huấn luyện Không gian (Spatial Pre-training với SwAV):
        Đưa nhóm dữ liệu NSFW, Self-harm và Hard Negative (Medical) vào huấn luyện qua thuật toán SwAV.
        Đánh giá tạm thời: TUYỆT ĐỐI không nhìn vào Loss. Cắt tập validation nhỏ, dùng Linear Probing hoặc đo k-NN, RankMe. Nếu k-NN tăng, mô hình đã học được cách gom cụm ngữ nghĩa sâu.
    Bước 4.2: Tiền huấn luyện Thời gian (Temporal SSL):
        Đóng băng hoàn toàn (Freeze) các trọng số Không gian (Spatial Backbone) vừa học được từ SwAV để tránh thảm họa quên (Catastrophic Forgetting).
        Đưa video thật vào, dạy Temporal Transformer các tác vụ: Frame Sorting (Sắp xếp khung hình) và Arrow of Time (Chiều thời gian).
    Bước 4.3: Tinh chỉnh không-thời gian (Spatiotemporal Fine-tuning):
        Ráp nối toàn bộ Pipeline. Mở băng toàn bộ mô hình.
        Set Learning Rate (Tốc độ học) RẤT THẤP cho phần Backbone, và Learning Rate CAO cho các Classification Heads.
        Sử dụng Loss Đa nhiệm (Multi-task Cross-Entropy) kết hợp Label Smoothing.

GIAI ĐOẠN 5: ĐÁNH GIÁ, GỠ LỖI VÀ TINH CHỈNH (Tuần 11 - 12)
Mục tiêu: Tối ưu mô hình dựa trên các số liệu thực tế, chuẩn bị cho vận hành.

    Bước 5.1: Theo dõi Khoảng cách khái quát hóa (Generalization Gap): So sánh F1-Score trên tập Train và tập Validation. Nếu F1-Validation bắt đầu chững lại hoặc giảm, kích hoạt ngay thuật toán Early Stopping (Dừng sớm) để chống Overfitting.
    Bước 5.2: Phân tích Ma trận nhầm lẫn (Confusion Matrix):
        Truy xuất các mẫu False Positive và False Negative.
        Kiểm tra xem S_TOKEN (tự hại) và N_TOKEN (nhạy cảm) còn bị nhầm lẫn chéo với video bạo lực hay không.
    Bước 5.3: Gỡ lỗi (Debugging): Nếu có lỗi, áp dụng phương pháp Đơn giản hóa bài toán (Simplify the task): Cho mạng overfit trên 1 mini-batch duy nhất. Nếu loss không về 0, chứng tỏ có lỗi trong kiến trúc code (gradient không chạy hoặc hàm Loss sai).

GIAI ĐOẠN 6: TỐI ƯU HIỆU NĂNG, TRIỂN KHAI VÀ BÁO CÁO (Tuần 13 - 14)
Mục tiêu: Đóng gói sản phẩm, xử lý triệt để OOM và hoàn thiện luận văn.

    Bước 6.1: Tối ưu bộ nhớ (Model Compression & OOM Handling):
        Nếu hệ thống vẫn báo tràn RAM (OOM) khi xử lý video dài/dọc, áp dụng Lượng tử hóa (Quantization): chuyển trọng số từ chuẩn FP32 xuống FP16 hoặc INT8.
        Sử dụng TensorRT để tăng tốc độ Inference cho YOLOv8-nano và EfficientNet-B0.
    Bước 6.2: Kiểm thử thực tế (End-to-End Testing): Cho một luồng video thực tế dài (ví dụ 10 phút) chạy qua toàn bộ Pipeline (TransNetV2 -> EfficientNet -> CLIP/YOLO/Flow -> Transformer) để đo tốc độ xử lý FPS và mức ngốn VRAM.
    Bước 6.3: Viết Báo cáo Tổng kết:
        Chuyển toàn bộ tài liệu từ MODEL_ARCHITECTURE.md, cai_tien.md và bản Tailored Report (mà tôi đã khởi tạo trước đó) thành các chương: Tổng quan, Cơ sở lý thuyết (SSL, SwAV), Đề xuất kiến trúc V5.1, Thực nghiệm và Kết quả.