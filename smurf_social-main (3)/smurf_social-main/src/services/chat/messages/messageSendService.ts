import { ref, update, push } from 'firebase/database';
import { rtdb } from '../../../firebase/config';
import { RtdbMessage, MessageType, SharedPostMessagePayload } from '../../../../shared/types';
import { validateMessageContent, FileValidationError } from '../../../utils/fileValidation';
import {
    ProgressWithId,
    assignReplyToIdIfPresent,
    createAndSendMediaAlbumMessage,
    createAndSendMediaMessage,
    getConversationUpdatePaths,
    ensureConversationExists
} from './messageHelpers';
import { getRtdbServerTimestamp, getServerSyncedNow } from '../chatTime';

export const messageSendService = {
    generateMessageId: (convId: string): string => {
        return push(ref(rtdb, `messages/${convId}`)).key!;
    },

    sendTextMessage: async (
        convId: string,
        senderId: string,
        content: string,
        options?: {
            replyToId?: string;
            isForwarded?: boolean;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            validateMessageContent(content);

            const msgId = options?.messageId || push(ref(rtdb, `messages/${convId}`)).key!;
            const newMsgRef = ref(rtdb, `messages/${convId}/${msgId}`);

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.TEXT,
                content,
                media: [],
                mentions: options?.mentions || [],
                isForwarded: options?.isForwarded || false,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: getServerSyncedNow(),
                updatedAt: getServerSyncedNow()
            };

            assignReplyToIdIfPresent(messageData, options?.replyToId);

            const conversation = await ensureConversationExists(convId, senderId);
            if (!conversation) throw new Error('Conversation not found');

            const updates = getConversationUpdatePaths(convId, senderId, messageData, content, conversation, msgId);
            updates[`messages/${convId}/${msgId}`] = {
                ...messageData,
                createdAt: getRtdbServerTimestamp(),
                updatedAt: getRtdbServerTimestamp()
            };

            await update(ref(rtdb), updates);

            return msgId;
        } catch (error) {
            if (error instanceof FileValidationError) {
                throw error;
            }
            console.error('[rtdbMessageService] Lỗi sendTextMessage:', error);
            throw error;
        }
    },

    sendSharedPostMessage: async (
        convId: string,
        senderId: string,
        payload: SharedPostMessagePayload,
        options?: {
            replyToId?: string;
            isForwarded?: boolean;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            const msgId = options?.messageId || push(ref(rtdb, `messages/${convId}`)).key!;
            const newMsgRef = ref(rtdb, `messages/${convId}/${msgId}`);
            const content = JSON.stringify(payload);

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.SHARE_POST,
                content,
                media: [],
                mentions: options?.mentions || [],
                isForwarded: options?.isForwarded || false,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: getServerSyncedNow(),
                updatedAt: getServerSyncedNow()
            };

            assignReplyToIdIfPresent(messageData, options?.replyToId);

            const conversation = await ensureConversationExists(convId, senderId);
            if (!conversation) throw new Error('Conversation not found');

            const updates = getConversationUpdatePaths(convId, senderId, messageData, '[Chia sẻ bài viết]', conversation, msgId);
            updates[`messages/${convId}/${msgId}`] = {
                ...messageData,
                createdAt: getRtdbServerTimestamp(),
                updatedAt: getRtdbServerTimestamp()
            };

            await update(ref(rtdb), updates);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendSharedPostMessage:', error);
            throw error;
        }
    },

    sendImageMessage: async (
        convId: string,
        senderId: string,
        file: File | File[],
        options?: {
            replyToId?: string;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
            content?: string;
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            const files = Array.isArray(file) ? file : [file];
            const isAlbum = files.length > 1;
            const caption = options?.content ? ` ${options.content}` : '';
            const displayContent = isAlbum ? `[Album hình ảnh]${caption}` : `[Hình ảnh]${caption}`;

            if (files.length <= 1) {
                return await createAndSendMediaMessage(convId, senderId, files[0], MessageType.IMAGE, {
                    ...options,
                    compress: true,
                    displayContent,
                    content: options?.content,
                    mentions: options?.mentions
                });
            }

            return await createAndSendMediaAlbumMessage(convId, senderId, files, {
                ...options,
                displayContent,
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendImageMessage:', error);
            throw error;
        }
    },

    sendVideoMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.VIDEO, {
                ...options,
                compress: false,
                displayContent: '[Video]'
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendVideoMessage:', error);
            throw error;
        }
    },

    sendFileMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.FILE, {
                ...options,
                compress: false,
                displayContent: `[File] ${file.name}`
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendFileMessage:', error);
            throw error;
        }
    },

    sendVoiceMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            duration?: number;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.VOICE, {
                ...options,
                compress: false,
                displayContent: '[Tin nhắn thoại]',
                voiceDuration: options?.duration,
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendVoiceMessage:', error);
            throw error;
        }
    },

    sendGifMessage: async (
        convId: string,
        senderId: string,
        gifUrl: string,
        options?: {
            replyToId?: string;
            mentions?: string[];
            messageId?: string;
        }
    ): Promise<string> => {
        try {
            const msgId = options?.messageId || push(ref(rtdb, `messages/${convId}`)).key!;
            const newMsgRef = ref(rtdb, `messages/${convId}/${msgId}`);

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.GIF,
                content: gifUrl,
                media: [],
                mentions: options?.mentions || [],
                isForwarded: false,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: getServerSyncedNow(),
                updatedAt: getServerSyncedNow()
            };

            assignReplyToIdIfPresent(messageData, options?.replyToId);

            const conversation = await ensureConversationExists(convId, senderId);
            if (!conversation) throw new Error('Conversation not found');

            const updates = getConversationUpdatePaths(convId, senderId, messageData, '[GIF]', conversation, msgId);
            updates[`messages/${convId}/${msgId}`] = {
                ...messageData,
                createdAt: getRtdbServerTimestamp(),
                updatedAt: getRtdbServerTimestamp()
            };

            await update(ref(rtdb), updates);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendGifMessage:', error);
            throw error;
        }
    },

    sendSystemMessage: async (
        convId: string,
        content: string
    ): Promise<string> => {
        try {
            const newMsgRef = push(ref(rtdb, `messages/${convId}`));
            const msgId = newMsgRef.key!;

            const messageData: RtdbMessage = {
                senderId: 'system',
                type: MessageType.SYSTEM,
                content,
                media: [],
                mentions: [],
                isForwarded: false,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: getServerSyncedNow(),
                updatedAt: getServerSyncedNow()
            };

            const conversation = await ensureConversationExists(convId, 'system');
            if (!conversation) throw new Error('Conversation not found');

            const updates = getConversationUpdatePaths(convId, 'system', messageData, content, conversation, msgId);
            updates[`messages/${convId}/${msgId}`] = {
                ...messageData,
                createdAt: getRtdbServerTimestamp(),
                updatedAt: getRtdbServerTimestamp()
            };

            await update(ref(rtdb), updates);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendSystemMessage:', error);
            throw error;
        }
    },

    sendCallMessage: async (
        convId: string,
        senderId: string,
        payload: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected' | 'started'; duration?: number },
        messageId?: string
    ): Promise<string> => {
        try {
            const msgId = messageId || push(ref(rtdb, `messages/${convId}`)).key!;
            const newMsgRef = ref(rtdb, `messages/${convId}/${msgId}`);

            const content = JSON.stringify(payload);

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.CALL,
                content,
                media: [],
                mentions: [],
                isForwarded: false,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: getServerSyncedNow(),
                updatedAt: getServerSyncedNow()
            };

            const conversation = await ensureConversationExists(convId, senderId);
            if (!conversation) throw new Error('Conversation not found');

            const updates = getConversationUpdatePaths(convId, senderId, messageData, content, conversation, msgId);
            updates[`messages/${convId}/${msgId}`] = {
                ...messageData,
                createdAt: getRtdbServerTimestamp(),
                updatedAt: getRtdbServerTimestamp()
            };

            await update(ref(rtdb), updates);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendCallMessage:', error);
            throw error;
        }
    }
};
