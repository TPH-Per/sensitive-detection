# Firebase Functions

Tài liệu này giải thích ý nghĩa và cách sử dụng các Cloud Functions trong hệ thống.

## Notifications (Thông báo)

Các function này tự động chạy ngầm (triggered) khi có thay đổi dữ liệu trên Firestore để tạo thông báo tương ứng cho người dùng. Không cần gọi trực tiếp từ client.

- **`onPostReactionWrite`**: Chạy khi có người thả cảm xúc vào bài viết. Tạo/xóa thông báo tương ứng.
- **`onCommentReactionWrite`**: Chạy khi có người thả cảm xúc vào bình luận bài viết. Tạo/xóa thông báo tương ứng.
- **`onCommentWrite`**: Chạy khi có bình luận mới hoặc bình luận bị xóa. Tạo thông báo cho chủ bài viết hoặc người được phản hồi.
- **`onFriendRequestWrite`**: Chạy khi trạng thái lời mời kết bạn thay đổi (gửi mới, chấp nhận). Tạo cập nhật thông báo kết bạn.
- **`onReportCreated`**: Chạy khi có báo cáo vi phạm mới được tạo. Gửi thông báo cho hệ thống admin.
- **`onMessageCreated`**: Chạy khi có tin nhắn mới trong nhóm chat/cá nhân. Chỉ gửi push (chat/mention), không lưu notification vào Firestore.

## Posts (Bài viết & Tương tác)

Các function này tự động chạy ngầm để đồng bộ dữ liệu thống kê (denormalization) nhằm tối ưu hiệu suất đọc.

- **`onPostWrite`**: Đồng bộ số lượng bài viết, cập nhật feed cho bạn bè.
- **`onFriendWrite`**: Cập nhật danh sách bạn bè, tự động điều chỉnh quyền riêng tư của các bài viết trên News Feed.
- **`onBlockedUserWrite`**: Chạy khi chặn người dùng. Chịu trách nhiệm dọn dẹp News Feed, ẩn bài viết và tương tác của người bị chặn.

## Admin (Quản trị hệ thống)

Các function dành riêng cho quyền quản trị viên.

- **`resolveReport`**: Gọi khi admin đồng ý xử lý một báo cáo vi phạm. Áp dụng hình phạt (xóa bài, khóa tài khoản).
- **`rejectReport`**: Gọi khi admin từ chối báo cáo vi phạm. Đóng báo cáo mà không có hành động.
- **`banUser`**: Gọi để khóa tài khoản người dùng ngay lập tức.

## Call (Cuộc gọi Video/Voice)

- **`generateZegoToken`**: Gọi trực tiếp (Callable Function) từ client để lấy token xác thực SDK ZegoCloud cho chức năng gọi điện.
  - **Request Payload**:
    ```json
    {
      "roomId": "string",
      "userId": "string",
      "userName": "string"
    }
    ```
  - **Response**: `{ "token": "string" }`

## Search & System

- **`searchUsers`**: Gọi trực tiếp (Callable Function) từ client khi người dùng tìm kiếm bạn bè theo email exact match, có lọc block hai chiều.
  - **Request Payload**:
    ```json
    {
      "searchTerm": "string (email)",
      "currentUserId": "string (tùy chọn, để lọc user bị chặn)"
    }
    ```
  - **Response**:
    ```json
    {
      "users": [
        {
          "id": "string",
          "fullName": "string",
          "avatar": "string",
          "email": "string",
          "status": "string"
        }
      ]
    }
    ```
- **`systemCleanup`**: Tự động chạy theo lịch để dọn dẹp dữ liệu cũ và các bản ghi hết hạn.
