import { db } from '../app';

export const DIRECT_MESSAGE_BLOCK_REASON = {
    BLOCKED_BY_RECEIVER: 'Bạn đã bị người này chặn tin nhắn.',
    BLOCKED_BY_SENDER: 'Bạn đang chặn tin nhắn của người này.',
    RECEIVER_STRANGER_DISABLED: 'Tin nhắn chưa được gửi vì người này không nhận tin nhắn từ người lạ.'
} as const;

export const getDirectMessageBlockReason = async (senderId: string, receiverId: string): Promise<string | null> => {
    const [receiverBlockDoc, senderBlockDoc] = await Promise.all([
        db.collection('users').doc(receiverId).collection('blockedUsers').doc(senderId).get(),
        db.collection('users').doc(senderId).collection('blockedUsers').doc(receiverId).get()
    ]);

    const isBlockedByReceiver = receiverBlockDoc.exists && receiverBlockDoc.data()?.blockMessages === true;
    if (isBlockedByReceiver) {
        return DIRECT_MESSAGE_BLOCK_REASON.BLOCKED_BY_RECEIVER;
    }

    const isBlockedBySender = senderBlockDoc.exists && senderBlockDoc.data()?.blockMessages === true;
    if (isBlockedBySender) {
        return DIRECT_MESSAGE_BLOCK_REASON.BLOCKED_BY_SENDER;
    }

    const friendDoc = await db.collection('users').doc(receiverId).collection('friends').doc(senderId).get();
    if (friendDoc.exists) {
        return null;
    }

    const receiverSettingsDoc = await db.collection('users').doc(receiverId).collection('private').doc('settings').get();
    const allowFromStrangers = receiverSettingsDoc.data()?.['allowMessagesFromStrangers'] ?? true;
    if (!allowFromStrangers) {
        return DIRECT_MESSAGE_BLOCK_REASON.RECEIVER_STRANGER_DISABLED;
    }

    return null;
};