# BÁO CÁO THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

**Dự án:** Ứng dụng Mạng Xã Hội (Mobile & Web)
**Kiến trúc Dữ liệu:** Hybrid (Firestore + Realtime Database)

## I. TỔNG QUAN KIẾN TRÚC

Hệ thống lưu trữ bao gồm **tổng cộng 19 collection/node** dữ liệu lồng nhau, chia thành 2 nhóm chính:

1. **Cloud Firestore (14 Collection):** Dùng để lưu trữ dữ liệu tĩnh, cấu trúc phức tạp, cần query nhiều chiều (Người dùng, Bảng tin, Bài viết, Bình luận, Báo cáo, Thông báo). Áp dụng kiến trúc **Fan-out** cho Bảng tin. Gồm 6 collections gốc và 8 sub-collections.
2. **Realtime Database (5 Node):** Dùng chuyên biệt cho **Hệ thống Chat và Hiện diện** (Trạng thái Online, Tin nhắn, Đã xem/Đang gõ, Signaling cuộc gọi). Giúp hệ thống chịu tải hàng triệu tin nhắn mà không bị quá giới hạn quota đọc/ghi của Firestore.
3. **Cloud Storage:** Lưu trữ file vật lý.

---

## II. ĐẶC TẢ OBJECT MEDIA (DÙNG CHUNG) lưu trữ trong Cloud Storage

Mọi tệp tin (ảnh, video, tệp đính kèm chat) đều lưu dưới dạng Object này để quản lý giới hạn và tự động làm mờ ảnh nhạy cảm.

| Field          | Type    | Required/Optional | Description/Default                                           |
| :------------- | :------ | :---------------- | :------------------------------------------------------------ |
| `url`          | String  | **Required**      | Link Firebase Storage                                         |
| `fileName`     | String  | _Optional_        | Tên file gốc                                                  |
| `mimeType`     | String  | _Optional_        | Định dạng file                                                |
| `size`         | Number  | _Optional_        | Kích thước (Byte). Chặn: Ảnh > 5MB, Video > 50MB, File > 10MB |
| `thumbnailUrl` | String  | _Optional_        | Ảnh thu nhỏ (Chỉ dành cho Video)                              |
| `isSensitive`  | Boolean | **Required**      | Đánh dấu nội dung nhạy cảm. Mặc định `false`                  |

---

## III. FIRESTORE SCHEMA (Dữ liệu Core & Mạng Xã Hội)

### 1. Collection `users` (Quản lý Hồ sơ)

_Mô tả: Lưu trữ thông tin định danh, tài khoản và hồ sơ cá nhân của người dùng trên toàn hệ thống._

| Field       | Type        | Required/Optional | Description/Default                        |
| :---------- | :---------- | :---------------- | :----------------------------------------- |
| `uid`       | String      | **Required**      | Document ID (Firebase Auth UID)            |
| `email`     | String      | **Required**      | Dùng để đăng nhập và tìm kiếm              |
| `fullName`  | String      | **Required**      | Tên hiển thị (Max 50 ký tự), mặc định `""` |
| `avatar`    | MediaObject | _Optional_        | Ảnh đại diện                               |
| `cover`     | MediaObject | _Optional_        | Ảnh bìa                                    |
| `status`    | String Enum | **Required**      | `"active"`, `"banned"`                     |
| `role`      | String Enum | **Required**      | `"user"`, `"admin"`. Mặc định `"user"`     |
| `gender`    | String Enum | _Optional_        | `"male"`, `"female"`, `""`                 |
| `bio`       | String      | _Optional_        | Tiểu sử (Max 500 ký tự). Mặc định `""`     |
| `location`  | String      | _Optional_        | Vị trí. Mặc định `""`                      |
| `dob`       | Timestamp   | _Optional_        | Ngày sinh                                  |
| `createdAt` | Timestamp   | **Required**      | Thời điểm tạo                              |
| `updatedAt` | Timestamp   | **Required**      | Thời điểm cập nhật                         |

**1.1. Sub-collection `private/fcm` (Bên trong `users/{uid}`)**

| Field       | Type          | Required/Optional | Description/Default              |
| :---------- | :------------ | :---------------- | :------------------------------- |
| `fcmTokens` | Array<String> | **Required**      | Danh sách token của các thiết bị |
| `createdAt` | Timestamp     | **Required**      | Thời điểm tạo                    |
| `updatedAt` | Timestamp     | **Required**      | Thời điểm cập nhật               |

**1.2. Sub-collection `private/settings` (Bên trong `users/{uid}`)**

| Field                   | Type        | Required/Optional | Description/Default                                       |
| :---------------------- | :---------- | :---------------- | :-------------------------------------------------------- |
| `showOnlineStatus`      | Boolean     | **Required**      | Trạng thái online                                         |
| `showReadReceipts`      | Boolean     | **Required**      | Đã xem tin nhắn. Mặc định `true`                          |
| `defaultPostVisibility` | String Enum | **Required**      | `"public"`, `"friends"`, `"private"`. Mặc định `"public"` |
| `createdAt`             | Timestamp   | **Required**      | Thời điểm tạo                                             |
| `updatedAt`             | Timestamp   | **Required**      | Thời điểm cập nhật                                        |

**1.3. Sub-collection `friends` (Bên trong `users/{uid}`)**

| Field       | Type      | Required/Optional | Description/Default    |
| :---------- | :-------- | :---------------- | :--------------------- |
| `friendId`  | String    | **Required**      | Document ID của bạn bè |
| `createdAt` | Timestamp | **Required**      | Thời điểm tạo          |
| `updatedAt` | Timestamp | **Required**      | Thời điểm cập nhật     |

**1.4. Sub-collection `blockedUsers` (Bên trong `users/{uid}`)**

| Field                 | Type      | Required/Optional | Description/Default                   |
| :-------------------- | :-------- | :---------------- | :------------------------------------ |
| `blockedUid`          | String    | **Required**      | Document ID người bị chặn             |
| `blockMessages`       | Boolean   | **Required**      | Chặn tin nhắn. Mặc định `false`       |
| `blockCalls`          | Boolean   | **Required**      | Chặn cuộc gọi. Mặc định `false`       |
| `blockViewMyActivity` | Boolean   | **Required**      | Chặn xem hoạt động. Mặc định `false`  |
| `hideTheirActivity`   | Boolean   | **Required**      | Ẩn hoạt động của họ. Mặc định `false` |
| `createdAt`           | Timestamp | **Required**      | Thời điểm tạo                         |
| `updatedAt`           | Timestamp | **Required**      | Thời điểm cập nhật                    |

**1.5. Sub-collection `feeds` (Bên trong `users/{uid}` - Bảng tin Fan-out)**

| Field       | Type      | Required/Optional | Description/Default |
| :---------- | :-------- | :---------------- | :------------------ |
| `postId`    | String    | **Required**      | ID bài viết         |
| `authorId`  | String    | **Required**      | ID tác giả          |
| `createdAt` | Timestamp | **Required**      | Thời điểm tạo       |
| `updatedAt` | Timestamp | **Required**      | Thời điểm cập nhật  |

### 2. Collection `friendRequests`

_Mô tả: Quản lý các lời mời kết bạn đang chờ, đã chấp nhận hoặc bị từ chối giữa 2 người dùng._

| Field        | Type        | Required/Optional | Description/Default                                           |
| :----------- | :---------- | :---------------- | :------------------------------------------------------------ |
| `id`         | String      | **Required**      | Document ID                                                   |
| `senderId`   | String      | **Required**      | ID người gửi                                                  |
| `receiverId` | String      | **Required**      | ID người nhận                                                 |
| `status`     | String Enum | **Required**      | `"pending"`, `"accepted"`, `"rejected"`. Mặc định `"pending"` |
| `createdAt`  | Timestamp   | **Required**      | Thời điểm tạo                                                 |
| `updatedAt`  | Timestamp   | **Required**      | Thời điểm cập nhật                                            |

### 3. Collection `posts`

_Mô tả: Bảng trung tâm lưu diễn đàn bài viết/trạng thái (Status/Feed) của người dùng._

| Field          | Type               | Required/Optional | Description/Default                              |
| :------------- | :----------------- | :---------------- | :----------------------------------------------- |
| `id`           | String             | **Required**      | Document ID                                      |
| `authorId`     | String             | **Required**      | ID tác giả                                       |
| `type`         | String Enum        | **Required**      | `"regular"`, `"avatar_update"`, `"cover_update"` |
| `content`      | String             | **Required**      | Nội dung văn bản. Mặc định `""`                  |
| `status`       | String Enum        | **Required**      | `"active"`, `"deleted"`                          |
| `visibility`   | String Enum        | **Required**      | `"public"`, `"friends"`, `"private"`             |
| `commentCount` | Number             | **Required**      | Số lượng bình luận. Mặc định `0`                 |
| `media`        | Array<MediaObject> | _Optional_        | Danh sách hình ảnh/video                         |
| `createdAt`    | Timestamp          | **Required**      | Thời điểm tạo                                    |
| `updatedAt`    | Timestamp          | **Required**      | Thời điểm cập nhật                               |
| `deletedAt`    | Timestamp          | _Optional_        | Thời điểm xóa                                    |
| `deletedBy`    | String             | _Optional_        | ID người thực hiện xóa                           |

**3.1. Sub-collection `reactions` (Bên trong `posts/{postId}`)**

| Field       | Type        | Required/Optional | Description/Default                                       |
| :---------- | :---------- | :---------------- | :-------------------------------------------------------- |
| `userId`    | String      | **Required**      | Document ID của người tương tác                           |
| `type`      | String Enum | **Required**      | `"like"`, `"love"`, `"haha"`, `"wow"`, `"sad"`, `"angry"` |
| `createdAt` | Timestamp   | **Required**      | Thời điểm tạo                                             |
| `updatedAt` | Timestamp   | **Required**      | Thời điểm cập nhật                                        |

### 4. Collection `comments`

_Mô tả: Chứa mọi bình luận của bài viết. Áp dụng cấu trúc phẳng (Flat structure) kết hợp `parentId` để làm tính năng Reply Comment 1 cấp._

| Field           | Type        | Required/Optional | Description/Default                      |
| :-------------- | :---------- | :---------------- | :--------------------------------------- |
| `id`            | String      | **Required**      | Document ID                              |
| `postId`        | String      | **Required**      | ID bài viết                              |
| `authorId`      | String      | **Required**      | ID tác giả                               |
| `content`       | String      | **Required**      | Nội dung bình luận                       |
| `status`        | String Enum | **Required**      | `"active"`, `"deleted"`                  |
| `parentId`      | String      | _Optional_        | ID bình luận gốc duy nhất (nếu là reply) |
| `replyToUserId` | String      | _Optional_        | ID người nhận phản hồi (A -> B)          |
| `replyToId`     | String      | _Optional_        | ID comment được phản hồi cụ thể          |
| `image`         | MediaObject | _Optional_        | Hình ảnh đính kèm                        |
| `replyCount`    | Number      | **Required**      | Số lượng phản hồi. Mặc định `0`          |
| `createdAt`     | Timestamp   | **Required**      | Thời điểm tạo                            |
| `updatedAt`     | Timestamp   | **Required**      | Thời điểm cập nhật                       |
| `deletedAt`     | Timestamp   | _Optional_        | Thời điểm xóa                            |
| `deletedBy`     | String      | _Optional_        | ID người thực hiện xóa                   |

**4.1. Sub-collection `reactions` (Bên trong `comments/{commentId}`)**

| Field       | Type        | Required/Optional | Description/Default                                       |
| :---------- | :---------- | :---------------- | :-------------------------------------------------------- |
| `userId`    | String      | **Required**      | Document ID của người tương tác                           |
| `type`      | String Enum | **Required**      | `"like"`, `"love"`, `"haha"`, `"wow"`, `"sad"`, `"angry"` |
| `createdAt` | Timestamp   | **Required**      | Thời điểm tạo                                             |
| `updatedAt` | Timestamp   | **Required**      | Thời điểm cập nhật                                        |

### 5. Collection `reports` (Quản trị viên)

_Mô tả: Lưu các vé báo cáo (Report Ticket) của người dùng về nội dung/tài khoản vi phạm để Admin duyệt._

| Field           | Type               | Required/Optional | Description/Default                                                                          |
| :-------------- | :----------------- | :---------------- | :------------------------------------------------------------------------------------------- |
| `id`            | String             | **Required**      | Document ID                                                                                  |
| `reporterId`    | String             | **Required**      | ID người báo cáo                                                                             |
| `targetType`    | String Enum        | **Required**      | `"post"`, `"comment"`, `"user"`                                                              |
| `targetId`      | String             | **Required**      | ID của đối tượng bị báo cáo                                                                  |
| `targetOwnerId` | String             | **Required**      | ID chủ sở hữu đối tượng                                                                      |
| `reason`        | String Enum        | **Required**      | `"spam"`, `"harassment"`, `"hate_speech"`, `"sensitive"`, `"scam_impersonation"`, `"other"`. |
| `status`        | String Enum        | **Required**      | `"pending"`, `"resolved"`, `"rejected"`. Mặc định `"pending"`                                |
| `description`   | String             | _Optional_        | Mô tả chi tiết                                                                               |
| `images`        | Array<MediaObject> | _Optional_        | Ảnh minh họa vi phạm                                                                         |
| `createdAt`     | Timestamp          | **Required**      | Thời điểm tạo                                                                                |
| `updatedAt`     | Timestamp          | **Required**      | Thời điểm cập nhật                                                                           |
| `resolvedAt`    | Timestamp          | _Optional_        | Thời điểm xử lý                                                                              |
| `resolvedBy`    | String             | _Optional_        | ID Admin xử lý                                                                               |
| `resolution`    | String             | _Optional_        | Kết quả xử lý                                                                                |

### 6. Collection `notifications`

_Mô tả: Lưu trữ mọi thông báo (Tương tác, Hệ thống) đẩy tới chuông thông báo của User._

| Field        | Type        | Required/Optional | Description/Default                                                                                                                  |
| :----------- | :---------- | :---------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | String      | **Required**      | Document ID                                                                                                                          |
| `receiverId` | String      | **Required**      | ID người nhận                                                                                                                        |
| `actorId`    | String      | **Required**      | ID người thực hiện hành động (Nếu là hệ thống thì để `"system"`)                                                                     |
| `type`       | String Enum | **Required**      | `reaction`, `comment`, `friend_request`, `system`, `report`. (Lưu ý: Loại `chat` và `mention` chỉ gửi Push, không lưu vào Firestore) |
| `data`       | Map         | **Required**      | Chứa `postId`, `commentId`, `friendRequestId`, `contentSnippet`, `reportId`, `targetTypeLabel`, `reasonLabel`, `resolution`.         |
| `isRead`     | Boolean     | **Required**      | Đã đọc hay chưa. Mặc định `false`                                                                                                    |
| `createdAt`  | Timestamp   | **Required**      | Thời điểm tạo                                                                                                                        |
| `updatedAt`  | Timestamp   | **Required**      | Thời điểm cập nhật                                                                                                                   |

---

## IV. REALTIME DATABASE SCHEMA (Hệ thống Chat & Tốc độ cao)

### 1. Node `presence`

_Mô tả: Lưu trạng thái Online/Offline và lần truy cập cuối cùng của User._

| Field       | Type    | Required/Optional | Description/Default         |
| :---------- | :------ | :---------------- | :-------------------------- |
| `isOnline`  | Boolean | **Required**      | Trạng thái trực tuyến       |
| `lastSeen`  | Number  | **Required**      | Timestamp lần cuối truy cập |
| `createdAt` | Number  | **Required**      | Timestamp tạo               |
| `updatedAt` | Number  | **Required**      | Timestamp cập nhật          |

### 2. Node `conversations`

_Mô tả: Lưu cấu trúc Core của Nhóm chat và Chat 1-1, cấu hình Group, snippet tin nhắn mới nhất._

| Field         | Type        | Required/Optional | Description/Default                    |
| :------------ | :---------- | :---------------- | :------------------------------------- |
| `isGroup`     | Boolean     | **Required**      | Có phải nhóm hay không                 |
| `creatorId`   | String      | **Required**      | ID người tạo                           |
| `createdAt`   | Number      | **Required**      | Timestamp tạo                          |
| `updatedAt`   | Number      | **Required**      | Timestamp cập nhật                     |
| `members`     | Map         | **Required**      | Danh sách thành viên (UID: Vai trò)    |
| `name`        | String      | _Optional_        | Tên nhóm                               |
| `avatar`      | MediaObject | _Optional_        | Ảnh đại diện nhóm                      |
| `isDisbanded` | Boolean     | _Optional_        | Đã giải tán hay chưa. Mặc định `false` |
| `typing`      | Map         | _Optional_        | Trạng thái đang gõ (UID: Timestamp)    |
| `lastMessage` | Object      | _Optional_        | Snippet tin nhắn mới nhất              |
| `activeCall`  | Object      | _Optional_        | Thông tin cuộc gọi đang diễn ra        |

### 3. Node `messages`

_Mô tả: Nơi lưu raw data từng cục tin nhắn riêng lẻ được gắn theo ID nhóm chat._

| Field         | Type        | Required/Optional | Description/Default                                                                                                       |
| :------------ | :---------- | :---------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `senderId`    | String      | **Required**      | ID người gửi                                                                                                              |
| `type`        | String Enum | **Required**      | `text`, `image`, `video`, `file`, `voice`, `system`, `call`                                                               |
| `content`     | String      | **Required**      | Nội dung tin nhắn                                                                                                         |
| `createdAt`   | Number      | **Required**      | Timestamp tạo                                                                                                             |
| `media`       | Array       | _Optional_        | Danh sách file đính kèm                                                                                                   |
| `mentions`    | Array       | _Optional_        | Danh sách UID được nhắc tên                                                                                               |
| `isForwarded` | Boolean     | _Optional_        | Tin nhắn chuyển tiếp                                                                                                      |
| `replyToId`   | String      | _Optional_        | ID tin nhắn phản hồi                                                                                                      |
| `isEdited`    | Boolean     | _Optional_        | Đã chỉnh sửa. Mặc định `false`                                                                                            |
| `isRecalled`  | Boolean     | _Optional_        | Đã thu hồi. Mặc định `false`                                                                                              |
| `deletedBy`   | Map         | _Optional_        | Danh sách người đã xóa (UID: true)                                                                                        |
| `readBy`      | Map         | _Optional_        | Trạng thái đã xem (UID: Timestamp)                                                                                        |
| `deliveredTo` | Map         | _Optional_        | Trạng thái đã phát (UID: Timestamp)                                                                                       |
| `payload`     | Object      | _Optional_        | **Chỉ dành cho `type: call`**: `{ callType, status, duration }`. Status: `started`, `ended`, `missed`, `rejected`, `busy` |
| `reactions`   | Map         | _Optional_        | Cảm xúc (UID: Type)                                                                                                       |
| `updatedAt`   | Number      | **Required**      | Timestamp cập nhật                                                                                                        |

### 4. Node `user_chats`

_Mô tả: Bảng Metadata cắm theo cấu trúc của User (Ghim, Tắt thông báo, Unread)._

| Field              | Type    | Required/Optional | Description/Default                 |
| :----------------- | :------ | :---------------- | :---------------------------------- |
| `isPinned`         | Boolean | **Required**      | Ghim hội thoại                      |
| `isMuted`          | Boolean | **Required**      | Tắt thông báo                       |
| `isArchived`       | Boolean | **Required**      | Lưu trữ hội thoại. Mặc định `false` |
| `unreadCount`      | Number  | **Required**      | Số tin chưa đọc. Mặc định `0`       |
| `lastMsgTimestamp` | Number  | **Required**      | Timestamp tin nhắn cuối             |
| `lastReadMsgId`    | String  | _Optional_        | ID tin nhắn cuối đã đọc             |
| `clearedAt`        | Number  | **Required**      | Timestamp dọn dẹp (Mặc định `0`)    |
| `createdAt`        | Number  | **Required**      | Timestamp tạo                       |
| `updatedAt`        | Number  | **Required**      | Timestamp cập nhật                  |

### 5. Node `call_signaling`

_Mô tả: Bảng tạm (Ephemeral) để báo hiệu cuộc gọi tới các User._

| Field            | Type        | Required/Optional | Description/Default                                |
| :--------------- | :---------- | :---------------- | :------------------------------------------------- |
| `callerId`       | String      | **Required**      | ID người gọi                                       |
| `callerName`     | String      | **Required**      | Tên người gọi                                      |
| `callerAvatar`   | String      | **Required**      | Ảnh người gọi                                      |
| `conversationId` | String      | **Required**      | ID hội thoại                                       |
| `callType`       | String Enum | **Required**      | `voice`, `video`                                   |
| `status`         | String Enum | **Required**      | `ringing`, `accepted`, `rejected`, `ended`, `busy` |
| `timestamp`      | Number      | **Required**      | Timestamp tín hiệu                                 |
| `isGroupCall`    | Boolean     | _Optional_        | Gọi nhóm. Mặc định `false`                         |
| `createdAt`      | Number      | **Required**      | Timestamp tạo                                      |
| `updatedAt`      | Number      | **Required**      | Timestamp cập nhật                                 |
