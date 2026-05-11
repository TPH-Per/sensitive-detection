import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';
import { User } from '../types';

/** Tìm kiếm người dùng chính xác theo địa chỉ email */
export const searchUsers = onCall(
  {
    region: 'asia-southeast1',
    cors: true,
    invoker: 'public'
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

      return { users };
    } catch (error) {
      console.error('[searchUsers] Lỗi:', error);
      throw new HttpsError('internal', 'Lỗi tìm kiếm người dùng');
    }
  }
);
