# Firebase Rules & Security

Tài liệu này giải thích ý nghĩa hệ thống Security Rules của Firebase được sử dụng trong dự án, bao gồm Firestore, Realtime Database và Storage.

## 1. Firestore Rules (`firestore.rules`)

Bảo vệ dữ liệu gốc và quản lý quyền truy cập.

- **`users` (Người dùng)**:
  - `private/fcm`, `private/settings`: Chỉ chính chủ (Owner) mới được đọc/ghi.
  - Profile công khai: Bất kỳ ai đã đăng nhập và chưa bị ban đều có thể xem. Chính chủ tự sửa (không được đổi `role` và `status`). Admin có toàn quyền.
  - `friends`, `blockedUsers`: Chỉ người dùng hoặc bên liên quan mới được đọc/ghi.
  - `feeds`: Chỉ chính chủ được đọc. Chính chủ hoặc Admin được ghi (Cloud Functions dùng quyền Admin để fan-out).

- **`friendRequests` (Lời mời kết bạn)**:
  - Chỉ người gửi và người nhận mới được đọc, sửa, xóa.
  - Khi tạo: bắt buộc `senderId` phải là chính mình, không được tự gửi cho bản thân, và không thể gửi nếu hai bên đang block nhau.

- **`posts` (Bài viết)**:
  - Xem được nếu: tài khoản chưa bị ban, không bị block hai chiều, bài chưa bị xóa, VÀ là tác giả / bạn bè của tác giả (với bài `friends`) / Admin. Bài `private` chỉ tác giả xem được.
  - Tạo: chính chủ, chưa bị ban.
  - Sửa: tác giả, Admin, hoặc Cloud Functions cập nhật `commentCount`/`updatedAt`.
  - Xóa: tác giả hoặc Admin.
  - `reactions`: Đọc được nếu là tác giả bài, chính người react, hoặc bạn bè của tác giả. Ghi yêu cầu chính chủ thả cảm xúc và không bị block.

- **`comments` (Bình luận)**:
  - Xem được nếu là tác giả bài viết, tác giả bình luận, bạn bè của tác giả bài, hoặc Admin.
  - Tạo: chưa bị ban, là tác giả, không bị block bởi chủ bài.
  - Sửa: tác giả, Admin, chủ bài viết (soft-delete), chủ comment cha (soft-delete reply con), hoặc Cloud Functions cập nhật `replyCount`/`updatedAt`.
  - Xóa: tác giả, Admin, hoặc chủ bài viết.
  - `reactions`: Tương tự `posts/reactions`.

- **`notifications` (Thông báo)**:
  - Chỉ người nhận (`receiverId`) được đọc.
  - Cập nhật: chỉ được ghi đúng 2 field `isRead` và `updatedAt`, mọi field khác bị từ chối.
  - Xóa: người nhận, Admin, hoặc actor (người tạo ra thông báo đó).

- **`reports` (Báo cáo)**:
  - Tạo: bất kỳ ai chưa bị ban, `reporterId` phải là chính mình.
  - Đọc/sửa/xóa: Admin hoặc người tạo báo cáo.

---

## 2. Realtime Database Rules (`database.rules.json`)

Tối ưu cho tốc độ và khả năng đồng bộ theo thời gian thực.

- **`presence` (Trạng thái hoạt động)**:
  - Đọc: bất kỳ ai đã đăng nhập.
  - Ghi: chỉ chính chủ.

- **`conversations` (Hội thoại)**:
  - Đọc: phải là thành viên trong `members`.
  - Ghi: thành viên được cập nhật `lastMessage`, `updatedAt`, `name`, `avatar`, `typing`, `activeCall`. Chỉ admin mới được thay đổi `members` và `creatorId`. Chỉ người tạo nhóm (`creatorId`) mới được xóa toàn bộ node (`isDisbanded`).

- **`messages` (Tin nhắn)**:
  - Đọc: phải là thành viên hội thoại.
  - Ghi tin nhắn mới: phải là thành viên.
  - Thu hồi: chỉ người gửi, trong vòng 5 phút (300.000ms).
  - `readBy`, `deliveredTo`, `reactions`, `deletedBy`: chỉ được ghi vào slot của chính mình.

- **`user_chats` (Danh sách chat)**:
  - Đọc: chỉ chính chủ.
  - Ghi: chính chủ hoặc các thành viên trong cùng hội thoại (để fan-out `lastMsgTimestamp`, `unreadCount`).

- **`call_signaling` (Tín hiệu cuộc gọi)**:
  - Đọc: chỉ chính chủ (`auth.uid === $uid`).
  - Ghi: bất kỳ ai đã đăng nhập (để gửi tín hiệu gọi đến người khác).

---

## 3. Storage Rules (`storage.rules`)

| Path | Read | Write | Delete | Giới hạn |
| :--- | :--- | :---- | :----- | :------- |
| `avatars/{userId}/...` | Public | Chính chủ | Chính chủ | 5MB, chỉ ảnh |
| `covers/{userId}/...` | Public | Chính chủ | Chính chủ | 10MB, chỉ ảnh |
| `posts/{userId}/...` | Public | Chính chủ | Chính chủ | 50MB, ảnh hoặc video |
| `comments/{userId}/...` | Public | Chính chủ | Chính chủ | 5MB, chỉ ảnh |
| `chats/{convId}/...` | Đã đăng nhập | Đã đăng nhập | Đã đăng nhập | 10MB, ảnh/video/audio/file/text |
| `group-avatars/{convId}/...` | Public | Đã đăng nhập | Đã đăng nhập | 5MB, chỉ ảnh |
| `reports/{userId}/...` | Đã đăng nhập | Chính chủ | Chính chủ | 5MB, chỉ ảnh |
| `thumbnails/{userId}/...` | Public | Chính chủ | Chính chủ | 2MB, chỉ ảnh |
