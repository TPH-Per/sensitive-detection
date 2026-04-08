# Firebase Rules & Security

Tài liệu này giải thích ý nghĩa hệ thống Security Rules của Firebase được sử dụng trong dự án, bao gồm Firestore, Realtime Database và Storage.

## 1. Firestore Rules (`firestore.rules`)

Bảo vệ dữ liệu gốc và quản lý quyền truy cập.

- **`users` (Người dùng)**:
  - `private/fcm`, `private/settings`: Chỉ bản thân người dùng (Owner) mới được đọc/ghi thông tin riêng tư (như token thiết bị, cài đặt).
  - Profile công khai: Bất kỳ ai đăng nhập cũng có thể xem (nếu tài khoản chưa bị khóa). User tự sửa, Admin được toàn quyền.
  - `friends`, `blockedUsers`: Chỉ người dùng hoặc bạn bè liên quan mới được đọc/ghi.
  - `feeds`: Nguồn cấp dữ liệu được cá nhân hóa, chỉ bản thân (Owner) mới được xem/ghi.

- **`friendRequests` (Lời mời kết bạn)**:
  - Chỉ người gửi và người nhận mới có quyền xem, sửa, và xóa. Người tạo mới bắt buộc phải là người gửi (`senderId`).

- **`posts` (Bài viết)**:
  - Chỉ xem được nếu: Tác giả chưa chặn, bài viết công khai HOẶC là bạn bè (nếu bài viết set chế độ friends).
  - Chỉ tác giả mới được tạo/sửa/xóa bài viết của mình. Quản trị viên (Admin) có thể xóa/xóa bài bất kỳ.
  - Cảm xúc (`reactions`): Đọc thoải mái như bài công khai, ghi yêu cầu chính chủ thả cảm xúc.

- **`comments` (Bình luận)**:
  - Cấu trúc quyền xem tương tự `posts`.
  - Tác giả hoặc chủ bài viết đều có quyền xóa bình luận (Chủ post có quyền quản lý comment trên bài của mình).

- **`notifications` (Thông báo)**:
  - Bọc quyền riêng tư nghiêm ngặt. Chỉ người nhận (`receiverId`) được xem.
  - **Lưu ý update**: Khi cập nhật, frontend chỉ được phép gửi lên đúng 2 trường là `isRead` và `updatedAt`. Nếu gửi kèm các trường khác, lệnh update sẽ bị từ chối (Permission Denied).

- **`reports` (Báo cáo)**:
  - Bất kỳ ai cũng có thể tạo báo cáo. Chỉ người báo cáo và Admin được xem hoặc cập nhật.

---

## 2. Realtime Database Rules (`database.rules.json`)

Tối ưu cho tốc độ và khả năng đồng bộ theo thời gian thực (như trạng thái online, nhắn tin, gọi video).

- **`presence` (Trạng thái hoạt động)**:
  - Cho phép người dùng khác xem trạng thái đang online/offline của mình. Chỉ chính chủ mới được cập nhật.
- **`conversations` (Cuộc hội thoại / Nhóm chat)**:
  - Đọc/ghi yêu cầu người dùng phải là thành viên trong mảng `members`.
  - Có các validate ngặt nghèo khi thêm/bớt nhóm, đảm bảo chỉ nhóm trưởng (admin) mới được thay đổi thành viên hoặc xóa nhóm (`isDisbanded`).
  - `activeCall`: Đánh dấu trạng thái đang có cuộc gọi, yêu cầu là thành viên mới được tham gia.
- **`messages` (Tin nhắn)**:
  - Người dùng là thành viên hội thoại mới xem/gửi được tin nhắn.
  - Validate cho phép thu hồi tin nhắn trong vòng 5 phút (300.000ms).
  - Đọc/nhận (readBy, deliveredTo): Tự động đánh dấu khi mở máy.
- **`user_chats` (Danh sách chat UI)**:
  - Giữ danh sách nhóm chat hiển thị trên màn hình người dùng, chỉ người dùng đó đọc/ghi được.
- **`call_signaling` (Tín hiệu WebRTC/Call)**:
  - Dùng để gửi tín hiệu khởi tạo cuộc gọi, nghe máy, ngắt máy. Có quyền đọc/ghi chung miễn là đã xác thực.

---

## 3. Storage Rules (`storage.rules`)

Quản lý file đính kèm, hình ảnh và bảo mật file tĩnh.

- **Avatar / Cover**: Bất kỳ ai cũng có thể xem ảnh đại diện/ảnh bìa. Chỉ chủ tài khoản mới được tải lên và xóa (giới hạn dung lượng cụ thể, kiểm tra `contentType` ảnh hợp lệ).
  - *Pattern gửi file*: `avatars/{userId}/{filename}`
  - *Pattern gửi file*: `covers/{userId}/{filename}`
- **Post Media (Ảnh/Video bài viết)**: Xem công khai. Tác giả tạo gốc mới được ghi đè/xóa.
  - *Pattern gửi file*: `posts/{userId}/{filename}`
- **Chat Media (File trong tin nhắn)**: Chỉ những người đã đăng nhập (isAuthenticated) mới có quyền truy cập, tránh lộ lọt file nhóm công khai. 
  - *Pattern gửi file bắt buộc*: `chats/{convId}/{timestamp}_{filename}`
  - Trong đó `convId` có thể là `direct_{uid1}_{uid2}` hoặc `group_{groupId}`.
- **Thumbnail / Report Images**: Tương tự, tải file lên cần kiểm tra đúng định dạng ảnh.
  - *Pattern gửi file*: `thumbnails/{filename}` hoặc `reports/{userId}/{filename}`
