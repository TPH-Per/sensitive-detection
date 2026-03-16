import { ref, set, get, update, push, query, orderByChild, limitToLast, endBefore, onChildAdded, onChildChanged, off, increment } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbMessage, RtdbConversation, MessageType, MediaObject } from '../../../shared/types';
import { TIME_LIMITS, IMAGE_COMPRESSION } from '../../constants';
import { compressImage } from '../../utils/imageUtils';
import { withRetry } from '../../utils/retryUtils';
import { uploadWithProgress, UploadProgress } from '../../utils/uploadUtils';
import {
    validateMessageContent,
    validateImageFile,
    validateVideoFile,
    validateChatFile,
    validateVoiceFile,
    FileValidationError
} from '../../utils/fileValidation';

type ProgressWithId = (messageId: string, progress: UploadProgress) => void;

async function markMessageUploadFailed(convId: string, msgId: string): Promise<void> {
    const msgRef = ref(rtdb, `messages/${convId}/${msgId}`);
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
}

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

        const updates: Record<string, any> = {};
        const now = Date.now();

        let conversation: RtdbConversation;
        if (!convSnap.exists()) {
            const isDirect = convId.startsWith('direct_');
            if (!isDirect) return;

            const userIds = convId.replace('direct_', '').split('_');
            const { rtdbConversationService } = await import('./rtdbConversationService');
            await rtdbConversationService.initializeDirectConversation(userIds[0], userIds[1], senderId);
            const newSnap = await get(convRef);
            if (!newSnap.exists()) return;
            conversation = newSnap.val() as RtdbConversation;
        } else {
            conversation = convSnap.val() as RtdbConversation;
        }

        const memberIds = Object.keys(conversation.members || {});

        updates[`conversations/${convId}/lastMessage`] = {
            senderId,
            content: displayContent,
            type: messageData.type,
            timestamp: now,
            messageId: messageId || null,
            readBy: messageData.readBy || {},
            deliveredTo: messageData.deliveredTo || {}
        };
        updates[`conversations/${convId}/updatedAt`] = now;

        for (const memberId of memberIds) {
            updates[`user_chats/${memberId}/${convId}/lastMsgTimestamp`] = now;
            updates[`user_chats/${memberId}/${convId}/updatedAt`] = now;
            if (memberId !== senderId) {
                updates[`user_chats/${memberId}/${convId}/unreadCount`] = increment(1);
                updates[`user_chats/${memberId}/${convId}/isArchived`] = false;
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
        onProgressWithId?: ProgressWithId;
        compress?: boolean;
        displayContent: string;
        mentions?: string[];
    }
): Promise<string> {
    // Validate file based on type
    if (type === MessageType.IMAGE) {
        validateImageFile(file);
    } else if (type === MessageType.VIDEO) {
        validateVideoFile(file);
    } else if (type === MessageType.FILE) {
        validateChatFile(file);
    } else if (type === MessageType.VOICE) {
        validateVoiceFile(file);
    }

    let uploadFile: File = file;

    if (options.compress && type === MessageType.IMAGE) {
        uploadFile = await compressImage(file, IMAGE_COMPRESSION.CHAT);
    }

    const createdAt = Date.now();
    const newMsgRef = push(ref(rtdb, `messages/${convId}`));
    const msgId = newMsgRef.key!;

    const mediaPlaceholder: MediaObject = {
        url: '',
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        isSensitive: false
    };

    const messageData: RtdbMessage = {
        senderId,
        type,
        content: type === MessageType.FILE ? file.name : '',
        media: [mediaPlaceholder],
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

    await updateConversationAfterMessage(convId, senderId, messageData, options.displayContent, msgId);
    await set(newMsgRef, messageData);

    const path = `chats/${convId}/${createdAt}_${file.name}`;
    let fileUrl = '';
    try {
        fileUrl = await withRetry(() =>
            uploadWithProgress(path, uploadFile, (progress) => {
                options.onProgressWithId?.(msgId, progress);
            })
        );
    } catch (error) {
        options.onProgressWithId?.(msgId, {
            progress: 0,
            bytesTransferred: 0,
            totalBytes: uploadFile.size,
            state: 'error'
        });
        await markMessageUploadFailed(convId, msgId);
        throw error;
    }

    const mediaObject: MediaObject = {
        ...mediaPlaceholder,
        url: fileUrl
    };

    await update(newMsgRef, {
        media: [mediaObject],
        updatedAt: Date.now()
    });

    return msgId;
}

async function createAndSendImageAlbumMessage(
    convId: string,
    senderId: string,
    files: File[],
    options: {
        replyToId?: string;
        onProgressWithId?: ProgressWithId;
        displayContent: string;
        mentions?: string[];
    }
): Promise<string> {
    if (files.length === 0) {
        throw new Error('Không có ảnh để gửi');
    }
    const createdAt = Date.now();
    const newMsgRef = push(ref(rtdb, `messages/${convId}`));
    const msgId = newMsgRef.key!;

    const mediaPlaceholders: MediaObject[] = files.map(file => ({
        url: '',
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        isSensitive: false
    }));

    const messageData: RtdbMessage = {
        senderId,
        type: MessageType.IMAGE,
        content: '',
        media: mediaPlaceholders,
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

    await updateConversationAfterMessage(convId, senderId, messageData, options.displayContent, msgId);
    await set(newMsgRef, messageData);

    const bytesByIndex = new Array(files.length).fill(0);
    const totalBytesByIndex = new Array(files.length).fill(0);

    const reportProgress = (state: "running" | "paused" | "success" | "error" | "canceled") => {
        const bytesTransferred = bytesByIndex.reduce((sum, val) => sum + val, 0);
        const totalBytes = totalBytesByIndex.reduce((sum, val) => sum + val, 0);
        if (totalBytes > 0) {
            options.onProgressWithId?.(msgId, {
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

    try {
        const media = await Promise.all(mediaUploads);
        await update(newMsgRef, {
            media,
            updatedAt: Date.now()
        });
    } catch (error) {
        options.onProgressWithId?.(msgId, {
            progress: 0,
            bytesTransferred: 0,
            totalBytes: totalBytesByIndex.reduce((sum, val) => sum + val, 0),
            state: 'error'
        });
        await markMessageUploadFailed(convId, msgId);
        throw error;
    }

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
            // Validate content
            validateMessageContent(content);

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

            await updateConversationAfterMessage(convId, senderId, messageData, content, msgId);
            await set(newMsgRef, messageData);

            return msgId;
        } catch (error) {
            if (error instanceof FileValidationError) {
                throw error;
            }
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
            onProgressWithId?: ProgressWithId;
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
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
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

    /**
     * Gửi tin nhắn file
     */
    sendFileMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
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

    /**
     * Gửi tin nhắn thoại
     */
    sendVoiceMessage: async (
        convId: string,
        senderId: string,
        file: File,
        options?: {
            replyToId?: string;
            onProgressWithId?: ProgressWithId;
            mentions?: string[];
        }
    ): Promise<string> => {
        try {
            return await createAndSendMediaMessage(convId, senderId, file, MessageType.VOICE, {
                ...options,
                compress: false,
                displayContent: '[Tin nhắn thoại]'
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
            console.error('[rtdbMessageService] Lỗi loadMoreMessages:', error);
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
            const lastMessagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(50));
            const snapshot = await get(lastMessagesQuery);

            if (!snapshot.exists()) return;

            const updates: Record<string, any> = {};
            let hasUpdates = false;
            let lastMessageIdInSnapshot: string | null = null;
            let lastMessageTimestamp = 0;

            snapshot.forEach((childSnap) => {
                const msgId = childSnap.key!;
                const msgData = childSnap.val() as RtdbMessage;

                if (msgData.createdAt > lastMessageTimestamp) {
                    lastMessageTimestamp = msgData.createdAt;
                    lastMessageIdInSnapshot = msgId;
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

            const lastMsgPath = `conversations/${convId}/lastMessage`;
            const lastMsgSnap = await get(ref(rtdb, lastMsgPath));
            
            if (lastMsgSnap.exists()) {
                const lastMsg = lastMsgSnap.val();
                if (lastMsg.senderId !== uid && !lastMsg.readBy?.[uid]) {
                    if (settings.showReadReceipts) {
                        const lastMsgUpdates: Record<string, any> = {};
                        lastMsgUpdates[`${lastMsgPath}/readBy/${uid}`] = Date.now();
                        lastMsgUpdates[`${lastMsgPath}/deliveredTo/${uid}`] = Date.now();
                        await update(ref(rtdb), lastMsgUpdates);
                    }
                }
            }

            const userChatUpdates: Record<string, any> = {
                [`user_chats/${uid}/${convId}/unreadCount`]: 0,
                [`user_chats/${uid}/${convId}/updatedAt`]: Date.now()
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
     * Đánh dấu tin nhắn đã nhận
     */
    markAsDelivered: async (convId: string, uid: string): Promise<void> => {
        try {
            const messagesRef = ref(rtdb, `messages/${convId}`);
            const lastMessagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(20));
            const snapshot = await get(lastMessagesQuery);

            if (!snapshot.exists()) return;

            const updates: Record<string, any> = {};
            let hasUpdates = false;
            let lastMessageIdInSnapshot: string | null = null;
            let lastMessageTimestamp = 0;

            snapshot.forEach((childSnap) => {
                const msgId = childSnap.key!;
                const msgData = childSnap.val() as RtdbMessage;

                if (msgData.createdAt > lastMessageTimestamp) {
                    lastMessageTimestamp = msgData.createdAt;
                    lastMessageIdInSnapshot = msgId;
                }

                if (msgData.senderId !== uid && !msgData.deliveredTo?.[uid]) {
                    updates[`messages/${convId}/${msgId}/deliveredTo/${uid}`] = Date.now();
                    hasUpdates = true;
                }
            });

            if (hasUpdates) {
                await update(ref(rtdb), updates);
            }

            const lastMsgPath = `conversations/${convId}/lastMessage`;
            const lastMsgSnap = await get(ref(rtdb, lastMsgPath));
            
            if (lastMsgSnap.exists()) {
                const lastMsg = lastMsgSnap.val();
                if (lastMsg.senderId !== uid && !lastMsg.deliveredTo?.[uid]) {
                    await update(ref(rtdb, lastMsgPath), {
                        [`deliveredTo/${uid}`]: Date.now()
                    });
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

    /**
     * Xóa tin nhắn phía tôi
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

            let displayContent = srcMsg.content;
            if (srcMsg.type === MessageType.IMAGE) displayContent = '[Hình ảnh]';
            else if (srcMsg.type === MessageType.VIDEO) displayContent = '[Video]';
            else if (srcMsg.type === MessageType.FILE) displayContent = `[File] ${srcMsg.media?.[0]?.fileName || 'Tài liệu'}`;
            else if (srcMsg.type === MessageType.VOICE) displayContent = '[Tin nhắn thoại]';
            else if (srcMsg.type === MessageType.CALL) {
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
            await updateConversationAfterMessage(convId, 'system', messageData, content, msgId);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendSystemMessage:', error);
            throw error;
        }
    },

    /**
     * Gửi tin nhắn cuộc gọi
     */
    sendCallMessage: async (
        convId: string,
        senderId: string,
        payload: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected' | 'started'; duration?: number }
    ): Promise<string> => {
        try {
            const newMsgRef = push(ref(rtdb, `messages/${convId}`));
            const msgId = newMsgRef.key!;

            const content = JSON.stringify(payload);

            const messageData: RtdbMessage = {
                senderId,
                type: MessageType.CALL,
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

            const displayContent = payload.callType === 'video' ? '[Cuộc gọi video]' : '[Cuộc gọi thoại]';
            await updateConversationAfterMessage(convId, senderId, messageData, displayContent, msgId);

            return msgId;
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi sendCallMessage:', error);
            throw error;
        }
    },

    /**
     * Cập nhật nội dung tin nhắn hiện có
     */
    updateMessageContent: async (convId: string, msgId: string, newContent: string, payload?: any): Promise<void> => {
        try {
            const msgRef = ref(rtdb, `messages/${convId}/${msgId}`);
            const updates: any = {
                content: newContent,
                updatedAt: Date.now()
            };
            await update(msgRef, updates);

            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (convSnap.exists()) {
                const conv = convSnap.val() as RtdbConversation;
                if (conv.lastMessage && conv.lastMessage.messageId === msgId) {
                    let displayContent = newContent;
                    if (payload && payload.callType) {
                        displayContent = payload.callType === 'video' ? '[Cuộc gọi video]' : '[Cuộc gọi thoại]';
                    }
                    await update(convRef, {
                        'lastMessage/content': displayContent,
                        updatedAt: Date.now()
                    });
                }
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi updateMessageContent:', error);
            throw error;
        }
    }
};
