# BÁO CÁO THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE SCHEMA)

**Dự án:** Ứng dụng Mạng Xã Hội (Mobile & Web)
**Kiến trúc Dữ liệu:** Hybrid (Firestore + Realtime Database)

## I. TỔNG QUAN KIẾN TRÚC

Hệ thống lưu trữ bao gồm **tổng cộng 19 bảng/node** dữ liệu lồng nhau, chia thành 2 nhóm chính:

1. **Cloud Firestore (14 Bảng):** Dùng để lưu trữ dữ liệu tĩnh, cấu trúc phức tạp, cần query nhiều chiều (Người dùng, Bảng tin, Bài viết, Bình luận, Báo cáo, Thông báo). Áp dụng kiến trúc **Fan-out** cho Bảng tin. Gồm 6 collections gốc và 8 sub-collections.
2. **Realtime Database (5 Node):** Dùng chuyên biệt cho **Hệ thống Chat và Hiện diện** (Trạng thái Online, Tin nhắn, Đã xem/Đang gõ, Signaling cuộc gọi). Giúp hệ thống chịu tải hàng triệu tin nhắn mà không bị quá giới hạn quota đọc/ghi của Firestore.
3. **Cloud Storage:** Lưu trữ file vật lý.

---

## II. ĐẶC TẢ OBJECT MEDIA (DÙNG CHUNG) lưu trữ trong Cloud Storage

Mọi tệp tin (ảnh, video, tệp đính kèm chat) đều lưu dưới dạng Object này để quản lý giới hạn và tự động làm mờ ảnh nhạy cảm

```json
{
  "url": "https://firebasestorage...",
  "fileName": "tailieu_hoctap.pdf",
  "mimeType": "application/pdf",
  "size": 2048576, // Dùng để chặn nếu Ảnh > 5MB, Video > 50MB, File > 10MB
  "thumbnailUrl": "...", // (Chỉ có ở Video)
  "isSensitive": false // Cờ đánh dấu nội dung nhạy cảm
}
```

---

## III. FIRESTORE SCHEMA (Dữ liệu Core & Mạng Xã Hội)

### 1. Collection `users` (Quản lý Hồ sơ)

_Mô tả: Lưu trữ thông tin định danh, tài khoản và hồ sơ cá nhân của người dùng trên toàn hệ thống._

- `uid` (String, **Required**): Document ID (Firebase Auth UID).
- `email` (String, **Required**): Dùng để đăng nhập và tìm kiếm chính xác duy nhất.
- `fullName` (String, **Required**): Tên hiển thị (Max 50 ký tự), mặc định `""`.
- `avatar` (MediaObject, **Required**): Ảnh đại diện. Luôn có Object, mặc định các field bên trong rỗng.
- `cover` (MediaObject, **Required**): Ảnh bìa. Luôn có Object, mặc định các field bên trong rỗng.
- `status` (String Enum, **Required**): `"active"`, `"banned"`.
- `role` (String Enum, **Required**): `"user"`, `"admin"`.
- `gender` (String Enum, _Optional_): `"male"`, `"female"`.
- `bio` (String, _Optional_): Tiểu sử (Max 500 ký tự).
- `location` (String, _Optional_): Vị trí.
- `dob` (Timestamp, _Optional_): Ngày sinh.
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).

**1.1. Sub-collection `private/fcm` (Bên trong `users/{uid}`)**

- `fcmTokens` (Array of String, **Required**): Danh sách token của các thiết bị.
- `updatedAt` (Timestamp, **Required**).

**1.2. Sub-collection `private/settings` (Bên trong `users/{uid}`)**

- `showOnlineStatus` (Boolean, **Required**).
- `showReadReceipts` (Boolean, **Required**).
- `defaultPostVisibility` (String Enum, **Required**): `"public"`, `"friends"`, `"private"`.
- `updatedAt` (Timestamp, **Required**).

**1.3. Sub-collection `friends` (Bên trong `users/{uid}`)**

- `friendId` (String, **Required**): Document ID.
- `createdAt` (Timestamp, **Required**).

**1.4. Sub-collection `blockedUsers` (Bên trong `users/{uid}`)**

- `blockedUid` (String, **Required**): Document ID (UID người bị chặn).
- `blockMessages` (Boolean, **Required**): Mặc định `false`.
- `blockCalls` (Boolean, **Required**): Mặc định `false`.
- `blockViewMyActivity` (Boolean, **Required**): Mặc định `false`.
- `hideTheirActivity` (Boolean, **Required**): Mặc định `false`.
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).

**1.5. Sub-collection `feeds` (Bên trong `users/{uid}` - Bảng tin Fan-out)**

- `postId` (String, **Required**).
- `authorId` (String, **Required**).
- `createdAt` (Timestamp, **Required**).

### 2. Collection `friendRequests`

_Mô tả: Quản lý các lời mời kết bạn đang chờ, đã chấp nhận hoặc bị từ chối giữa 2 người dùng._

- `id` (String, **Required**): Document ID.
- `senderId` (String, **Required**).
- `receiverId` (String, **Required**).
- `status` (String Enum, **Required**): `"pending"`, `"accepted"`, `"rejected"`.
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).

### 3. Collection `posts`

_Mô tả: Bảng trung tâm lưu diễn đàn bài viết/trạng thái (Status/Feed) của người dùng._

- `id` (String, **Required**): Document ID.
- `authorId` (String, **Required**).
- `type` (String Enum, **Required**): `"regular"`, `"avatar_update"`, `"cover_update"`. Mặc định `"regular"`.
- `content` (String, **Required**): Mặc định chuỗi rỗng `""`.
- `status` (String Enum, **Required**): `"active"`, `"deleted"`.
- `visibility` (String Enum, **Required**): `"public"`, `"friends"`, `"private"`.
- `commentCount` (Int Number, **Required**): Mặc định `0`.
- `media` (Array of MediaObject, _Optional_).
- `isEdited` (Boolean, _Optional_).
- `editedAt` (Timestamp, _Optional_).
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).
- `deletedAt` (Timestamp, _Optional_).
- `deletedBy` (String, _Optional_).

**3.1. Sub-collection `reactions` (Bên trong `posts/{postId}`)**

- `userId` (String, **Required**): Document ID.
- `type` (String Enum, **Required**): `"like"`, `"love"`, `"haha"`, `"wow"`, `"sad"`, `"angry"`.
- `createdAt` (Timestamp, **Required**).

### 4. Collection `comments`

_Mô tả: Chứa mọi bình luận của bài viết. Áp dụng cấu trúc phẳng (Flat structure) kết hợp `parentId` để làm tính năng Reply Comment 1 cấp._

- `id` (String, **Required**): Document ID.
- `postId` (String, **Required**).
- `authorId` (String, **Required**).
- `content` (String, **Required**).
- `status` (String Enum, **Required**): `"active"`, `"deleted"`.
- `parentId` (String, _Optional_): Không tồn tại nếu là bình luận gốc.
- `image` (MediaObject, _Optional_).
- `replyCount` (Int Number, **Required**): Mặc định `0`.
- `isEdited` (Boolean, _Optional_).
- `editedAt` (Timestamp, _Optional_).
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).
- `deletedAt` (Timestamp, _Optional_).
- `deletedBy` (String, _Optional_).

**4.1. Sub-collection `reactions` (Bên trong `comments/{commentId}`)**

- `userId` (String, **Required**): Document ID.
- `type` (String Enum, **Required**): `"like"`, `"love"`, `"haha"`, `"wow"`, `"sad"`, `"angry"`.
- `createdAt` (Timestamp, **Required**).

### 5. Collection `reports` (Quản trị viên)

_Mô tả: Lưu các vé báo cáo (Report Ticket) của người dùng về nội dung/tài khoản vi phạm để Admin duyệt._

- `id` (String, **Required**): Document ID.
- `reporterId` (String, **Required**).
- `targetType` (String Enum, **Required**): `"post"`, `"comment"`, `"user"`.
- `targetId` (String, **Required**).
- `targetOwnerId` (String, **Required**).
- `reason` (String Enum, **Required**): `"spam"`, `"harassment"`, `"hate_speech"`, `"sensitive"`, `"scam_impersonation"`, `"other"`.
- `status` (String Enum, **Required**): `"pending"`, `"resolved"`, `"rejected"`.
- `description` (String, _Optional_).
- `images` (Array of MediaObject, _Optional_).
- `createdAt` (Timestamp, **Required**).
- `updatedAt` (Timestamp, **Required**).
- `resolvedAt` (Timestamp, _Optional_).
- `resolvedBy` (String, _Optional_).
- `resolution` (String, _Optional_).

### 6. Collection `notifications`

_Mô tả: Lưu trữ mọi thông báo (Tương tác, Hệ thống) đẩy tới chuông thông báo của User._

- `id` (String, **Required**): Document ID.
- `receiverId` (String, **Required**).
- `actorId` (String, **Required**).
- `type`: enum (`reaction`, `comment`, `friend_request`, `system`, `report`)
- `data`: map (chứa `postId`, `commentId`, `friendRequestId`, `reportId`, `contentSnippet`)
- `isRead` (Boolean, **Required**): Mặc định `false`.
- `createdAt` (Timestamp, **Required**).

---

## IV. REALTIME DATABASE SCHEMA (Hệ thống Chat & Tốc độ cao)

```json
{
  "presence": {
    // Mô tả: Lưu trạng thái Online/Offline và lần truy cập cuối cùng của User.
    "uid_1": {
      "isOnline": true, // Required
      "lastSeen": 1678900000000 // Required
    }
  },

  "conversations": {
    // Mô tả: Lưu cấu trúc Core của Nhóm chat và Chat 1-1, cấu hình Group, snippet tin nhắn mới nhất để hiển thị ra list Inbox.
    "conv_id_1": {
      "isGroup": true, // Required
      "creatorId": "uid_1", // Required
      "createdAt": 1678900000000, // Required
      "updatedAt": 1678900000000, // Required
      "members": {
        // Required (Record<string, "admin" | "member">)
        "uid_1": "admin",
        "uid_2": "member"
      },
      "name": "Nhóm Đồ Án", // Optional
      "avatar": { "url": "...", "isSensitive": false }, // Optional
      "isDisbanded": false, // Optional (Mặc định false, true khi giải tán)
      "typing": {
        // Optional (Record<string, number>)
        "uid_2": 1678900050000
      },
      "lastMessage": {
        // Optional
        "senderId": "uid_1", // Required
        "content": "Chào mọi người", // Required
        "type": "text", // Enum: "text", "image", "video", "file", "voice", "system", "call"
        "timestamp": 1678900000000, // Required
        "messageId": "msg_id_1", // Optional
        "readBy": {
          // Optional
          "uid_2": 1678900100000
        },
        "deliveredTo": {
          // Optional
          "uid_2": 1678900050000
        }
      },
      "activeCall": {
        // Optional - Tồn tại khi cuộc gọi đang diễn ra
        "callerId": "uid_1", // Required
        "callType": "video", // Enum: "voice", "video"
        "messageId": "msg_id_1", // ID của tin nhắn bong bóng đang active
        "startedAt": 1678900000000, // Required (timestamp)
        "participants": {
          // Record<userId, true> - Danh sách người thực tế đang trong phòng
          "uid_1": true,
          "uid_2": true
        }
      }
    }
  },

  "messages": {
    // Mô tả: Nơi lưu raw data từng cục tin nhắn riêng lẻ được gắn theo ID nhóm chat. Giúp scale khi cuộc hội thoại đạt hàng triệu tin.
    "conv_id_1": {
      "msg_id_1": {
        "senderId": "uid_1", // Required
        "type": "text", // Enum: "text", "image", "video", "file", "voice", "system", "call"
        "content": "Nội dung...", // Required
        "createdAt": 1678900000000, // Required
        "media": [], // Optional
        "mentions": ["uid_2"], // Optional
        "isForwarded": false, // Optional
        "replyToId": "msg_id_old", // Optional
        "isEdited": false, // Optional
        "isRecalled": false, // Optional
        "deletedBy": {
          // Optional (Record<string, true>)
          "uid_2": true
        },
        "readBy": {
          // Optional
          "uid_2": 1678900100000
        },
        "deliveredTo": {
          // Optional
          "uid_2": 1678900050000
        },
        "reactions": {
          // Optional
          "uid_2": "haha"
        },
        "updatedAt": 1678900000000 // Optional
      }
    }
  },

  "user_chats": {
    // Mô tả: Bảng Metadata cắm theo cấu trúc của User. Điểm danh/Lập chỉ mục các setting riêng lẻ (Ghim, Tắt thông báo, Unread) của User đó đối với 1 cuộc hội thoại.
    "uid_1": {
      "conv_id_1": {
        "isPinned": true, // Required
        "isMuted": false, // Required
        "isArchived": false, // Required
        "unreadCount": 5, // Required
        "lastMsgTimestamp": 1678900000000, // Required
        "lastReadMsgId": "msg_id_1", // Required (can be null)
        "clearedAt": 1678900000000 // Optional
      }
    }
  },

  "call_signaling": {
    // Mô tả: Bảng tạm (Ephemeral) để báo hiệu cuộc gọi tới các User đang online (như chuông điện thoại reo).
    "uid_2": {
      "callerId": "uid_1", // Required
      "callerName": "Nguyen Van A", // Required
      "callerAvatar": "https://...", // Required
      "conversationId": "conv_id_1", // Required
      "callType": "voice", // Enum: "voice", "video"
      "status": "ringing", // Enum: "ringing", "accepted", "rejected", "ended"
      "timestamp": 1678900000000, // Required
      "zegoToken": "eyJhb...", // Optional
      "isGroupCall": false // Optional (Mặc định false)
    }
  }
}
```
