import { ref, set, get, update, push, remove, query, orderByChild, limitToLast, increment } from 'firebase/database';
import { rtdb } from '../../../firebase/config';
import { RtdbMessage, RtdbConversation, MessageType, MediaObject } from '../../../../shared/types';
import { IMAGE_COMPRESSION } from '../../../constants';
import { compressImage } from '../../../utils/imageUtils';
import { uploadWithProgress, UploadProgress, generateVideoThumbnail } from '../../../utils/uploadUtils';
import {
    validateImageFile,
    validateVideoFile,
    validateChatFile,
    validateVoiceFile
} from '../../../utils/fileValidation';
import { rtdbConversationService } from '../rtdbConversationService';
import { getRtdbServerTimestamp, getServerSyncedNow } from '../chatTime';

export type ProgressWithId = (messageId: string, progress: UploadProgress) => void;

export function assignReplyToIdIfPresent(messageData: RtdbMessage, replyToId?: string): void {
    if (replyToId) {
        messageData.replyToId = replyToId;
    }
}

export async function markMessageUploadFailed(convId: string, msgId: string): Promise<void> {
    await remove(ref(rtdb, `messages/${convId}/${msgId}`));

    const convRef = ref(rtdb, `conversations/${convId}`);
    const convSnap = await get(convRef);
    if (!convSnap.exists()) return;

    const conv = convSnap.val() as RtdbConversation;
    if (!conv.lastMessage || conv.lastMessage.messageId !== msgId) return;

    const msgsSnap = await get(query(
        ref(rtdb, `messages/${convId}`),
        orderByChild('createdAt'),
        limitToLast(2)
    ));

    let prevMsg: { id: string; data: RtdbMessage } | null = null;
    if (msgsSnap.exists()) {
        msgsSnap.forEach((child) => {
            if (child.key !== msgId) {
                prevMsg = { id: child.key!, data: child.val() as RtdbMessage };
            }
        });
    }

    if (prevMsg) {
        const { id, data } = prevMsg as { id: string; data: RtdbMessage };
        await update(convRef, {
            lastMessage: {
                senderId: data.senderId,
                content: data.content,
                type: data.type,
                timestamp: data.createdAt,
                messageId: id,
                readBy: data.readBy || {},
                deliveredTo: data.deliveredTo || {}
            },
            updatedAt: getRtdbServerTimestamp()
        });
    } else {
        await update(convRef, { lastMessage: null, updatedAt: getRtdbServerTimestamp() });
    }
}

export async function ensureConversationExists(convId: string, senderId: string): Promise<RtdbConversation | null> {
    const convRef = ref(rtdb, `conversations/${convId}`);
    const convSnap = await get(convRef);

    if (convSnap.exists()) {
        return convSnap.val() as RtdbConversation;
    }

    const isDirect = convId.startsWith('direct_');
    if (!isDirect) return null;

    const userIds = convId.replace('direct_', '').split('_');
    await rtdbConversationService.initializeDirectConversation(userIds[0], userIds[1], senderId);
    
    const newSnap = await get(convRef);
    return newSnap.exists() ? newSnap.val() as RtdbConversation : null;
}

export function getConversationUpdatePaths(
    convId: string,
    senderId: string,
    messageData: Partial<RtdbMessage>,
    displayContent: string,
    conversation: RtdbConversation,
    messageId?: string
): Record<string, any> {
    const updates: Record<string, any> = {};
    const memberIds = Object.keys(conversation.members || {});

    updates[`conversations/${convId}/lastMessage`] = {
        senderId,
        content: displayContent,
        type: messageData.type,
        timestamp: getRtdbServerTimestamp(),
        messageId: messageId || null,
        readBy: messageData.readBy || {},
        deliveredTo: messageData.deliveredTo || {}
    };
    updates[`conversations/${convId}/updatedAt`] = getRtdbServerTimestamp();
    
    if (senderId && senderId !== 'system') {
        updates[`conversations/${convId}/lastMessageAt/${senderId}`] = getRtdbServerTimestamp();
    }

    const isSilentMessage = messageData.type === MessageType.SYSTEM || messageData.type === MessageType.CALL;

    for (const memberId of memberIds) {
        updates[`user_chats/${memberId}/${convId}/lastMsgTimestamp`] = getRtdbServerTimestamp();
        updates[`user_chats/${memberId}/${convId}/updatedAt`] = getRtdbServerTimestamp();
        if (memberId !== senderId) {
            if (!isSilentMessage) {
                updates[`user_chats/${memberId}/${convId}/unreadCount`] = increment(1);
            }
            updates[`user_chats/${memberId}/${convId}/isArchived`] = false;
        }
    }

    return updates;
}

export async function createAndSendMediaMessage(
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
        voiceDuration?: number;
        messageId?: string;
        content?: string;
    }
): Promise<string> {
    if (type === MessageType.IMAGE) validateImageFile(file);
    else if (type === MessageType.VIDEO) validateVideoFile(file);
    else if (type === MessageType.FILE) validateChatFile(file);
    else if (type === MessageType.VOICE) validateVoiceFile(file);

    let uploadFile: File = file;
    if (options.compress && type === MessageType.IMAGE) {
        uploadFile = await compressImage(file, IMAGE_COMPRESSION.CHAT);
    }

    const createdAt = getServerSyncedNow();
    const newMsgRef = options.messageId 
        ? ref(rtdb, `messages/${convId}/${options.messageId}`)
        : push(ref(rtdb, `messages/${convId}`));
    const msgId = options.messageId || newMsgRef.key!;

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
        content: options.content !== undefined 
            ? options.content 
            : (type === MessageType.FILE ? '' : (type === MessageType.VOICE && options.voiceDuration ? String(options.voiceDuration) : '')),
        media: [mediaPlaceholder],
        mentions: options.mentions || [],
        isForwarded: false,
        isEdited: false,
        isRecalled: false,
        deletedBy: {},
        readBy: {},
        deliveredTo: {},
        reactions: {},
        createdAt,
        updatedAt: createdAt
    };

    assignReplyToIdIfPresent(messageData, options.replyToId);

    const path = `chats/${convId}/${createdAt}_${file.name}`;
    
    const thumbPromise = type === MessageType.VIDEO ? (async () => {
        try {
            const thumbFile = await generateVideoThumbnail(file);
            const thumbPath = `thumbnails/${senderId}/${createdAt}_${thumbFile.name}`;
            return await uploadWithProgress(thumbPath, thumbFile);
        } catch (e) {
            console.error('[rtdbMessageService] Lỗi tạo/up thumbnail video:', e);
            return undefined;
        }
    })() : Promise.resolve(undefined);

    const uploadPromise = (async () => {
        try {
            return await uploadWithProgress(path, uploadFile, (progress) => {
                options.onProgressWithId?.(msgId, progress);
            });
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
    })();

    const [url, thumbnailUrl] = await Promise.all([uploadPromise, thumbPromise]);

    const mediaObject: MediaObject = {
        ...mediaPlaceholder,
        url,
        ...(thumbnailUrl && { thumbnailUrl })
    };

    const finalMessageData: RtdbMessage = {
        ...messageData,
        media: [mediaObject]
    };

    const conversation = await ensureConversationExists(convId, senderId);
    if (!conversation) throw new Error('Conversation not found');

    const updates = getConversationUpdatePaths(convId, senderId, finalMessageData, options.displayContent, conversation, msgId);
    updates[`messages/${convId}/${msgId}`] = {
        ...finalMessageData,
        createdAt: getRtdbServerTimestamp(),
        updatedAt: getRtdbServerTimestamp()
    };

    await update(ref(rtdb), updates);

    return msgId;
}

export async function createAndSendMediaAlbumMessage(
    convId: string,
    senderId: string,
    files: File[],
    options: {
        replyToId?: string;
        onProgressWithId?: ProgressWithId;
        displayContent: string;
        mentions?: string[];
        messageId?: string;
        content?: string;
    }
): Promise<string> {
    if (files.length === 0) throw new Error('Không có file để gửi');
    
    const createdAt = getServerSyncedNow();
    const newMsgRef = options.messageId 
        ? ref(rtdb, `messages/${convId}/${options.messageId}`)
        : push(ref(rtdb, `messages/${convId}`));
    const msgId = options.messageId || newMsgRef.key!;

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
        content: options.content || '',
        media: mediaPlaceholders,
        mentions: options.mentions || [],
        isForwarded: false,
        isEdited: false,
        isRecalled: false,
        deletedBy: {},
        readBy: {},
        deliveredTo: {},
        reactions: {},
        createdAt,
        updatedAt: createdAt
    };

    assignReplyToIdIfPresent(messageData, options.replyToId);

    const bytesByIndex = new Array(files.length).fill(0);
    const totalBytesByIndex = new Array(files.length).fill(0);

    const reportProgress = (state: 'running' | 'paused' | 'success' | 'error' | 'canceled') => {
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

        const fileUrl = await uploadWithProgress(path, uploadFile, (progress) => {
            bytesByIndex[index] = progress.bytesTransferred;
            totalBytesByIndex[index] = progress.totalBytes;
            reportProgress(progress.state);
        });

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
        const finalMessageData = { ...messageData, media };

        const conversation = await ensureConversationExists(convId, senderId);
        if (!conversation) throw new Error('Conversation not found');

        const updates = getConversationUpdatePaths(convId, senderId, finalMessageData, options.displayContent, conversation, msgId);
        updates[`messages/${convId}/${msgId}`] = {
            ...finalMessageData,
            createdAt: getRtdbServerTimestamp(),
            updatedAt: getRtdbServerTimestamp()
        };

        await update(ref(rtdb), updates);
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
