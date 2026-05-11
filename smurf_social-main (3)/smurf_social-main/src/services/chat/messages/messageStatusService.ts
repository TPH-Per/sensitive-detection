import { ref, get, update, query, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from '../../../firebase/config';
import { RtdbMessage } from '../../../../shared/types';
import { userService } from '../../userService';
import { getRtdbServerTimestamp, getServerSyncedNow } from '../chatTime';

export const messageStatusService = {
    markAsRead: async (convId: string, uid: string, lastMsgId?: string): Promise<void> => {
        try {
            const settings = await userService.getUserSettings(uid);
            const now = getServerSyncedNow();

            const messagesRef = ref(rtdb, `messages/${convId}`);
            const lastMessagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(50));
            const snapshot = await get(lastMessagesQuery);

            const updates: Record<string, any> = {
                [`user_chats/${uid}/${convId}/unreadCount`]: 0,
                [`user_chats/${uid}/${convId}/updatedAt`]: getRtdbServerTimestamp(),
                [`conversations/${convId}/updatedAt`]: getRtdbServerTimestamp()
            };

            if (lastMsgId) {
                updates[`user_chats/${uid}/${convId}/lastReadMsgId`] = lastMsgId;
            }

            if (snapshot.exists()) {
                snapshot.forEach((childSnap) => {
                    const msgId = childSnap.key!;
                    const msgData = childSnap.val() as RtdbMessage;

                    if (msgData.senderId === uid) return;

                    if (!msgData.deliveredTo?.[uid]) {
                        updates[`messages/${convId}/${msgId}/deliveredTo/${uid}`] = now;
                    }

                    if (settings.showReadReceipts && !msgData.readBy?.[uid]) {
                        updates[`messages/${convId}/${msgId}/readBy/${uid}`] = now;
                    }
                });
            }

            const lastMsgPath = `conversations/${convId}/lastMessage`;
            const lastMsgSnap = await get(ref(rtdb, lastMsgPath));
            if (lastMsgSnap.exists()) {
                const lastMsg = lastMsgSnap.val();
                if (lastMsg.senderId !== uid) {
                    if (!lastMsg.deliveredTo?.[uid]) {
                        updates[`${lastMsgPath}/deliveredTo/${uid}`] = now;
                    }
                    if (settings.showReadReceipts && !lastMsg.readBy?.[uid]) {
                        updates[`${lastMsgPath}/readBy/${uid}`] = now;
                    }
                }
            }

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi markAsRead:', error);
            throw error;
        }
    },

    markAsDelivered: async (convId: string, uid: string): Promise<void> => {
        try {
            const messagesRef = ref(rtdb, `messages/${convId}`);
            const lastMessagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(20));
            const snapshot = await get(lastMessagesQuery);

            if (!snapshot.exists()) return;

            const updates: Record<string, any> = {};
            let hasUpdates = false;

            snapshot.forEach((childSnap) => {
                const msgId = childSnap.key!;
                const msgData = childSnap.val() as RtdbMessage;

                if (msgData.senderId !== uid && !msgData.deliveredTo?.[uid]) {
                    updates[`messages/${convId}/${msgId}/deliveredTo/${uid}`] = getRtdbServerTimestamp();
                    hasUpdates = true;
                }
            });

            const lastMsgPath = `conversations/${convId}/lastMessage`;
            const lastMsgSnap = await get(ref(rtdb, lastMsgPath));

            if (lastMsgSnap.exists()) {
                const lastMsg = lastMsgSnap.val();
                if (lastMsg.senderId !== uid && !lastMsg.deliveredTo?.[uid]) {
                    updates[`${lastMsgPath}/deliveredTo/${uid}`] = getRtdbServerTimestamp();
                    hasUpdates = true;
                }
            }

            if (hasUpdates) {
                updates[`conversations/${convId}/updatedAt`] = getRtdbServerTimestamp();
                await update(ref(rtdb), updates);
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi markAsDelivered:', error);
            throw error;
        }
    }
};
