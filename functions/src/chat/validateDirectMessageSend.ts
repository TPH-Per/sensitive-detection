import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { rtdb } from '../app';
import { getDirectMessageBlockReason } from './directMessagePolicy';
import { appendBlockedSystemMessage } from './directMessageBlockFeedback';

type ValidateDirectMessageSendRequest = {
    conversationId?: string;
};

const DIRECT_MESSAGE_BLOCKED_CODE = 'chat/direct-message-blocked';

const parseDirectMemberIds = (conversationId: string): string[] => {
    if (!conversationId.startsWith('direct_')) return [];
    return conversationId.replace('direct_', '').split('_').filter(Boolean);
};

const ensureDirectConversation = async (
    conversationId: string,
    senderId: string,
    receiverId: string,
): Promise<number> => {
    const now = Date.now();
    const conversationRef = rtdb.ref(`/conversations/${conversationId}`);
    const conversationSnap = await conversationRef.get();

    if (conversationSnap.exists()) {
        const conversationData = conversationSnap.val() as { updatedAt?: number };
        return Number(conversationData?.updatedAt || now);
    }

    const updates: Record<string, unknown> = {
        [`/conversations/${conversationId}`]: {
            isGroup: false,
            name: null,
            avatar: null,
            creatorId: senderId,
            members: {
                [senderId]: 'admin',
                [receiverId]: 'member',
            },
            typing: {},
            lastMessage: null,
            createdAt: now,
            updatedAt: now,
        },
        [`/user_chats/${senderId}/${conversationId}`]: {
            isPinned: false,
            isMuted: false,
            isArchived: false,
            unreadCount: 0,
            lastReadMsgId: null,
            lastMsgTimestamp: now,
            clearedAt: 0,
            createdAt: now,
            updatedAt: now,
        },
        [`/user_chats/${receiverId}/${conversationId}`]: {
            isPinned: false,
            isMuted: false,
            isArchived: false,
            unreadCount: 0,
            lastReadMsgId: null,
            lastMsgTimestamp: now,
            clearedAt: 0,
            createdAt: now,
            updatedAt: now,
        },
    };

    await rtdb.ref().update(updates);
    return now;
};

export const validateDirectMessageSend = onCall(
    {
        region: 'asia-southeast1',
        cors: true,
    },
    async (request) => {
        if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'Chưa đăng nhập');
        }

        const senderId = request.auth.uid;
        const { conversationId } = (request.data || {}) as ValidateDirectMessageSendRequest;
        const normalizedConversationId = String(conversationId || '').trim();

        if (!normalizedConversationId) {
            throw new HttpsError('invalid-argument', 'Thiếu conversationId');
        }

        if (!normalizedConversationId.startsWith('direct_')) {
            return { allowed: true };
        }

        const memberIds = parseDirectMemberIds(normalizedConversationId);
        if (memberIds.length !== 2 || !memberIds.includes(senderId)) {
            throw new HttpsError('permission-denied', 'Không có quyền gửi vào hội thoại này');
        }

        const receiverId = memberIds.find((id) => id !== senderId);
        if (!receiverId) {
            throw new HttpsError('invalid-argument', 'Không xác định được người nhận');
        }

        const blockReason = await getDirectMessageBlockReason(senderId, receiverId);
        if (!blockReason) {
            return { allowed: true };
        }

        const conversationUpdatedAt = await ensureDirectConversation(normalizedConversationId, senderId, receiverId);

        await appendBlockedSystemMessage({
            conversationId: normalizedConversationId,
            senderId,
            receiverId,
            blockReason,
            conversationUpdatedAt,
        });

        throw new HttpsError('failed-precondition', blockReason, {
            appCode: DIRECT_MESSAGE_BLOCKED_CODE,
            reason: blockReason,
        });
    },
);
