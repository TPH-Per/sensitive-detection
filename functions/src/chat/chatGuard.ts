import { onValueCreated, DatabaseEvent, DataSnapshot } from 'firebase-functions/v2/database';
import { rtdb } from '../app';
import { getDirectMessageBlockReason } from './directMessagePolicy';
import { appendBlockedSystemMessage } from './directMessageBlockFeedback';

// Chặn tin nhắn direct theo chính sách bạn bè/người lạ.
export const chatMessageGuard = onValueCreated({
    ref: '/messages/{conversationId}/{messageId}',
    region: 'us-central1'
}, async (event: DatabaseEvent<DataSnapshot, { conversationId: string; messageId: string }>) => {
    const snapshot = event.data;
    const conversationId = String(event.params.conversationId ?? '').trim();
    const messageId = String(event.params.messageId ?? '').trim();
    const messageData = snapshot.val() ?? {};
    const senderId = String(messageData['senderId'] ?? '').trim();

    if (conversationId.length === 0 || messageId.length === 0 || senderId.length === 0 || senderId === 'system') {
        return;
    }

    try {
        const conversationSnap = await rtdb.ref(`/conversations/${conversationId}`).get();
        if (!conversationSnap.exists()) return;

        const conversationData = conversationSnap.val() ?? {};
        if (conversationData['isGroup'] === true) return;

        const membersRaw = conversationData['members'] ?? {};
        const memberIds = Object.keys(membersRaw);
        if (memberIds.length < 2 || !memberIds.includes(senderId)) return;

        const receiverId = memberIds.find((id) => id !== senderId) ?? '';
        if (!receiverId) return;

        const blockReason = await getDirectMessageBlockReason(senderId, receiverId);

        if (blockReason) {
            console.log(`[chatGuard] Chặn tin nhắn: convId=${conversationId}, sender=${senderId}, receiver=${receiverId}, lý do=${blockReason}`);

            await snapshot.ref.remove();

            await appendBlockedSystemMessage({
                conversationId,
                senderId,
                receiverId,
                blockReason,
                conversationUpdatedAt: Number(conversationData['updatedAt'] || Date.now()),
            });
            return;
        }

        await rtdb.ref(`/user_chats/${receiverId}/${conversationId}`).transaction((current) => {
            const base = (current && typeof current === 'object') ? current as Record<string, any> : {};
            const unreadCount = Number(base['unreadCount'] || 0) + 1;
            return {
                ...base,
                unreadCount,
                updatedAt: Date.now(),
            };
        });
    } catch (error) {
        console.error(`[chatGuard] Lỗi xử lý message ${conversationId}/${messageId}:`, error);
        try {
            await snapshot.ref.remove();
        } catch (removeError) {
            console.error(`[chatGuard] Không thể remove message lỗi ${conversationId}/${messageId}:`, removeError);
        }
    }
});