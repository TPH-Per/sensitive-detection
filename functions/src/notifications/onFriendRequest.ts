import { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { NotificationType, FriendRequestStatus } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có lời mời kết bạn
 */
export const onFriendRequestCreated = onDocumentCreated(
  { document: 'friendRequests/{reqId}', region: 'us-central1' },
  async (event) => {
    const request = event.data?.data();
    if (!request) return;

    const reqId = event.params.reqId;
    const { senderId, receiverId } = request;

    try {
      const senderName = await getSenderName(senderId);
      const body = buildPushBody(NotificationType.FRIEND_REQUEST, senderName);

      await createNotification({
        receiverId,
        actorId: senderId,
        type: NotificationType.FRIEND_REQUEST,
        data: { friendRequestId: reqId },
      });

      await sendPushNotification({
        receiverId,
        type: NotificationType.FRIEND_REQUEST,
        body,
        data: { friendRequestId: reqId },
      });
    } catch (error) {
      console.error('[onFriendRequestCreated] Lỗi:', error);
    }
  }
);

export const onFriendRequestUpdated = onDocumentUpdated(
  { document: 'friendRequests/{reqId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    if (
      before.status !== FriendRequestStatus.PENDING ||
      after.status !== FriendRequestStatus.ACCEPTED
    ) {
      return;
    }

    const { senderId, receiverId } = after;
    try {
      const acceptorName = await getSenderName(receiverId);
      const body = buildPushBody(NotificationType.SYSTEM, acceptorName, {
        contentSnippet: `${acceptorName} đã chấp nhận lời mời kết bạn.`
      });

      await createNotification({
        receiverId: senderId,
        actorId: receiverId,
        type: NotificationType.SYSTEM,
        data: { contentSnippet: `${acceptorName} đã chấp nhận lời mời kết bạn.` },
      });

      await sendPushNotification({
        receiverId: senderId,
        type: NotificationType.SYSTEM,
        body,
      });
    } catch (error) {
      console.error('[onFriendRequestUpdated] Lỗi:', error);
    }
  }
);

/**
 * Xử lý khi có lời mời kết bạn bị xóa
 */
export const onFriendRequestDeleted = onDocumentDeleted(
  { document: 'friendRequests/{reqId}', region: 'us-central1' },
  async (event) => {
    const reqId = event.params.reqId;

    try {
      const { db } = await import('../app');

      const notificationsSnapshot = await db.collection('notifications')
        .where('type', '==', NotificationType.FRIEND_REQUEST)
        .where('data.friendRequestId', '==', reqId)
        .get();

      if (notificationsSnapshot.empty) {
        return;
      }

      const batch = db.batch();
      notificationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`[onFriendRequestDeleted] Đã xóa ${notificationsSnapshot.size} thông báo rác cho request ${reqId}`);
    } catch (error) {
      console.error('[onFriendRequestDeleted] Lỗi xóa thông báo:', error);
    }
  }
);
