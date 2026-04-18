import { rtdb } from '../app';

type GuardMessage = {
    senderId?: string;
    type?: string;
    content?: string;
    createdAt?: number;
    readBy?: Record<string, number>;
    deliveredTo?: Record<string, number>;
    deletedBy?: Record<string, true>;
};

type AppendBlockedSystemMessageParams = {
    conversationId: string;
    senderId: string;
    receiverId: string;
    blockReason: string;
    conversationUpdatedAt?: number;
};

const mapSortedMessages = (raw: unknown): Array<{ id: string; data: GuardMessage }> => {
    if (!raw || typeof raw !== 'object') return [];

    return Object.entries(raw as Record<string, unknown>)
        .map(([id, data]) => ({ id, data: (data || {}) as GuardMessage }))
        .sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0));
};

const getLatestVisibleMessage = (
    messages: Array<{ id: string; data: GuardMessage }>,
    userId: string,
): { id: string; data: GuardMessage } | null => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const item = messages[i];
        if (item.data.deletedBy?.[userId] === true) continue;
        return item;
    }
    return null;
};

const toLastMessagePayload = (id: string, data: GuardMessage) => ({
    senderId: data.senderId || 'system',
    content: data.content || '',
    type: data.type || 'text',
    timestamp: data.createdAt || Date.now(),
    messageId: id,
    readBy: data.readBy || {},
    deliveredTo: data.deliveredTo || {},
});

export const appendBlockedSystemMessage = async ({
    conversationId,
    senderId,
    receiverId,
    blockReason,
    conversationUpdatedAt,
}: AppendBlockedSystemMessageParams): Promise<void> => {
    const remainingSnap = await rtdb
        .ref(`/messages/${conversationId}`)
        .orderByChild('createdAt')
        .limitToLast(50)
        .once('value');

    const remainingMessages = mapSortedMessages(remainingSnap.val());
    const latestVisibleForReceiver = getLatestVisibleMessage(remainingMessages, receiverId);

    const now = Date.now();
    const systemRef = rtdb.ref(`/messages/${conversationId}`).push();

    await systemRef.set({
        senderId: 'system',
        type: 'system',
        content: blockReason,
        createdAt: now,
        updatedAt: now,
        deletedBy: { [receiverId]: true },
        readBy: {},
        deliveredTo: {},
    });

    const updates: Record<string, unknown> = {
        [`/conversations/${conversationId}/lastMessage`]: latestVisibleForReceiver
            ? toLastMessagePayload(latestVisibleForReceiver.id, latestVisibleForReceiver.data)
            : null,
        [`/conversations/${conversationId}/updatedAt`]: latestVisibleForReceiver?.data.createdAt || conversationUpdatedAt || now,
        [`/user_chats/${senderId}/${conversationId}/lastMsgTimestamp`]: now,
        [`/user_chats/${senderId}/${conversationId}/updatedAt`]: now,
        [`/user_chats/${senderId}/${conversationId}/isArchived`]: false,
        [`/user_chats/${receiverId}/${conversationId}/lastMsgTimestamp`]: latestVisibleForReceiver?.data.createdAt || 0,
        [`/user_chats/${receiverId}/${conversationId}/updatedAt`]: now,
    };

    if (!latestVisibleForReceiver) {
        updates[`/user_chats/${receiverId}/${conversationId}/unreadCount`] = 0;
    }

    await rtdb.ref().update(updates);
};
