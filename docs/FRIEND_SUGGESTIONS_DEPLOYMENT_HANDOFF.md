# Friend Suggestions Cloud Function - Deployment Handoff

## Mục đích
Deploy chức năng gợi ý bạn bè lên Firebase Cloud Functions để boss có thể kiểm tra, triển khai và bật sử dụng cho app web / Flutter.

## Function đang có sẵn
- File nguồn: [functions/src/friends/generateFriendSuggestions.ts](../functions/src/friends/generateFriendSuggestions.ts)
- Export chính: [functions/src/index.ts](../functions/src/index.ts)
- Tên callable: `generateFriendSuggestions`
- Region: `us-central1`
- Trigger: `onCall`
- Yêu cầu xác thực: có

## Function làm gì
Function này nhận user hiện tại từ Firebase Auth, sau đó:
- đọc profile của user hiện tại,
- lọc các user đã bị chặn / không hợp lệ / đã là bạn bè,
- sắp xếp candidate bằng cosine similarity trên `userVector`,
- lưu danh sách gợi ý vào field `suggestedFriends` của document user,
- trả về danh sách `userId` được gợi ý.

## Input / Output
### Input
- `limit` là tùy chọn
- giá trị hợp lệ: `1..50`
- mặc định: `20`

### Output
```ts
{
  userId: string;
  count: number;
  suggestionIds: string[];
}
```

## Data phụ thuộc
### Firestore đọc
- `users/{uid}`
- `users/{uid}/friends`
- `users/{uid}/blockedUsers`
- danh sách user active trong collection `users`

### Field cần có trên user document
Tối thiểu để function chạy đúng:
- `status`
- `userVector`

Nếu muốn lưu kết quả gợi ý:
- `suggestedFriends`
- `suggestionsLastUpdated`

## Lưu ý quan trọng
- Function **không tự tạo `userVector`**.
- Nghĩa là trước khi deploy / chạy thật, hệ thống phải có pipeline hoặc client ghi `userVector` vào Firestore.
- Nếu `userVector` không có, function vẫn chạy nhưng chất lượng gợi ý sẽ kém hơn vì không còn xếp hạng theo similarity.
- User bị `banned` sẽ bị từ chối.
- User đã chặn nhau sẽ không xuất hiện trong kết quả.

## Những gì cần bổ sung ở web schema
Trong [shared/types.ts](../shared/types.ts), `User` nên có:
- `userVector?: number[]`
- `suggestedFriends?: string[]`
- `school?: string`
- `maritalStatus?: MaritalStatus`
- `interests?: string[]`
- `generation?: string`

## Cách build và deploy
### Build local
```bash
cd functions
npm install
npm run build
```

### Deploy chỉ riêng function này
```bash
firebase deploy --only functions:generateFriendSuggestions
```

### Hoặc deploy toàn bộ functions
```bash
firebase deploy --only functions
```

## Cách gọi từ client
### Web
```ts
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions(app, 'us-central1');
const generateFriendSuggestions = httpsCallable(functions, 'generateFriendSuggestions');

const result = await generateFriendSuggestions({ limit: 20 });
console.log(result.data);
```

### Flutter
```dart
final functions = FirebaseFunctions.instanceFor(region: 'us-central1');
final result = await functions
    .httpsCallable('generateFriendSuggestions')
    .call({'limit': 20});
```

## Checklist trước khi boss deploy
- [ ] `functions/src/index.ts` đã export `generateFriendSuggestions`
- [ ] `npm run build` pass trong thư mục `functions`
- [ ] `users` document đã có `userVector` cho các user cần gợi ý
- [ ] Web / Flutter schema đã thêm `suggestedFriends`
- [ ] Firebase project đúng môi trường production
- [ ] Deploy xong test lại bằng client thật

## Kết luận
Đây là callable Cloud Function có thể deploy độc lập ngay. Nếu cần dùng cho production ổn định, việc quan trọng nhất là đảm bảo dữ liệu `userVector` được ghi đúng trước khi gọi function.
