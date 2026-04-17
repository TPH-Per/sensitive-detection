# BÁO CÁO CẬP NHẬT LOGIC PHÂN QUYỀN GROUP CHAT

**Ngày cập nhật:** 17/04/2026
**Trạng thái:** Đã hoàn thành (Full-stack)

## 1. Cập nhật cấu trúc dữ liệu (Database Schema)

Hai trường dữ liệu mới đã được thêm vào node `conversations` trong **Realtime Database**:

| Field | Node / Collection | Mô tả chức năng |
| :--- | :--- | :--- |
| `joinApprovalMode` | `conversations/{convId}` | **Chế độ phê duyệt:** Khi bật (`true`), thành viên mới do Member mời sẽ phải chờ Admin/Creator duyệt mới được vào nhóm. |
| `pendingMembers` | `conversations/{convId}` | **Danh sách chờ:** Lưu trữ thông tin người được mời (`uid`) kèm ID người mời (`addedBy`) và thời điểm mời (`timestamp`). |

---

## 2. Bảng phân quyền chi tiết (Role Permissions)

Hệ thống đã được hiện đại hóa để tăng tính linh hoạt cho thành viên thường (Member) trong khi vẫn giữ quyền kiểm soát tối thượng cho Quản trị viên (Admin) và Trưởng nhóm (Creator).

| Tính năng | Thành viên (Member) | Quản trị viên (Admin) | Trưởng nhóm (Creator) |
| :--- | :---: | :---: | :---: |
| **Gửi tin nhắn / Gọi điện** | ✅ | ✅ | ✅ |
| **Sửa tên & Ảnh nhóm** | ✅ | ✅ | ✅ |
| **Mời thành viên mới** | ✅ (Cần duyệt*) | ✅ (Vào thẳng) | ✅ (Vào thẳng) |
| **Xóa thành viên thường** | ❌ | ✅ | ✅ |
| **Xóa Quản trị viên (Admin)** | ❌ | ❌ | ✅ |
| **Bật/Tắt chế độ Phê duyệt** | ❌ | ✅ | ✅ |
| **Duyệt/Từ chối thành viên mới** | ❌ | ✅ | ✅ |
| **Thăng/Hạ chức Admin** | ❌ | ❌ | ✅ |
| **Chuyển quyền Trưởng nhóm** | ❌ | ❌ | ✅ |
| **Giải tán nhóm** | ❌ | ❌ | ✅ |

*\*Ghi chú: Nếu `joinApprovalMode` đang TẮT, Member mời người sẽ được vào ngay.*

---

## 3. Các thay đổi Logic quan trọng

1.  **Chuyển quyền Trưởng nhóm:** Khi Creator chuyển quyền cho người khác, người đó sẽ tự động được cấp quyền Admin (nếu chưa có) và Creator cũ sẽ trở thành một Admin bình thường.
2.  **Logic Tắt phê duyệt:** Khi Admin tắt chế độ `joinApprovalMode`, tất cả người dùng trong danh sách `pendingMembers` sẽ tự động được chấp nhận vào nhóm ngay lập tức để giải phóng hàng đợi.
3.  **Thông báo hệ thống:** Mọi thay đổi về quyền hạn hoặc cài đặt nhóm đều đi kèm với một tin nhắn hệ thống tự động để mọi thành viên đều nắm bắt được diễn biến trong nhóm.
