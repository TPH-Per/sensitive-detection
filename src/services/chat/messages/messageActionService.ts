import { ref, set, get, update, push, increment } from 'firebase/database';
import { rtdb } from '../../../firebase/config';
import { RtdbMessage, RtdbConversation, MessageType } from '../../../../shared/types';
import { TIME_LIMITS } from '../../../constants';
import { updateConversationAfterMessage } from './messageHelpers';

export const messageActionService = {
    recallMessage: async (convId: string, msgId: string, uid: string): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}`);
            const msgSnap = await get(msgRef);

            if (!msgSnap.exists()) {
                throw new Error('Tin nhắn không tồn tại');
            }

            const msgData = msgSnap.val() as RtdbMessage;

            if (msgData.senderId !== uid) {
                throw new Error('Chỉ người gửi mới được thu hồi tin nhắn');
            }

            await update(msgRef, {
                content: '',
                media: [],
                isRecalled: true,
                updatedAt: Date.now()
            });

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            if (convSnap.exists()) {
                const conv = convSnap.val() as RtdbConversation;
                if (conv.lastMessage && conv.lastMessage.messageId === msgId) {
                    await update(convRef, {
                        'lastMessage/content': 'Tin nhắn đã thu hồi',
                        updatedAt: Date.now()
                    });
                }
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi recallMessage:', error);
            throw error;
        }
    },

    deleteForMe: async (convId: string, msgId: string, uid: string): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}/deletedBy/${uid}`);
            await set(msgRef, true);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi deleteForMe:', error);
            throw error;
        }
    },

    editMessage: async (convId: string, msgId: string, uid: string, newContent: string): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}`);
            const msgSnap = await get(msgRef);

            if (!msgSnap.exists()) {
                throw new Error('Tin nhắn không tồn tại');
            }

            const msgData = msgSnap.val() as RtdbMessage;

            if (msgData.senderId !== uid) {
                throw new Error('Chỉ người gửi mới được chỉnh sửa tin nhắn');
            }

            const now = Date.now();
            const diffInMillis = now - msgData.createdAt;

            if (diffInMillis > TIME_LIMITS.MESSAGE_EDIT_WINDOW) {
                throw new Error(
                    `Đã hết thời gian chỉnh sửa (tối đa ${TIME_LIMITS.MESSAGE_EDIT_WINDOW / (1000 * 60)} phút)`
                );
            }

            await update(msgRef, {
                content: newContent,
                isEdited: true,
                updatedAt: now
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi editMessage:', error);
            throw error;
        }
    },

    forwardMessage: async (
        targetConvId: string,
        senderId: string,
        srcMsg: RtdbMessage
    ): Promise<string> => {
        try {
            const newMsgRef = push(ref(rtdb, `messages/${targetConvId}`));
            const msgId = newMsgRef.key!;

            const messageData: RtdbMessage = {
                senderId,
                type: srcMsg.type,
                content: srcMsg.content,
                media: srcMsg.media || [],
                mentions: [],
                isForwarded: true,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            let displayContent = srcMsg.content;
            if (srcMsg.type === MessageType.IMAGE) {
                const media = srcMsg.media || [];
                const videoCount = media.filter(m => m.mimeType?.startsWith('video/')).length;
                const imageCount = media.filter(m => m.mimeType?.startsWith('image/')).length;
                displayContent = videoCount > 0 && imageCount > 0
                    ? '[Album Media]'
                    : (videoCount > 0 ? (media.length > 1 ? '[Album Video]' : '[Video]')
                        : (media.length > 1 ? '[Album ảnh]' : '[Hình ảnh]'));
            } else if (srcMsg.type === MessageType.VIDEO) {
                displayContent = '[Video]';
            } else if (srcMsg.type === MessageType.FILE) {
                displayContent = `[File] ${srcMsg.media?.[0]?.fileName || 'Tài liệu'}`;
            } else if (srcMsg.type === MessageType.VOICE) {
                displayContent = '[Tin nhắn thoại]';
            } else if (srcMsg.type === MessageType.SHARE_POST) {
                displayContent = '[Chia sẻ bài viết]';
            } else if (srcMsg.type === MessageType.CALL) {
                try {
                    const parsed = JSON.parse(srcMsg.content) as { callType?: 'voice' | 'video' };
                    displayContent = parsed.callType === 'video' ? '[Cuộc gọi video]' : '[Cuộc gọi thoại]';
                } catch {
                    displayContent = '[Cuộc gọi]';
                }
            }

            await updateConversationAfterMessage(targetConvId, senderId, messageData, displayContent, msgId);
            await set(newMsgRef, messageData);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi forwardMessage:', error);
            throw error;
        }
    },

    updateMessageContent: async (convId: string, msgId: string, newContent: string, payload?: any): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}`);
            const msgSnap = await get(msgRef);
            if (!msgSnap.exists()) return;
            const msgData = msgSnap.val() as RtdbMessage;

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (!convSnap.exists()) return;

            const conv = convSnap.val() as RtdbConversation;

            const coreUpdates: Record<string, any> = {
                [`messages/${convId}/${msgId}/content`]: newContent,
                [`messages/${convId}/${msgId}/updatedAt`]: Date.now(),
            };

            if (conv.lastMessage && conv.lastMessage.messageId === msgId) {
                coreUpdates[`conversations/${convId}/lastMessage/content`] = payload
                    ? JSON.stringify(payload)
                    : newContent;
                coreUpdates[`conversations/${convId}/updatedAt`] = Date.now();
            }

            await update(ref(rtdb), coreUpdates);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi updateMessageContent:', error);
            throw error;
        }
    }
};
