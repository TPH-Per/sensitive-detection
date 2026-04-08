# Assets (Tài nguyên tĩnh)

Tài liệu này liệt kê các tài nguyên tĩnh (`assets`) của ứng dụng mà đội Mobile cần đồng bộ (tìm kiếm hoặc import các file tương đương vào dự án mobile) để đảm bảo trải nghiệm người dùng nhất quán giữa các nền tảng.

## 1. Icons (`src/assets/icons`)

Đây là bộ icon SVG chuẩn dùng cho tính năng **Thả cảm xúc (Reactions)**. Đội Mobile nên chuẩn bị bộ icon tương ứng để hiển thị trong UI:

- `like.svg`: Thích
- `love.svg`: Yêu thích
- `haha.svg`: Haha
- `wow.svg`: Wow
- `sad.svg`: Buồn
- `angry.svg`: Phẫn nộ
- `cancel.svg`: Icon hủy bỏ/tắt popup.

## 2. Sounds (`src/assets/sounds`)

Đây là các file âm thanh rất quan trọng. Đội Mobile cần thêm các file này vào thư mục Raw/Assets của iOS/Android để cấu hình âm thanh Push Notification và cấu hình Call SDK (ví dụ ZegoCloud).

**Âm thanh cuộc gọi (Call & WebRTC):**
- `ring.mp3`: Chuông reo khi có người gọi đến (Incoming Call).
- `wait_ring.mp3`: Tiếng tút thuôn dài khi đang gọi đi chờ người khác bắt máy (Outgoing Call).
- `connected.mp3`: Âm thanh bíp báo hiệu kết nối cuộc gọi thành công.
- `ended.mp3`: Âm thanh tút tút khi kết thúc cuộc gọi hoặc khi ai đó gác máy.
- `busy.mp3`: Màn hình báo máy bận khi người nhận từ chối cuộc gọi.
- `action.mp3`: Âm báo thao tác (click, bật/tắt mic...).

**Âm thanh thông báo (Notifications):**
- `message-notification.mp3`: Âm báo ting khi có tin nhắn mới hoặc thông báo mới tới.
