Dựa trên nguyên tắc "Dữ liệu là vua" (Garbage In, Garbage Out), hệ thống của bạn đang bị ung thư từ khâu chia dữ liệu, nếu không chữa tận gốc thì model có xịn đến mấy cũng vô dụng.

Dưới đây là Bản Kế Hoạch Tác Chiến Cuối Cùng (Master Action Plan). Mình xếp hạng theo thứ tự bắt buộc phải làm từ trên xuống dưới, kèm theo lý do cực kỳ rõ ràng:
BƯỚC 1: Dọn rác và Phân lô lại Dữ Liệu (Làm ngay trên Pandas/CSV)

Giai đoạn này không cần GPU, chỉ cần chạy script xử lý file .csv của bạn.
1.1. Lọc bỏ các mẫu n_frames = 1

    Hành động: Viết script đọc file temporal_train.csv / multitask_train.csv. Tìm và XÓA BỎ toàn bộ các dòng có n_frames < 16 (hoặc ngưỡng an toàn nào đó tùy bạn cấu hình).

    Lý do tại sao: Mô hình Temporal (Thời gian) cần một chuỗi khung hình để học chuyển động. Nếu ném vào 1 video chỉ có 1 frame, mô hình sẽ không hiểu thời gian là gì, sinh ra lỗi shape mismatch (lệch chiều ma trận) làm sập (crash) toàn bộ quá trình train.

1.2. Chia lại tỉ lệ Train/Val/Test (Cứu nguy cho Source Bias)

    Hành động: Viết script gộp toàn bộ data cũ lại, sau đó dùng hàm train_test_split với tham số stratify = source_column. Đảm bảo mọi bộ data (từ adult_content, rwf2000 đến self_harm) đều bị cắt theo đúng một tỉ lệ chuẩn (ví dụ: 70% Train - 15% Val - 15% Test).

    Lý do tại sao: Hiện tại dữ liệu của bạn đang chia cực kỳ ngẫu nhiên và nguy hiểm. Tập Val bị thống trị bởi adult_content (chiếm >52%), trong khi class self_harm ở tập Test chỉ có đúng 29 mẫu. Việc chia lại (stratify) giúp đảm bảo tập Val và Test là bức tranh thu nhỏ hoàn hảo của tập Train. Validation Loss đo được lúc này mới là thật, và Threshold tính ra mới chính xác.

BƯỚC 2: Nâng cấp luồng nạp Dữ liệu (Dataloader)

Chỉnh sửa code Python ở phần chuẩn bị đưa data vào model train.
2.1. Code thêm WeightedRandomSampler

    Hành động: Trong file cấu hình Dataloader (nơi khai báo DataLoader(...) trong PyTorch), chèn thêm bộ lấy mẫu WeightedRandomSampler.

    Lý do tại sao: Tỉ lệ ảnh Tự hại so với ảnh An toàn của bạn đang là 1:35. Nếu để Dataloader bốc ngẫu nhiên (Batch Size = 32), mô hình sẽ liên tục nạp vào các batch KHÔNG CÓ BẤT KỲ một tấm ảnh tự hại nào. Bộ Sampler này ép PyTorch phải "ăn gian", bốc lặp lại các ảnh self_harm nhiều lần hơn, đảm bảo mẻ data nào đưa vào model cũng có ảnh nguy hiểm để model học. (Việc dùng pos_weight bạn đã làm ở suachua01 vẫn giữ nguyên để bổ trợ thêm).

BƯỚC 3: Chạy lại Model và Đánh giá (Huấn luyện thực sự)

Sau khi Dữ liệu đã sạch và Dataloader đã khôn, bật GPU lên.
3.1. Chạy lại luồng Train tuần tự

    Hành động: Bắt đầu train lại từ đầu theo thứ tự: SwAV Spatial → Temporal SSL Pretext → Finetune Multitask.

    Lý do tại sao: Dữ liệu mới đã sạch hơn, cân bằng hơn. SwAV sẽ gôm cụm chuẩn hơn. Multitask sẽ không còn thiên vị (bias) về class NSFW nữa.

3.2. Thay đổi "bãi thử" Threshold (Ngưỡng cắt)

    Hành động: Sửa file evaluate_multitask.py. Thay vì dùng tập Val để dò tìm mốc Threshold (0.4 hay 0.5) cho class self_harm, hãy trỏ code để nó dò trên tập Challenge Holdout (bucket positive_hard).

    Lý do tại sao: Tập Val dù có chia lại thì class self_harm vẫn khá ít. Tập Challenge Holdout là nơi chứa 300 mẫu cực kỳ khó nhằn (Hard Negatives/Positives). Tìm mốc Threshold trên tập khó nhất này sẽ giúp hệ thống của bạn hoạt động hoàn hảo khi mang ra ứng dụng thực tế.

GHI CHÚ HIỆU CHỈNH THEO CODE HIỆN TẠI

- Cell 5 hiện tại không phải là split ngẫu nhiên toàn cục. `prepare_kaggle_data.py` đang chia theo `source`, sau đó theo `group_id`, và chỉ stratify theo `label_signature` khi hợp lệ.
- Với các manifest đang được config train dùng thật (`manifests/temporal_*.csv`, `manifests/multitask_*.csv`), cột `n_frames` không phải là điều kiện train bắt buộc. Loader hiện tại pad/truncate theo `frames_per_clip`, nên bước xóa toàn bộ mẫu `n_frames < 16` là không khớp với pipeline active.
- `mainfests/*.csv` là một nhánh output khác/cũ hơn có `n_frames`, nhưng các config train hiện tại đang trỏ sang `manifests/*.csv`, không phải `mainfests/*.csv`.
- Threshold calibration không nên dò trên `challenge_holdout`. Luồng hiện tại đúng hơn là: calibrate trên `val` rồi mang thresholds JSON đó sang `test`/`challenge` để đánh giá cuối.
- Nếu phát hiện cell 5 trước đây đã sinh manifest theo logic cũ, thì cần rerun data prep và toàn bộ stage phụ thuộc manifest. Nếu manifest hiện tại đã được tạo bằng code mới, thì không cần reset mọi thứ từ đầu chỉ vì nghi ngờ split.
- Cell 10 và 11 là stage train cho proxy gate và NSFW scorer, nên việc chỉ thấy train loss / val loss là đúng thiết kế; test metrics được tách ra chạy bằng `evaluate_proxy.py` và `evaluate_nsfw_scorer.py` sau khi train xong.

CELL KIEM THU TUONG UNG

- Cell 19: `evaluate_proxy.py` trên test split.
- Cell 20: `evaluate_multitask.py` trên test split.
- Cell 21: kiểm tra nội dung `challenge_holdout`.
- Cell 22: inference end-to-end cho một video cụ thể.
- Cell 23: `evaluate_challenge.py` trên challenge holdout.
- NSFW scorer: chưa có cell notebook riêng trong `capnhat01.md`; dùng script `scripts/evaluate_nsfw_scorer.py` trực tiếp nếu muốn test checkpoint NSFW.

Ghi chú leakage:

- Với manifests temporal và multitask hiện có trong workspace, train/val/test không overlap theo path khi kiểm tra thực tế.
- Logic chia ở `prepare_kaggle_data.py` cũng chia theo `source` + `group_id`, nên cùng clip / cùng group không bị rơi sang nhiều split.
- Nếu bạn đang thấy thiếu file test ở local workspace, đó thường là do output cũ/chưa rerun đủ cell hoặc do nhánh `mainfests/` thay vì `manifests/`.