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

    const conversationSnap = await rtdb
        .ref(`/conversations/${conversationId}`)
        .get();

    if (!conversationSnap.exists()) {
        return;
    }

    const conversationData = conversationSnap.val() ?? {};
    const isGroup = conversationData['isGroup'] === true;

    if (isGroup) {
        return;
    }

    const membersRaw = conversationData['members'] ?? {};
    const memberIds = Object.keys(membersRaw)
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

    if (memberIds.length < 2 || !memberIds.includes(senderId)) {
        return;
    }

    const receiverId = memberIds.find((id) => id !== senderId) ?? '';
    if (receiverId.length === 0) {
        return;
    }

    const friendDoc = await db
        .collection('users')
        .doc(receiverId)
        .collection('friends')
        .doc(senderId)
        .get();

    if (friendDoc.exists) {
        return;
    }

    const [receiverSettingsDoc, senderSettingsDoc] = await Promise.all([
        db.collection('users').doc(receiverId).collection('private').doc('settings').get(),
        db.collection('users').doc(senderId).collection('private').doc('settings').get()
    ]);

    const allowFromStrangers = receiverSettingsDoc.data()?.['allowMessagesFromStrangers'] ?? true;
    const senderAllowsStrangers = senderSettingsDoc.data()?.['allowMessagesFromStrangers'] ?? true;

    if (!senderAllowsStrangers) {
        const senderMsgsSnap = await rtdb
            .ref(`/messages/${conversationId}`)
            .orderByChild('senderId')
            .equalTo(senderId)
            .limitToLast(2)
            .once('value');

        const msgs = senderMsgsSnap.val() || {};
        const msgKeys = Object.keys(msgs);
        
        let shouldSendNotice = false;
        if (msgKeys.length === 1) {
            shouldSendNotice = true;
        } else if (msgKeys.length >= 2) {
            const sortedKeys = msgKeys.sort((a, b) => (msgs[a]?.createdAt || 0) - (msgs[b]?.createdAt || 0));
            const previousMsg = msgs[sortedKeys[sortedKeys.length - 2]];
            if (previousMsg && Date.now() - (previousMsg.createdAt || 0) > 24 * 60 * 60 * 1000) {
                shouldSendNotice = true;
            }
        }

        if (shouldSendNotice) {
            const receiverUserDoc = await db.collection('users').doc(receiverId).get();
            const receiverName = receiverUserDoc.data()?.fullName || 'người này';
            const systemRef = snapshot.ref.parent?.push();
            if (systemRef) {
                await systemRef.set({
                    senderId: 'system',
                    type: 'system',
                    content: `Trong 24 giờ tới ${receiverName} có thể trả lời tin nhắn của bạn dù bạn đang chặn tin nhắn từ người lạ.`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    deletedBy: { [receiverId]: true }
                });
            }
        }
    }

    if (allowFromStrangers) {
        return;
    }

    const bypassSnapshot = await rtdb
        .ref(`/messages/${conversationId}`)
        .orderByChild('senderId')
        .equalTo(receiverId)
        .limitToLast(1)
        .once('value');

    if (bypassSnapshot.exists()) {
        const bypassMsgs = bypassSnapshot.val() || {};
        const bypassMsgIds = Object.keys(bypassMsgs);
        
        if (bypassMsgIds.length > 0) {
            const lastMsg = bypassMsgs[bypassMsgIds[0]];
            const lastMsgTime = typeof lastMsg?.createdAt === 'number' ? lastMsg.createdAt : 0;
            const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
            
            if (Date.now() - lastMsgTime <= TWENTY_FOUR_HOURS) {
                console.log(`[chatMessageGuard] Bypass 24h: Cho phép người lạ nhắn tin (convId=${conversationId}, senderId=${senderId}, receiverId=${receiverId})`);
                return;
            }
        }
    }

    await snapshot.ref.update({
        [`deletedBy/${receiverId}`]: true
    });

    const systemMessageRef = snapshot.ref.parent?.push();
    if (systemMessageRef) {
        await systemMessageRef.set({
            senderId: 'system',
            type: 'system',
            content: 'Tin nhắn chưa được gửi vì người này không nhận tin nhắn từ người lạ.',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            deletedBy: {
                [receiverId]: true
            }
        });
    }

    console.log(`[chatMessageGuard] Đã chặn tin nhắn từ người lạ: convId=${conversationId}, senderId=${senderId}, receiverId=${receiverId}`);
});