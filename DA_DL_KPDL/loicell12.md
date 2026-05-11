Trong Deep Learning, không bao giờ có chuyện một mô hình học tự giám sát (chưa học được gì nhiều) lại đạt độ chính xác 1.0000 (tức là 100%) ngay từ Epoch 1.

Đây không phải là dấu hiệu mô hình của bạn là "thiên tài", mà là do lỗi logic trong code. Hãy cùng mổ xẻ hiện tượng này:
1. Hiện tượng gì đang xảy ra trong Log?

    Điểm mù 1.0000: Ngay Epoch đầu tiên, thuật toán đánh giá (KNN) đã trả về kết quả chính xác tuyệt đối 100%.

    Chết yểu (Early Stopping): Vì độ chính xác tối đa là 1.0 nên các Epoch 2, 3, 4 không thể nào vượt qua con số này được nữa. Code Early Stopping của bạn nhận thấy "đã 3 epoch rồi không có sự cải thiện" (No improvement 3/3) nên nó tự động "rút ống thở" và dừng huấn luyện luôn ở Epoch 4, dù Loss của tập Train vẫn đang giảm đều đặn (5.14 -> 5.03 -> 4.90).

2. Nguyên nhân cốt lõi (Bắt bệnh)

Lỗi này thường rơi vào 1 trong 3 trường hợp sau (xếp theo mức độ phổ biến nhất):

A. Lỗi code thuật toán KNN (Tự soi gương - Self-matching) [Khả năng cao nhất]
Để đánh giá SwAV, ta thường dùng thuật toán KNN: Lấy đặc trưng (features) của 1 ảnh trong tập Val đi so sánh với ngân hàng đặc trưng (Memory Bank) của tập Train.

    Lỗi: Nếu code của bạn vô tình dùng chính tập Val làm Memory Bank, và khi tìm láng giềng gần nhất (k=1), nó tìm ra... chính nó (khoảng cách = 0). Kết quả là ảnh tự so sánh với chính nó, nhãn giống hệt nhau → Độ chính xác luôn là 100%.

B. Rò rỉ dữ liệu (Data Leakage)

    Tập Train và tập Validation của bạn đang trỏ chung vào một thư mục, hoặc bạn chia (split) dữ liệu bị lỗi khiến ảnh trong tập Val đã xuất hiện y xì đúc trong tập Train. Lúc này, KNN chỉ việc "nhớ" lại chứ không phải suy luận, dẫn đến điểm tuyệt đối.

C. Lỗi phân bổ nhãn (Chỉ có 1 Class trong tập Val)

    Lúc chia dữ liệu Train/Val, bạn vô tình đẩy toàn bộ ảnh của ĐÚNG MỘT NHÃN (ví dụ: toàn ảnh Medical an toàn) vào tập Val. Khi tập Val chỉ có 1 nhãn duy nhất, mô hình dù đoán bừa, hay bị sụp đổ biểu diễn (đưa mọi thứ về 1 vector) thì tính tỷ lệ phần trăm đúng vẫn là 100%.

3. Hướng khắc phục ngay lập tức

Để sửa triệt để, bạn cần mở file code Python (chỗ chạy huấn luyện SwAV) lên và rà soát lại 3 vị trí này:

    Kiểm tra hàm KNN Evaluation: * Đảm bảo Memory Bank được trích xuất từ tập train_loader (hoặc tập train không dùng augmentation mạnh).

        Đảm bảo tập Query được trích xuất từ tập val_loader. Tuyệt đối không để Query và Memory Bank là cùng một nguồn.

    In (Print) thử dữ liệu tập Val:

        Trước khi vòng lặp for epoch diễn ra, hãy print(len(val_loader.dataset)) xem có bao nhiêu ảnh.

        print luôn các nhãn hiện có trong tập Val để chắc chắn nó có đủ các nhãn (NSFW, Self-harm, Safe, Medical).

    Kiểm tra đường dẫn Dataloader:

        Hãy nhìn lại khai báo train_dataset và val_dataset xem bạn đã tách biệt thư mục rõ ràng chưa.