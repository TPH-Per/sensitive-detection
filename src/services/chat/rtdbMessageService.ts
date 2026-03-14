import { ref, set, get, update, push, query, orderByChild, limitToLast, endBefore, onChildAdded, onChildChanged, off, increment } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbMessage, RtdbConversation, MessageType, MediaObject } from '../../types';
import { TIME_LIMITS, IMAGE_COMPRESSION } from '../../constants';
import { compressImage } from '../../utils/imageUtils';
import { withRetry } from '../../utils/retryUtils';
import { uploadWithProgress, ProgressCallback } from '../../utils/uploadUtils';

async function updateConversationAfterMessage(
    convId: string,
    senderId: string,
    messageData: Partial<RtdbMessage>,
    displayContent: string,
    messageId?: string
): Promise<void> {
    try {
        const convRef = ref(rtdb, `conversations/${convId}`);
        const convSnap = await get(convRef);

        if (!convSnap.exists()) return;

        const conversation = convSnap.val() as RtdbConversation;
        const memberIds = Object.keys(conversation.members || {});

        const updates: Record<string, any> = {};

        updates[`conversations/${convId}/lastMessage`] = {
            senderId,
            content: displayContent,
            type: messageData.type,
            timestamp: Date.now(),
            messageId: messageId || null,
            readBy: messageData.readBy || {},
            deliveredTo: messageData.deliveredTo || {}
        };
        updates[`conversations/${convId}/updatedAt`] = Date.now();

        for (const memberId of memberIds) {
            if (memberId !== senderId) {
                updates[`user_chats/${memberId}/${convId}/unreadCount`] = increment(1);
                updates[`user_chats/${memberId}/${convId}/lastMsgTimestamp`] = Date.now();
                updates[`user_chats/${memberId}/${convId}/isArchived`] = false;
            } else {
                updates[`user_chats/${memberId}/${convId}/lastMsgTimestamp`] = Date.now();
            }
        }

        await update(ref(rtdb), updates);
    } catch (error) {
        console.error('[rtdbMessageService] Lỗi updateConversationAfterMessage:', error);
    }
}

async function createAndSendMediaMessage(
    convId: string,
    senderId: string,
    file: File,
    type: MessageType,
    options: {
        replyToId?: string;
        onProgress?: ProgressCallback;
        compress?: boolean;
        displayContent: string;
        mentions?: string[];
    }
): Promise<string> {
    let uploadFile: File = file;

    if (options.compress && type === MessageType.IMAGE) {
        uploadFile = await compressImage(file, IMAGE_COMPRESSION.CHAT);
    }

    const createdAt = Date.now();
    const path = `chats/${convId}/${createdAt}_${file.name}`;

    const fileUrl = await withRetry(() =>
        uploadWithProgress(path, uploadFile, options.onProgress)
    );

    const mediaObject: MediaObject = {
        url: fileUrl,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        isSensitive: false
    };

    const newMsgRef = push(ref(rtdb, `messages/${convId}`));
    const msgId = newMsgRef.key!;

    const messageData: RtdbMessage = {
        senderId,
        type,
        content: type === MessageType.FILE ? file.name : '',
        media: [mediaObject],
        mentions: options.mentions || [],
        isForwarded: false,
        replyToId: options.replyToId || null,
        isEdited: false,
        isRecalled: false,
        deletedBy: {},
        readBy: {},
        deliveredTo: {},
        reactions: {},
        createdAt,
        updatedAt: createdAt
    };

    await set(newMsgRef, messageData);
    await updateConversationAfterMessage(convId, senderId, messageData, options.displayContent, msgId);

    return msgId;
}

async function createAndSendImageAlbumMessage(
    convId: string,
    senderId: string,
    files: File[],
    options: {
        replyToId?: string;
        onProgress?: ProgressCallback;
        displayContent: string;
        mentions?: string[];
    }
): Promise<string> {
    if (files.length === 0) {
        throw new Error('Không có ảnh để gửi');
    }
    const createdAt = Date.now();
    const bytesByIndex = new Array(files.length).fill(0);
    const totalBytesByIndex = new Array(files.length).fill(0);

    const reportProgress = (state: "running" | "paused" | "success" | "error" | "canceled") => {
        const bytesTransferred = bytesByIndex.reduce((sum, val) => sum + val, 0);
        const totalBytes = totalBytesByIndex.reduce((sum, val) => sum + val, 0);
        if (totalBytes > 0) {
            options.onProgress?.({
                progress: (bytesTransferred / totalBytes) * 100,
                bytesTransferred,
                totalBytes,
                state
            });
        }
    };

    const mediaUploads = files.map(async (file, index) => {
        const uploadFile = await compressImage(file, IMAGE_COMPRESSION.CHAT);
        const path = `chats/${convId}/${createdAt}_${index}_${file.name}`;

        const fileUrl = await withRetry(() =>
            uploadWithProgress(path, uploadFile, (progress) => {
                bytesByIndex[index] = progress.bytesTransferred;
                totalBytesByIndex[index] = progress.totalBytes;
                reportProgress(progress.state);
            })
        );

        return {
            url: fileUrl,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            isSensitive: false
        } as MediaObject;
    });

    const media = await Promise.all(mediaUploads);

    const newMsgRef = push(ref(rtdb, `messages/${convId}`));
    const msgId = newMsgRef.key!;

    const messageData: RtdbMessage = {
        senderId,
        type: MessageType.IMAGE,
        content: '',
        media,
        mentions: options.mentions || [],
        isForwarded: false,
        replyToId: options.replyToId || null,
        isEdited: false,
        isRecalled: false,
        deletedBy: {},
        readBy: {},
        deliveredTo: {},
        reactions: {},
        createdAt,
        updatedAt: createdAt
    };

    await set(newMsgRef, messageData);
    await updateConversationAfterMessage(convId, senderId, messageData, options.displayContent, msgId);

    return msgId;
}

export const rtdbMessageService = {
    /**
     * Gửi tin nhắn văn bản
     */
    sendTextMessage: async (
        convId: string,
        senderId: string,
        content: string,
        options?: {
            replyToId?: string;
            isForwarded?: boolean;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            const newMsgRef = push(ref(rtdb, `messages/${convId}`));
            const msgId = newMsgRef.key!;

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.TEXT,
                content,
                media: [],
                mentions: options?.mentions || [],
                isForwarded: options?.isForwarded || false,
                replyToId: options?.replyToId || null,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await set(newMsgRef, messageData);
            await updateConversationAfterMessage(convId, senderId, messageData, content, msgId);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendTextMessage:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn hình ảnh
     */
    sendImageMessage: async (
        convId: string,
        senderId: string,
        file: File | File[],
        options?: {
            replyToId?: string;
            onProgress?: ProgressCallback;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            const files = Array.isArray(file) ? file : [file];
            if (files.length <= 1) {
                return await createAndSendMediaMessage(convId, senderId, files[0], MessageType.IMAGE, {
                    ...options,
                    compress: true,
                    displayContent: '[Hình ảnh]'
                });
            }

            return await createAndSendImageAlbumMessage(convId, senderId, files, {
                ...options,
                displayContent: '[Hình ảnh]'
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendImageMessage:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn video
     */
    sendVideoMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgress?: ProgressCallback;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.VIDEO, {
                ...options,
                compress: false,
                displayContent: 'Video'
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendVideoMessage:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn file
     */
    sendFileMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgress?: ProgressCallback;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.FILE, {
                ...options,
                compress: false,
                displayContent: file.name
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendFileMessage:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn thoại
     */
    sendVoiceMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgress?: ProgressCallback;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.VOICE, {
                ...options,
                compress: false,
                displayContent: 'Tin nhắn thoại'
            });
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendVoiceMessage:', error);
            throw error;
        }
    },

    /**
     * Lắng nghe tin nhắn realtime
     */
    subscribeToMessages: (
        convId: string,
        limitCount: number,
        callback: (messages: Array<{ id: string; data: RtdbMessage }>) => void,
        sinceTimestamp: number = 0
    ) => {
        const messagesRef = ref(rtdb, `messages/${convId}`);
        const messagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(limitCount));

        const messages: Array<{ id: string; data: RtdbMessage }> = [];

        const childAddedHandler = (snapshot: any) => {
            const msgId = snapshot.key;
            const msgData = snapshot.val() as RtdbMessage;

            if (msgData.createdAt <= sinceTimestamp) return;

            const existingIndex = messages.findIndex(m => m.id === msgId);
            if (existingIndex === -1) {
                messages.push({ id: msgId, data: msgData });
                messages.sort((a, b) => a.data.createdAt - b.data.createdAt);
                callback([...messages]);
            }
        };

        const childChangedHandler = (snapshot: any) => {
            const msgId = snapshot.key;
            const msgData = snapshot.val() as RtdbMessage;

            const existingIndex = messages.findIndex(m => m.id === msgId);
            if (existingIndex !== -1) {
                messages[existingIndex] = { id: msgId, data: msgData };
                callback([...messages]);
            }
        };

        onChildAdded(messagesQuery, childAddedHandler);
        onChildChanged(messagesQuery, childChangedHandler);

        return () => {
            off(messagesQuery, 'child_added', childAddedHandler);
            off(messagesQuery, 'child_changed', childChangedHandler);
        };
    },

    /**
     * Tải thêm tin nhắn cũ
     */
    loadMoreMessages: async (
        convId: string,
        beforeTimestamp: number,
        limitCount: number,
        sinceTimestamp: number = 0
    ): Promise<Array<{ id: string; data: RtdbMessage }>> => {
        try {
            if (beforeTimestamp <= sinceTimestamp) return [];

            const messagesRef = ref(rtdb, `messages/${convId}`);
            const messagesQuery = query(
                messagesRef,
                orderByChild('createdAt'),
                endBefore(beforeTimestamp),
                limitToLast(limitCount)
            );

            const snapshot = await get(messagesQuery);
            const messages: Array<{ id: string; data: RtdbMessage }> = [];

            if (snapshot.exists()) {
                snapshot.forEach((childSnap) => {
                    const data = childSnap.val() as RtdbMessage;
                    if (data.createdAt > sinceTimestamp) {
                        messages.push({
                            id: childSnap.key!,
                            data
                        });
                    }
                });
            }

            return messages.sort((a, b) => a.data.createdAt - b.data.createdAt);
        } catch (error) {
            console.error('[rtdbMessageService] Lá»—i loadMoreMessages:', error);
            throw error;
        }
    },

    /**
     * Đánh dấu tin nhắn đã đọc
     */
    markAsRead: async (convId: string, uid: string, lastMsgId?: string): Promise<void> => {
        try {
            const { userService } = await import('../userService');
            const settings = await userService.getUserSettings(uid);

            const messagesRef = ref(rtdb, `messages/${convId}`);
            const snapshot = await get(messagesRef);

            if (!snapshot.exists()) return;

            const updates: Record<string, any> = {};
            let hasUpdates = false;
            let lastMessageId: string | null = null;
            let lastMessageTimestamp = 0;

            snapshot.forEach((childSnap) => {
                const msgId = childSnap.key!;
                const msgData = childSnap.val() as RtdbMessage;

                if (msgData.createdAt > lastMessageTimestamp) {
                    lastMessageTimestamp = msgData.createdAt;
                    lastMessageId = msgId;
                }

                if (msgData.senderId !== uid && !msgData.readBy?.[uid]) {
                    if (settings.showReadReceipts) {
                        updates[`messages/${convId}/${msgId}/readBy/${uid}`] = Date.now();
                        updates[`messages/${convId}/${msgId}/deliveredTo/${uid}`] = Date.now();
                        hasUpdates = true;
                    }
                }
            });

            if (hasUpdates) {
                await update(ref(rtdb), updates);
            }

            if (lastMessageId) {
                const convRef = ref(rtdb, `conversations/${convId}`);
                const convSnap = await get(convRef);

                if (convSnap.exists()) {
                    const conv = convSnap.val() as RtdbConversation;
                    if (conv.lastMessage && conv.lastMessage.messageId === lastMessageId) {
                        updates[`conversations/${convId}/lastMessage/readBy/${uid}`] = Date.now();
                        updates[`conversations/${convId}/lastMessage/deliveredTo/${uid}`] = Date.now();
                        await update(ref(rtdb), updates);
                    }
                }
            }

            const userChatUpdates: Record<string, any> = {
                [`user_chats/${uid}/${convId}/unreadCount`]: 0
            };

            if (lastMsgId) {
                userChatUpdates[`user_chats/${uid}/${convId}/lastReadMsgId`] = lastMsgId;
            }

            await update(ref(rtdb), userChatUpdates);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi markAsRead:', error);
            throw error;
        }
    },

    /**
     * ÄÃ¡nh dáº¥u tin nháº¯n Ä‘Ã£ nháº­n
     */
    markAsDelivered: async (convId: string, uid: string): Promise<void> => {
        try {
            const messagesRef = ref(rtdb, `messages/${convId}`);
            const snapshot = await get(messagesRef);

            if (!snapshot.exists()) return;

            const updates: Record<string, any> = {};
            let hasUpdates = false;
            let lastMessageId: string | null = null;
            let lastMessageTimestamp = 0;

            snapshot.forEach((childSnap) => {
                const msgId = childSnap.key!;
                const msgData = childSnap.val() as RtdbMessage;

                if (msgData.createdAt > lastMessageTimestamp) {
                    lastMessageTimestamp = msgData.createdAt;
                    lastMessageId = msgId;
                }

                if (msgData.senderId !== uid && !msgData.deliveredTo?.[uid]) {
                    updates[`messages/${convId}/${msgId}/deliveredTo/${uid}`] = Date.now();
                    hasUpdates = true;
                }
            });

            if (hasUpdates) {
                await update(ref(rtdb), updates);
            }

            if (lastMessageId) {
                const convRef = ref(rtdb, `conversations/${convId}`);
                const convSnap = await get(convRef);

                if (convSnap.exists()) {
                    const conv = convSnap.val() as RtdbConversation;
                    if (conv.lastMessage && conv.lastMessage.messageId === lastMessageId) {
                        updates[`conversations/${convId}/lastMessage/deliveredTo/${uid}`] = Date.now();
                        await update(ref(rtdb), updates);
                    }
                }
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi markAsDelivered:', error);
            throw error;
        }
    },

    /**
     * Thu hồi tin nhắn
     */
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

    /**
     * XÃ³a tin nháº¯n phÃ­a tÃ´i
     */
    deleteForMe: async (convId: string, msgId: string, uid: string): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}/deletedBy/${uid}`);
            await set(msgRef, true);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi deleteForMe:', error);
            throw error;
        }
    },

    /**
     * Chỉnh sửa tin nhắn
     */
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

    /**
     * Chuyển tiếp tin nhắn
     */
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
                replyToId: null,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await set(newMsgRef, messageData);

            let displayContent = srcMsg.content;
            if (srcMsg.type === MessageType.IMAGE) displayContent = '[Hình ảnh]';
            else if (srcMsg.type === MessageType.VIDEO) displayContent = 'Video';
            else if (srcMsg.type === MessageType.FILE) displayContent = srcMsg.media?.[0]?.fileName || 'Tài liệu';
            else if (srcMsg.type === MessageType.VOICE) displayContent = 'Tin nhắn thoại';

            await updateConversationAfterMessage(targetConvId, senderId, messageData, displayContent, msgId);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi forwardMessage:', error);
            throw error;
        }
    },

    /**
     * Thêm/xóa reaction
     */
    toggleReaction: async (convId: string, msgId: string, uid: string, emoji: string | 'REMOVE'): Promise<void> => {
        try {
            const reactionRef = ref(rtdb, `messages/${convId}/${msgId}/reactions/${uid}`);
            const reactionSnap = await get(reactionRef);
            const currentEmoji = reactionSnap.val();

            if (emoji === 'REMOVE' || currentEmoji === emoji) {
                await set(reactionRef, null);
            } else {
                await set(reactionRef, emoji);
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi toggleReaction:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn hệ thống
     */
    sendSystemMessage: async (convId: string, content: string): Promise<string> => {
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
                replyToId: null,
                isEdited: false,
                isRecalled: false,
                deletedBy: {},
                readBy: {},
                deliveredTo: {},
                reactions: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await set(newMsgRef, messageData);

            const convRef = ref(rtdb, `conversations/${convId}`);
            await update(convRef, {
                lastMessage: {
                    senderId: 'system',
                    content,
                    type: MessageType.SYSTEM,
                    timestamp: Date.now(),
                    messageId: msgId,
                    readBy: {},
                    deliveredTo: {}
                },
                updatedAt: Date.now()
            });

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendSystemMessage:', error);
            throw error;
        }
    }
};