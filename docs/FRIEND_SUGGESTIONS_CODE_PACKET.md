# Friend Suggestions Code Packet

Đây là phần code cần đưa cho anh của bạn để deploy Cloud Function gợi ý bạn bè.

## 1) Source function
File gốc đã có sẵn trong repo:
- [functions/src/friends/generateFriendSuggestions.ts](../functions/src/friends/generateFriendSuggestions.ts)

Đây là callable Cloud Function `generateFriendSuggestions`, region `us-central1`, dùng Firebase Auth và Firestore.

## 2) Export trong index
Cần đảm bảo [functions/src/index.ts](../functions/src/index.ts) có dòng export này:

```ts
export { generateFriendSuggestions } from './friends/generateFriendSuggestions';
```

## 3) Cách deploy
Chỉ cần build rồi deploy functions:

```bash
cd functions
npm install
npm run build
firebase deploy --only functions:generateFriendSuggestions
```

Nếu muốn deploy toàn bộ functions thì dùng:

```bash
firebase deploy --only functions
```

## 4) Ghi chú nhanh
- Code hiện tại đã build thành công.
- Function này ghi kết quả gợi ý vào field `suggestedFriends` trên document user.
- Function đọc `userVector` để chấm similarity.
- Nếu anh bạn chỉ cần quẳng code vào project hiện tại, giữ nguyên file source ở trên và thêm đúng export trong `index.ts` là đủ.
