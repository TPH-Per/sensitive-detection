import { onValueCreated, DatabaseEvent, DataSnapshot } from 'firebase-functions/v2/database';
import { db, rtdb } from '../app';

// Chặn tin nhắn từ người lạ và hỗ trợ bypass 24h.
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

    const conversationSnap = await rtdb.ref(`/conversations/${conversationId}`).get();
    if (!conversationSnap.exists()) return;

    const conversationData = conversationSnap.val() ?? {};
    if (conversationData['isGroup'] === true) return;

    const membersRaw = conversationData['members'] ?? {};
    const memberIds = Object.keys(membersRaw);
    if (memberIds.length < 2 || !memberIds.includes(senderId)) return;

    const receiverId = memberIds.find((id) => id !== senderId) ?? '';
    if (!receiverId) return;

    const [receiverBlockDoc, senderBlockDoc] = await Promise.all([
        db.collection('users').doc(receiverId).collection('blockedUsers').doc(senderId).get(),
        db.collection('users').doc(senderId).collection('blockedUsers').doc(receiverId).get()
    ]);

    const isBlockedByReceiver = receiverBlockDoc.exists && receiverBlockDoc.data()?.blockMessages === true;
    const isBlockedBySender = senderBlockDoc.exists && senderBlockDoc.data()?.blockMessages === true;

    let blockReason = '';
    if (isBlockedByReceiver) blockReason = 'Bạn đã bị người này chặn tin nhắn.';
    else if (isBlockedBySender) blockReason = 'Bạn đang chặn tin nhắn của người này.';

    if (!blockReason) {
        const friendDoc = await db.collection('users').doc(receiverId).collection('friends').doc(senderId).get();
        if (!friendDoc.exists) {
            const receiverSettingsDoc = await db.collection('users').doc(receiverId).collection('private').doc('settings').get();
            const allowFromStrangers = receiverSettingsDoc.data()?.['allowMessagesFromStrangers'] ?? true;

            if (!allowFromStrangers) {
                const lastMsgsSnap = await rtdb
                    .ref(`/messages/${conversationId}`)
                    .orderByChild('createdAt')
                    .limitToLast(2)
                    .once('value');

                const msgs = lastMsgsSnap.val() || {};
                const sortedMsgs = Object.values(msgs).sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
                
                const previousMsg: any = sortedMsgs.length >= 2 ? sortedMsgs[sortedMsgs.length - 2] : null;
                const isBypassed = previousMsg && 
                                  previousMsg.senderId === receiverId && 
                                  (Date.now() - (previousMsg.createdAt || 0) < 24 * 60 * 60 * 1000);

                if (!isBypassed) {
                    blockReason = 'Tin nhắn chưa được gửi vì người này không nhận tin nhắn từ người lạ.';
                }
            }
        }
    }

    if (blockReason) {
        console.log(`[chatGuard] Chặn tin nhắn: convId=${conversationId}, sender=${senderId}, receiver=${receiverId}, lý do=${blockReason}`);

        await snapshot.ref.remove();

        if (conversationData['lastMessage']?.messageId === messageId) {
            const prevMsgsSnap = await rtdb
                .ref(`/messages/${conversationId}`)
                .orderByChild('createdAt')
                .limitToLast(1)
                .once('value');
            
            const prevMsgs = prevMsgsSnap.val() || {};
            const prevKeys = Object.keys(prevMsgs);
            
            const updates: Record<string, any> = {};
            if (prevKeys.length > 0) {
                const pId = prevKeys[0];
                const pData = prevMsgs[pId];
                updates[`/conversations/${conversationId}/lastMessage`] = {
                    senderId: pData.senderId,
                    content: pData.content,
                    type: pData.type,
                    timestamp: pData.createdAt,
                    messageId: pId,
                    readBy: pData.readBy || {},
                    deliveredTo: pData.deliveredTo || {}
                };
                updates[`/conversations/${conversationId}/updatedAt`] = pData.createdAt;
            } else {
                updates[`/conversations/${conversationId}/lastMessage`] = null;
            }
            await rtdb.ref().update(updates);
        }

        await rtdb.ref(`/messages/${conversationId}`).push().set({
            senderId: 'system',
            type: 'system',
            content: blockReason,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deletedBy: { [receiverId]: true }
        });

        return;
    }

    await rtdb.ref(`/user_chats/${receiverId}/${conversationId}/unreadCount`).transaction((current) => (current || 0) + 1);

    const senderSettingsDoc = await db.collection('users').doc(senderId).collection('private').doc('settings').get();
    const senderAllowsStrangers = senderSettingsDoc.data()?.['allowMessagesFromStrangers'] ?? true;

    if (!senderAllowsStrangers) {
        const senderMsgsSnap = await rtdb.ref(`/messages/${conversationId}`).orderByChild('senderId').equalTo(senderId).limitToLast(2).once('value');
        const msgs = senderMsgsSnap.val() || {};
        const msgKeys = Object.keys(msgs);
        
        if (msgKeys.length === 1 || (msgKeys.length >= 2 && Date.now() - (msgs[msgKeys[msgKeys.length-2]].createdAt || 0) > 24 * 60 * 60 * 1000)) {
            const receiverUserDoc = await db.collection('users').doc(receiverId).get();
            const receiverName = receiverUserDoc.data()?.fullName || 'người này';
            await rtdb.ref(`/messages/${conversationId}`).push().set({
                senderId: 'system',
                type: 'system',
                content: `Trong 24 giờ tới ${receiverName} có thể trả lời tin nhắn của bạn dù bạn đang chặn tin nhắn từ người lạ.`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                deletedBy: { [receiverId]: true }
            });
        }
    }
});