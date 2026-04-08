import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';
import { User } from '../types';

/**
 * Tìm kiếm người dùng theo email
 */
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

      let users = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as User))
        .filter((u) => u.id !== currentUserId && u.status !== 'banned');

      if (currentUserId && users.length > 0) {
        const blockedUsersSnap = await db
          .collection('users')
          .doc(currentUserId)
          .collection('blockedUsers')
          .get();

        const myHiddenUsers = new Set(
          blockedUsersSnap.docs
            .filter(d => d.data().hideTheirActivity === true)
            .map(d => d.id)
        );

        users = users.filter((u) => !myHiddenUsers.has(u.id));

        if (users.length > 0) {
          const safeUsers: User[] = [];

          for (const targetUser of users) {
            const targetBlockedSnap = await db
              .collection('users')
              .doc(targetUser.id)
              .collection('blockedUsers')
              .doc(currentUserId)
              .get();

            if (!targetBlockedSnap.exists || targetBlockedSnap.data()?.blockViewMyActivity !== true) {
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
