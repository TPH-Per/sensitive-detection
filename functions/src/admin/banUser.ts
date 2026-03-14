import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../app';
import { NotificationType, UserStatus, FriendRequestStatus } from '../types';
import { createNotification } from '../helpers/notificationHelper';

/**
 * Khóa/mở khóa tài khoản
 */
export const banUser = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== 'admin') {
      throw new HttpsError('permission-denied', 'Không có quyền Admin');
    }

    const { userId, action = 'ban' } = request.data as {
      userId: string;
      action?: 'ban' | 'unban';
    };

    if (!userId) throw new HttpsError('invalid-argument', 'Thiếu userId');
    if (userId === request.auth.uid) throw new HttpsError('invalid-argument', 'Không thể tự ban chính mình');

    const adminId = request.auth.uid;

    if (action === 'ban') {
      await db.collection('users').doc(userId).update({
        status: UserStatus.BANNED,
        lastSeen: FieldValue.serverTimestamp()
      });

      await auth.revokeRefreshTokens(userId);

      const sentRequestsQuery = db.collection('friendRequests')
        .where('senderId', '==', userId)
        .where('status', '==', FriendRequestStatus.PENDING);

      const receivedRequestsQuery = db.collection('friendRequests')
        .where('receiverId', '==', userId)
        .where('status', '==', FriendRequestStatus.PENDING);

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        sentRequestsQuery.get(),
        receivedRequestsQuery.get()
      ]);

      const batch = db.batch();

      sentSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      receivedSnapshot.docs.forEach(doc => batch.delete(doc.ref));

      await batch.commit();

      const conversationsQuery = db.collection('conversations')
        .where('isGroup', '==', true)
        .where('participantIds', 'array-contains', userId);

      const conversationsSnapshot = await conversationsQuery.get();

      const conversationBatch = db.batch();
      conversationsSnapshot.docs.forEach(doc => {
        conversationBatch.update(doc.ref, {
          participantIds: FieldValue.arrayRemove(userId),
          adminIds: FieldValue.arrayRemove(userId)
        });
      });

      await conversationBatch.commit();

      await createNotification({
        receiverId: userId,
        actorId: adminId,
        type: NotificationType.SYSTEM,
        data: {
          contentSnippet: 'Tài khoản của bạn đã bị khóa do vi phạm quy định cộng đồng. Vui lòng liên hệ admin để biết thêm chi tiết.'
        }
      });

    } else {
      await db.collection('users').doc(userId).update({
        status: 'active'
      });

      await createNotification({
        receiverId: userId,
        actorId: adminId,
        type: NotificationType.SYSTEM,
        data: {
          contentSnippet: 'Tài khoản của bạn đã được mở khóa. Bạn có thể đăng nhập lại.'
        }
      });
    }

    return { success: true, action };
  }
);
