# Common Configurations (App Config)

Tài liệu này chứa các cấu hình hệ thống quan trọng, bao gồm giới hạn dữ liệu, validation và các hằng số dùng chung.

## 1. Giới hạn Nhóm Chat (Group Limits)

- **Số lượng thành viên tối thiểu**: `2` người.
- **Số lượng thành viên tối đa**: `100` người.
- **Tên nhóm tối đa**: `50` ký tự.

## 2. Validation & Độ dài trường dữ liệu

- **Mật khẩu**: Tối thiểu `6` ký tự.
- **Tiểu sử (Bio)**: Tối đa `500` ký tự.
- **Nội dung bài viết (Post)**: Tối đa `5000` ký tự.
- **Nội dung bình luận**: Tối đa `2000` ký tự.
- **Nội dung tin nhắn chat**: Tối đa `5000` ký tự.
- **Tên hiển thị (User Name)**: Tối đa `50` ký tự.

## 3. Thời gian và Timeout (Time Limits)

- **Thời gian cho phép thu hồi tin nhắn**: `300.000` ms (5 phút).
- **Thời gian cho phép chỉnh sửa tin nhắn**: `300.000` ms (5 phút) (`MESSAGE_EDIT_WINDOW`).
- **Thời gian chờ hiển thị "Đang gõ..." (`TYPING_TIMEOUT`)**: `3000` ms.
- **Thời gian hiển thị thông báo Toast (`TOAST_DURATION`)**: `3000` ms.
- **Độ dài tối đa đoạn ghi âm tin nhắn (`VOICE_MAX_DURATION`)**: `300.000` ms (5 phút).

## 4. Báo cáo vi phạm (Report Config)

Mô tả vi phạm (`description`) tối đa `500` ký tự.
Số lượng ảnh minh họa báo cáo tối đa (`MAX_IMAGES_PER_REPORT`): `5` ảnh.
Dưới đây là các loại hình báo cáo và ý nghĩa mà UI cần hiển thị:

- **`spam`**: Spam (Tin rác, quảng cáo không mong muốn).
- **`harassment`**: Quấy rối & Bạo lực (Bắt nạt, đe dọa hoặc nội dung bạo lực).
- **`hate_speech`**: Ngôn từ thù ghét (Phân biệt chủng tộc, giới tính, thù địch).
- **`sensitive`**: Nội dung nhạy cảm (Hình ảnh/video khiêu dâm, người lớn).
- **`scam_impersonation`**: Lừa đảo & Giả mạo (Chiếm đoạt tài sản hoặc mạo danh người khác).
- **`other`**: Khác (Lý do khác).

Các đối tượng (Object Type) hỗ trợ báo cáo:

- `post`: Bài viết.
- `comment`: Bình luận.
- `user`: Người dùng.

## 5. Giới hạn Media & Tệp tin (Media & File Limits)

**Số lượng file tối đa:**

- **Bài viết (Post)**: Tối đa `10` ảnh, `3` video.
- **Bình luận (Comment)**: Được đính kèm `1` ảnh duy nhất.
- **Tin nhắn chat**: Gửi tối đa `10` file cùng lúc.

**Dung lượng giới hạn:**

- **Avatar**: `5MB`
- **Ảnh bìa (Cover)**: `10MB`
- **Ảnh thông thường** (bài viết, bình luận): `5MB`
- **Video**: `50MB`
- **File đính kèm (Chat)**: `10MB`
- **Ảnh báo cáo vi phạm**: `5MB`
- **Avatar nhóm chat**: `5MB`
- **Video thumbnail**: `2MB`

## 6. Cảm xúc (Reactions)

Danh sách Cảm xúc hỗ trợ để render icon/emoji:

- `LIKE` (Thích)
- `LOVE` (Yêu thích)
- `HAHA` (Haha)
- `WOW` (Wow)
- `SAD` (Buồn)
- `ANGRY` (Phẫn nộ)

## 7. API Endpoints

- **Tỉnh/Thành phố**: `API_ENDPOINTS.PROVINCES` — lấy dữ liệu địa giới hành chính. Link: https://provinces.open-api.vn/
