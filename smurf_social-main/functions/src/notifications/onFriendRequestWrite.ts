import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { NotificationType, FriendRequestStatus } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';
import { db } from '../app';


/**
 * Xử lý tất cả thay đổi trên friendRequests
 */
export const onFriendRequestWrite = onDocumentWritten(
    { document: 'friendRequests/{reqId}', region: 'us-central1' },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const reqId = event.params.reqId;

        // 1. Xử lý CREATE
        if (!before && after) {
            const { senderId, receiverId } = after;
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
                console.error('[onFriendRequestWrite/Create] Lỗi:', error);
            }
            return;
        }

        // 2. Xử lý DELETE
        if (before && !after) {
            try {
                const notificationsSnapshot = await db.collection('notifications')
                    .where('type', '==', NotificationType.FRIEND_REQUEST)
                    .where('data.friendRequestId', '==', reqId)
                    .get();

                if (notificationsSnapshot.empty) return;

                const batch = db.batch();
                notificationsSnapshot.docs.forEach(({ ref }) => batch.delete(ref));
                await batch.commit();
                console.log(`[onFriendRequestWrite/Delete] Đã xóa ${notificationsSnapshot.size} thông báo rác cho request ${reqId}`);
            } catch (error) {
                console.error('[onFriendRequestWrite/Delete] Lỗi:', error);
            }
            return;
        }

        // 3. Xử lý UPDATE (Chấp nhận lời mời)
        if (before && after) {
            if (
                before.status === FriendRequestStatus.PENDING &&
                after.status === FriendRequestStatus.ACCEPTED
            ) {
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
                        data: { 
                            friendRequestId: reqId,
                            contentSnippet: `đã chấp nhận lời mời kết bạn.` 
                        },
                    });

                    await sendPushNotification({
                        receiverId: senderId,
                        type: NotificationType.SYSTEM,
                        body,
                    });
                } catch (error) {
                    console.error('[onFriendRequestWrite/Update] Lỗi:', error);
                }
            }
        }
    }
);
