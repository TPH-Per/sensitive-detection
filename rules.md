---
applyTo: "**"
---

- Luôn luôn trả lời bằng tiếng Việt (Kế hoạch thực hiện, Hướng dẫn, Nhiệm vụ, mọi thứ..)
- Quy tắc viết comment cho code:

Nguyên tắc "Tối giản": Chỉ comment khi thực sự cần thiết. Không giải thích những gì code đã thể hiện quá rõ ràng (ví dụ: không comment "Khởi tạo biến x" cho dòng let x = 0).

Độ dài: Mỗi comment không quá 1 dòng, tối đa 10-12 từ.

Văn phong: Sử dụng ngôn ngữ tự nhiên, trực diện. Tránh dùng các cụm từ kiểu AI như: "Đoạn code này dùng để...", "Sửa lỗi...", "Cập nhật logic để...".

Tập trung vào "Tại sao" (Why) thay vì "Cái gì" (What): Đừng giải thích code đang làm gì, hãy giải thích mục đích hoặc lưu ý đặc biệt.

Cấm tiền tố: Tuyệt đối không bắt đầu bằng "Fix:", "Update:", "Nối tiếp" hay "Giải thích:". Hãy viết thẳng nội dung. Chỉ Comment ở đầu hàm , không ở trong logic hàm

Ngôn ngữ: [Chọn Tiếng Việt hoặc Tiếng Anh nhưng cần xem xét thống nhất theo comment chung của toàn bộ dự án là gì] ngắn gọn, súc tích.
Tình huống,Kiểu AI Gen (Tránh),Kiểu Đơn Giản (Nên dùng)
Xử lý mảng,Đoạn code này thực hiện lặp qua mảng để tìm giá trị lớn nhất.,Tìm giá trị lớn nhất trong danh sách.
Sửa lỗi logic,Đã sửa lỗi logic khi người dùng nhập số âm vào ô tìm kiếm.,Chặn giá trị âm từ ô tìm kiếm.
Gửi API,Hàm này thực hiện gọi API đến server để lấy dữ liệu người dùng.,Lấy thông tin người dùng từ server.
Check điều kiện,Kiểm tra xem biến user có tồn tại hay không trước khi xử lý.,Đảm bảo user hợp lệ trước khi chạy.
"Hãy viết comment theo phong cách tối giản (minimalist). Chỉ ghi chú những điểm mấu chốt, không giải thích dài dòng, không dùng văn phong AI." Skip các comment của HTML

- Luôn luôn kiểm tra chẩn đoán sau khi hoàn thành chỉnh sửa mã
- Không tự build hay chạy mã
- Không bao giờ viết mã giả
- Luôn tuân theo các quy tắc và hướng dẫn đã cho trong suốt cuộc trò chuyện
- Luôn đặt câu hỏi nếu có điều gì đó không rõ ràng trước khi tiếp tục
- Luôn luôn tuân theo định dạng phản hồi đã cho trong suốt cuộc trò chuyện
