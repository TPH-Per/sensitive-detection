Kiến trúc hệ thống kiểm duyệt video của dự án được thiết kế theo dạng luồng (Pipeline) nhiều trạm (Cascade) để phân loại 3 hành vi vi phạm độc lập: Bạo lực (Violence), Tự hại (Self-harm) và Nhạy cảm (NSFW). Việc chia thành nhiều trạm giúp hệ thống cân bằng giữa độ chính xác và chi phí tài nguyên phần cứng.
Dưới đây là luồng hoạt động và chức năng chi tiết của từng thành phần:
1. Luồng hoạt động tổng thể (Workflow)
Luồng xử lý của hệ thống đi qua các bước "sàng lọc" từ mức độ nhẹ đến nặng:

    Video thô được đưa vào hệ thống và cắt nhỏ thành các đoạn cảnh (scene) đồng nhất.
    Lấy mẫu nhanh một vài khung hình để chấm điểm sơ bộ. Nếu cảnh đó hoàn toàn an toàn (ví dụ: phong cảnh), hệ thống bỏ qua ngay lập tức để tiết kiệm tài nguyên. Nếu có nghi ngờ, các trạm phân tích sâu sẽ được kích hoạt.
    Tiến hành trích xuất đặc trưng không gian toàn diện trên 64 khung hình, đồng thời chạy các thuật toán phụ trợ để tìm kiếm các chuyển động mạnh (đánh nhau) hoặc đối tượng nguy hiểm (hung khí).
    Toàn bộ các đặc trưng không gian và phụ trợ này được trộn lại và đưa vào mạng Transformer thời gian. Tại đây, các đại diện của 3 loại vi phạm (Task Tokens) sẽ tự động thu thập thông tin để xuất ra 3 điểm số cảnh báo cuối cùng.

2. Chức năng chi tiết của từng thành phần (Các Trạm)
Trạm 0: Bộ phát hiện ranh giới cảnh (Shot Boundary Detector)

    Mô hình: TransNetV2.
    Chức năng: Phân tách video dài thành các đoạn cảnh có ngữ cảnh đồng nhất. Bước này cực kỳ quan trọng để mạng Transformer không bị nhiễu loạn khi một chuỗi video đầu vào chứa nhiều hành động không liên quan đến nhau.

Trạm 1: Trạm gác cổng (Proxy Scorer)

    Mô hình: EfficientNet-B0.
    Chức năng: Hoạt động như một bộ lọc sơ bộ, lấy mẫu tối đa 8 khung hình mỗi cảnh. Mục tiêu của nó không phải là phân loại chính xác tuyệt đối mà là loại bỏ nhanh các đoạn video an toàn để tránh lãng phí RAM và GPU cho các trạm nặng nề ở phía sau. Nếu phát hiện nghi vấn, nó sẽ bật cờ kích hoạt các Trạm 2.

Trạm 2a: Bộ trích xuất đặc trưng không gian (Feature Extractor)

    Mô hình: CLIP ViT-B/32 (đóng băng trọng số).
    Chức năng: Trích xuất đặc trưng của tối đa 64 khung hình. Điểm tinh tế trong thiết kế là hệ thống đã xóa bỏ lớp projection head mặc định của ViT để lấy trực tiếp vector đặc trưng raw CLS 768-chiều, giúp bảo toàn tối đa thông tin ngữ nghĩa sâu của hình ảnh.

Trạm 2b & 2c: Các trạm phụ trợ (Optical Flow & Object Detector)

    Optical Flow (Luồng quang học): Tính toán độ lớn chuyển động để bắt các pha thay đổi nhanh, đột ngột – dấu hiệu đặc trưng của bạo lực.
    YOLOv8-nano: Nhận diện các đối tượng nguy hiểm, hung khí hoặc vật sắc nhọn trên 8 khung hình. Cả hai trạm này chỉ được kích hoạt khi Trạm 1 phát hiện ra dấu hiệu khả nghi nhằm tránh quá tải bộ nhớ.

Trạm 2d: Bộ chấm điểm NSFW

    Mô hình: CLIP ViT-B/32 kết hợp NSFWHead.
    Chức năng: Chấm điểm nội dung nhạy cảm trực tiếp cho từng khung hình vì hành vi NSFW chủ yếu mang tính chất không gian (ảnh tĩnh) thay vì thời gian.

Trạm 3: Bộ não phân loại (Task-Prompted Temporal Transformer) Đây là thành phần cốt lõi xử lý thời gian và đưa ra quyết định cuối cùng, bao gồm các mô-đun:

    Dung hợp bất đối xứng có cổng (Gated Asymmetric Fusion): Kết hợp ma trận đặc trưng 768-chiều khổng lồ từ CLIP với 3-chiều nhỏ bé từ Optical Flow/YOLO. Cơ chế Gated giúp các tín hiệu phụ trợ không bị gradient "nuốt chửng".
    Task Token Prepending: Nối 3 token đại diện cho 3 tác vụ (V_TOKEN: Bạo lực, S_TOKEN: Tự hại, N_TOKEN: Nhạy cảm) vào đầu chuỗi 64 khung hình.
    Temporal Transformer & Classification Heads: Mạng Transformer 4 tầng sẽ để cho 3 Task Tokens này tự do "truy vấn" (query) toàn bộ 64 khung hình nhằm thu thập đúng các thông tin liên quan đến loại vi phạm của chúng. Cuối cùng, 3 token này đi qua các lớp Linear phân loại để xuất ra điểm số độc lập cho mỗi hành vi