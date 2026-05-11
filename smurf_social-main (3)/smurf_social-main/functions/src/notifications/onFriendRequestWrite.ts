import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { NotificationType, FriendRequestStatus } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';
import { db } from '../app';


/** Thông báo khi có lời mời kết bạn hoặc chấp nhận kết bạn */
export const onFriendRequestWrite = onDocumentWritten(
    { document: 'friendRequests/{reqId}', region: 'asia-southeast1' },
    async (event) => {
        const before = event.data?.before.data();
        const after = event.data?.after.data();
        const reqId = event.params.reqId;

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

        if (before && after) {
            if (
                before.status === FriendRequestStatus.PENDING &&
                after.status === FriendRequestStatus.ACCEPTED
            ) {
                const { senderId, receiverId } = after;
                try {
                    const acceptorName = await getSenderName(receiverId);
                    const body = buildPushBody(NotificationType.FRIEND_ACCEPT, acceptorName);

                    await createNotification({
                        receiverId: senderId,
                        actorId: receiverId,
                        type: NotificationType.FRIEND_ACCEPT,
                        data: { 
                            friendRequestId: reqId,
                        },
                    });

                    await sendPushNotification({
                        receiverId: senderId,
                        type: NotificationType.FRIEND_ACCEPT,
                        body,
                    });
                } catch (error) {
                    console.error('[onFriendRequestWrite/Update] Lỗi:', error);
                }
            }
        }
    }
);
