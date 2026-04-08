# Đối chiếu User Model Flutter và Web

## Mục tiêu
Tài liệu này mô tả sự khác nhau giữa model lưu user của app Flutter và model user hiện tại của project web, đồng thời chỉ ra chính xác những field web cần bổ sung để:

1. deploy chức năng gợi ý bạn bè trên Cloud Function,
2. đồng bộ schema profile gần như 1:1 giữa Flutter và web,
3. giữ cấu trúc hiện tại của web ít thay đổi nhất có thể.

## Kết luận nhanh
- Nếu mục tiêu **chỉ để chạy friend suggestions**, web cần tối thiểu thêm:
  - `userVector?: number[]`
  - `suggestedFriends?: string[]`
- Nếu muốn **đồng bộ gần 1:1 với Flutter**, web nên bổ sung thêm:
  - `school?: string`
  - `maritalStatus?: MaritalStatus`
  - `interests?: string[]`
  - `generation?: string`

## So sánh trực tiếp

### Flutter
File tham chiếu: [klcn/lib/models/user_model.dart](../klcn/lib/models/user_model.dart)

Flutter hiện đang lưu user theo lớp `UserModel` với các field chính:
- `id`
- `fullName`
- `email`
- `avatar`
- `cover`
- `bio`
- `location`
- `school`
- `maritalStatus`
- `interests`
- `gender`
- `dob`
- `generation`
- `status`
- `role`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `settings`
- `userVector`
- `suggestedFriends`

### Web hiện tại
File tham chiếu: [smurf_social-main/shared/types.ts](../smurf_social-main/shared/types.ts)

Web hiện đang định nghĩa `User` với các field:
- `id`
- `fullName`
- `email`
- `avatar?`
- `cover?`
- `bio?`
- `location?`
- `gender?`
- `dob?`
- `status`
- `role`
- `createdAt`
- `updatedAt`
- `deletedAt?`

Web đang **thiếu** các field liên quan đến profile mở rộng và friend suggestion.

## Thiết kế đề xuất cho web

### 1) Field bắt buộc cho friend suggestions
| Field | Kiểu dữ liệu đề xuất | Ý nghĩa |
|---|---|---|
| `userVector` | `number[]` | Vector hồ sơ dùng cho cosine similarity trong Cloud Function |
| `suggestedFriends` | `string[]` | Danh sách `userId` được gợi ý và lưu cache trên document user |

### 2) Field bổ sung để đồng bộ gần 1:1 với Flutter
| Field | Kiểu dữ liệu đề xuất | Ghi chú |
|---|---|---|
| `school` | `string` | Trường học / nơi học |
| `maritalStatus` | `MaritalStatus` | Enum đồng bộ giữa web và Flutter |
| `interests` | `string[]` | Danh sách sở thích |
| `generation` | `string` | Nhãn thế hệ, ví dụ: `gen_z`, `millennial`, `gen_x` |

### 3) Enum cần thêm trên web
Flutter đang có `MaritalStatus`, nên web nên thêm enum tương ứng với các giá trị sau:
- `none`
- `single`
- `married`
- `divorced`
- `widowed`
- `other`

Khuyến nghị lưu dưới dạng string để đồng bộ dễ với Firestore và Flutter.

## Thiết kế riêng cho `generation`
`generation` nên được lưu dưới dạng **chuỗi tùy chọn** (`string?`) thay vì enum cứng ngay từ đầu.

Lý do:
- dữ liệu này thường phục vụ phân loại hồ sơ, không phải logic hệ thống lõi,
- dễ thay đổi label theo sản phẩm hoặc thị trường,
- Cloud Function gợi ý bạn bè chỉ cần đọc giá trị, không cần ràng buộc kiểu quá chặt.

Ví dụ giá trị hợp lệ:
- `gen_z`
- `millennial`
- `gen_x`
- `boomer`

Nếu sau này business ổn định, có thể chuyển sang enum ở cả web và Flutter.

## Gợi ý xử lý settings
Flutter đang để `settings` trong `UserModel`, còn web hiện tách riêng ở subcollection `private/settings`.

Khuyến nghị:
- **Giữ nguyên web theo cách hiện tại** để tránh refactor lớn,
- chỉ bổ sung các field profile/suggestion vào `User`,
- nếu cần đồng bộ thêm sau này thì mới cân nhắc thêm `settings?: UserSettings` vào `User`.

## Điểm cần chú ý khi triển khai
1. Cloud Function gợi ý bạn bè sẽ đọc `userVector` và ghi `suggestedFriends`.
2. Web UI chỉ cần hiển thị `suggestedFriends` nếu muốn cache danh sách gợi ý gần nhất.
3. Nếu các field mới chưa có dữ liệu cũ, code nên fallback an toàn:
   - `userVector = []` hoặc bỏ qua khi tính điểm,
   - `suggestedFriends = []`,
   - `generation`, `school`, `maritalStatus`, `interests` có thể là `undefined`.

## Kết luận đề xuất
Nếu chỉ ưu tiên deploy friend suggestion, web cần thêm **2 field tối thiểu**: `userVector` và `suggestedFriends`.

Nếu muốn đồng bộ profile giữa Flutter và web để dùng lâu dài, nên bổ sung thêm:
- `school`
- `maritalStatus`
- `interests`
- `generation`

Tài liệu này có thể dùng làm cơ sở chốt schema với team và xác nhận với quản lý trước khi sửa code.
