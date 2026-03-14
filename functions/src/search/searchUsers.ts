import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';

interface SearchResult {
  id: string;
  fullName: string;
  avatar: string;
  email: string;
  status?: string;
}

// Thay thế getDocs toàn collection — tìm user theo email chính xác
export const searchUsers = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

    const { searchTerm, currentUserId } = request.data as {
      searchTerm: string;
      currentUserId?: string;
    };

    if (!searchTerm || searchTerm.trim().length < 1) {
      throw new HttpsError('invalid-argument', 'Vui lòng nhập từ khóa tìm kiếm');
    }

    try {
      const snap = await db
        .collection('users')
        .where('email', '==', searchTerm.toLowerCase().trim())
        .limit(10)
        .get();

      let users: SearchResult[] = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as SearchResult))
        .filter((u) => u.id !== currentUserId && u.status !== 'banned');

      if (currentUserId && users.length > 0) {
        // Get blocked users from subcollection
        const blockedUsersSnap = await db
          .collection('users')
          .doc(currentUserId)
          .collection('blockedUsers')
          .get();

        const myBlockedUsers: string[] = blockedUsersSnap.docs.map(doc => doc.id);

        users = users.filter((u) => !myBlockedUsers.includes(u.id));

        if (users.length > 0) {
          const safeUsers: SearchResult[] = [];

          for (const targetUser of users) {
            // Check if target user has blocked current user
            const targetBlockedSnap = await db
              .collection('users')
              .doc(targetUser.id)
              .collection('blockedUsers')
              .doc(currentUserId)
              .get();

            if (!targetBlockedSnap.exists) {
              safeUsers.push(targetUser);
            }
          }

          users = safeUsers;
        }
      }

      return { users };
    } catch (error) {
      console.error('[searchUsers] Lỗi:', error);
      throw new HttpsError('internal', 'Lỗi tìm kiếm người dùng');
    }
  }
);
