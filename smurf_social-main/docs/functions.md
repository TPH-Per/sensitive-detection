# Cloud Functions

Tài liệu mô tả toàn bộ Cloud Functions đang triển khai. Tất cả functions chạy tại region `us-central1`, memory `512MiB`, CPU `0.5`, concurrency `1`.

Functions chia thành 4 nhóm: **Callable** (client gọi trực tiếp), **Firestore Triggers**, **RTDB Triggers**, và **Scheduled**.

---

## 1. Callable Functions

Client gọi qua `httpsCallable(functions, '<tên>')`. Tất cả đều yêu cầu đã đăng nhập.

### `banUser`
Khóa hoặc mở khóa tài khoản người dùng. Chỉ Admin mới được gọi. Không thể tự ban chính mình.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `userId` | String | ID người dùng cần xử lý |
| `action` | `"ban"` \| `"unban"` | Hành động. Mặc định `"ban"` |

Khi `ban`: cập nhật `status = "banned"`, thu hồi refresh token, xóa FCM token, xóa toàn bộ friend requests pending, set offline trên RTDB.
Khi `unban`: chỉ cập nhật `status = "active"`.

---

### `resolveReport`
Xử lý (chấp nhận) một báo cáo vi phạm. Chỉ Admin. Báo cáo phải đang ở trạng thái `pending`.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `reportId` | String | ID báo cáo |
| `resolution` | String | Nội dung kết quả xử lý. Mặc định `"Đã xử lý"` |
| `action` | `"delete_content"` \| `"warn_user"` \| `"ban_user"` | Hành động xử lý. Mặc định `"delete_content"` |

Sau khi xử lý: cập nhật report `status = "resolved"`, thực hiện hành động tương ứng, gửi thông báo + push cho cả người báo cáo lẫn người bị xử lý.

---

### `rejectReport`
Từ chối một báo cáo vi phạm (không phát hiện vi phạm). Chỉ Admin.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `reportId` | String | ID báo cáo |

Cập nhật report `status = "rejected"`, `resolution = "Không phát hiện vi phạm"`, gửi thông báo + push cho người báo cáo.

---

### `searchUsers`
Tìm kiếm người dùng theo email chính xác (exact match). Lọc bỏ tài khoản bị ban, người dùng bị block hai chiều.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `searchTerm` | String | Email cần tìm (tối thiểu 1 ký tự) |
| `currentUserId` | String | ID người đang tìm (để lọc block) |

Trả về `{ users: User[] }`.

---

### `generateFriendSuggestions`
Tạo danh sách gợi ý kết bạn dựa trên cosine similarity của `userVector`. Kết quả được cache vào document của user. Nếu user chưa có `userVector`, trả về danh sách ngẫu nhiên từ các user active.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `limit` | Number | Số lượng gợi ý tối đa. Min `1`, max `50`. Mặc định `20` |

Trả về `{ userId, count, suggestionIds: string[] }`.

Lọc bỏ: chính mình, bạn bè hiện tại, người đã bị block bởi mình, người đã block mình.
Sau khi tính toán: ghi `suggestedFriends` và `suggestionsLastUpdated` vào document user.
Có REST fallback tự động khi Admin SDK không khả dụng (lỗi token/network).

---

### `generateZegoToken`
Tạo token xác thực ZegoCloud cho cuộc gọi. Chỉ được tạo token cho chính mình (`userId` phải khớp với `auth.uid`). Token có hiệu lực 3600 giây.

| Param | Type | Mô tả |
| :---- | :--- | :----- |
| `roomId` | String | ID phòng gọi |
| `userId` | String | ID người dùng |
| `userName` | String | Tên hiển thị trong cuộc gọi |

Trả về `{ token: string }`.

---

## 2. Firestore Triggers

Tự động kích hoạt khi dữ liệu Firestore thay đổi.

### `onUserProfileUpdated`
Trigger: `users/{userId}` — onDocumentWritten

Khi thông tin hồ sơ (sở thích, địa điểm, trường học, thế hệ) của người dùng thay đổi hoặc chưa có vector:
- Phân tích và tổng hợp thông tin thành mô tả văn bản.
- Gọi API Google Generative AI (mô hình `gemini-embedding-2-preview`) để sinh vector nhúng (embedding).
- Cập nhật trường `userVector` vào document người dùng để phục vụ hệ thống AI gợi ý kết bạn.

---

### `onPostWrite`
Trigger: `posts/{postId}` — onDocumentWritten

Xử lý các trường hợp:
- **Tạo mới**: Fan-out bài viết vào `feeds` của tác giả và toàn bộ bạn bè (bỏ qua bạn bè đang ẩn hoạt động của tác giả).
- **Soft-delete** (`status` chuyển sang `"deleted"`): Xóa bài khỏi tất cả feeds (bao gồm cả feed của tác giả).
- **Đổi visibility `friends` → `private`**: Xóa khỏi feeds của bạn bè, **giữ lại feed của tác giả** (để tác giả vẫn thấy bài viết PRIVATE của mình).
- **Đổi visibility `private` → `friends`**: Fan-out lại cho bạn bè.
- **Cập nhật nội dung/media** (không đổi visibility): Cập nhật `updatedAt` trong feeds để kích hoạt listener phía client.

---

### `onFriendWrite`
Trigger: `users/{userId}/friends/{friendId}` — onDocumentWritten

- **Thêm bạn**: Fan-out tối đa 100 bài viết `active + friends` gần nhất của bạn mới vào feed của user.
- **Xóa bạn**: Xóa toàn bộ bài viết của bạn cũ khỏi feed của user.

---

### `onBlockedUserWrite`
Trigger: `users/{userId}/blockedUsers/{blockedUid}` — onDocumentWritten

Đồng bộ feed khi thay đổi block options:
- `hideTheirActivity` bật: Xóa bài của người bị ẩn khỏi feed của mình.
- `hideTheirActivity` tắt: Khôi phục bài vào feed (nếu hai bên vẫn là bạn bè).
- `blockViewMyActivity` bật: Xóa bài của mình khỏi feed của người bị chặn xem.
- `blockViewMyActivity` tắt: Khôi phục bài vào feed của họ (nếu vẫn là bạn bè).

---

### `onPostReactionWrite`
Trigger: `posts/{postId}/reactions/{userId}` — onDocumentWritten

- Tăng/giảm `reactionCount` trên post.
- Khi thêm reaction mới (không phải tự react bài của mình): tạo notification + push cho tác giả bài viết.

---

### `onCommentReactionWrite`
Trigger: `comments/{commentId}/reactions/{userId}` — onDocumentWritten

- Tăng/giảm `reactionCount` trên comment.
- Khi thêm reaction mới (không phải tự react comment của mình): tạo notification + push cho tác giả bình luận.

---

### `onCommentWrite`
Trigger: `comments/{commentId}` — onDocumentWritten

- **Tạo mới**: Tăng `commentCount` trên post (và `replyCount` trên comment cha nếu là reply). Gửi notification + push cho `replyToUserId` (nếu là reply) hoặc tác giả bài viết.
- **Soft-delete** (`status` chuyển sang `"deleted"`): Giảm counter tương ứng, xóa toàn bộ notifications liên quan đến comment đó. Nếu đây là bình luận gốc, tự động tiến hành **xóa dây chuyền (cascade soft-delete)** toàn bộ các bình luận phản hồi (replies) bên trong.

---

### `onFriendRequestWrite`
Trigger: `friendRequests/{reqId}` — onDocumentWritten

- **Tạo mới**: Gửi notification + push cho người nhận.
- **Xóa** (hủy/từ chối): Dọn sạch notifications liên quan đến request đó.
- **Cập nhật** (`pending` → `accepted`): Gửi notification + push cho người gửi lời mời (thông báo đã được chấp nhận).

---

### `onReportCreated`
Trigger: `reports/{reportId}` — onDocumentCreated

Khi có báo cáo mới: gửi notification + push đến tất cả tài khoản có `role = "admin"`.

---

## 3. RTDB Triggers

### `onMessageCreated`
Trigger: `/messages/{convId}/{msgId}` — onValueCreated

Khi có tin nhắn mới (không phải `system`, không phải đã thu hồi):
- Với tin nhắn `call`: chỉ gửi push khi `status = "started"`, bỏ qua các trạng thái khác.
- Kiểm tra `isMuted` của từng thành viên trong `user_chats`.
- Nếu có `@mention` trong nhóm: gửi push loại `mention` cho người được nhắc (bỏ qua mute).
- Các thành viên còn lại (không bị mute): gửi push loại `chat`.
- Không lưu notification vào Firestore (chỉ push).

---

## 4. Scheduled Functions

### `systemCleanup`
Lịch: **Mỗi Chủ nhật lúc 03:00 (Asia/Ho_Chi_Minh)**

Dọn dẹp định kỳ theo 4 bước:
1. Xóa notifications đã đọc (`isRead = true`) cũ hơn **90 ngày**.
2. Xóa friend requests `pending` cũ hơn **30 ngày**.
3. Hard-delete posts đã soft-delete (`status = "deleted"`) cũ hơn **90 ngày** — bao gồm xóa file media trên Storage và toàn bộ sub-collection `reactions`.
4. Hard-delete comments đã soft-delete cũ hơn **90 ngày** — bao gồm xóa ảnh đính kèm trên Storage và sub-collection `reactions`.
