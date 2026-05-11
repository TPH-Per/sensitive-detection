import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../app';
import { UserStatus } from '../types';
import { banUserById } from '../helpers/adminHelper';

/** Khóa hoặc mở khóa tài khoản người dùng */
export const banUser = onCall(
  {
    region: 'asia-southeast1',
    cors: true,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Không có quyền Admin');
    }

    const { userId, action = 'ban' } = request.data as {
      userId: string;
      action?: 'ban' | 'unban';
    };

    if (!userId) throw new HttpsError('invalid-argument', 'Thiếu userId');
    if (userId === request.auth.uid) throw new HttpsError('invalid-argument', 'Không thể tự ban chính mình');

    if (action === 'ban') {
      await banUserById(userId);
    } else {
      await db.collection('users').doc(userId).update({
        status: UserStatus.ACTIVE
      });
    }

    return { success: true, action };
  }
);
