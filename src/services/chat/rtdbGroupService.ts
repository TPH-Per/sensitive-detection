import { ref, set, get, update, push, increment } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbConversation, RtdbUserChat, MediaObject, MemberRole } from '../../../shared/types';
import { uploadWithProgress, UploadProgress, deleteStorageFile } from '../../utils/uploadUtils';
import { compressImage } from '../../utils/imageUtils';
import { IMAGE_COMPRESSION, GROUP_LIMITS } from '../../constants';
import { systemMessages } from '../../constants/systemMessages';

export const rtdbGroupService = {
    sendGroupSystemMessage: async (
        convId: string,
        actorId: string,
        content: string
    ): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (!convSnap.exists()) return;

            const conversation = convSnap.val() as RtdbConversation;
            const memberIds = Object.keys(conversation.members || {});
            const now = Date.now();

            const systemMsgRef = push(ref(rtdb, `messages/${convId}`));
            const systemMsgId = systemMsgRef.key!;

            const updates: Record<string, any> = {};
            updates[`messages/${convId}/${systemMsgId}`] = {
                senderId: 'system',
                type: 'system',
                content,
                media: [],
                createdAt: now,
                updatedAt: now
            };

            updates[`conversations/${convId}/lastMessage`] = {
                senderId: 'system',
                content,
                type: 'system',
                timestamp: now,
                messageId: systemMsgId
            };
            updates[`conversations/${convId}/updatedAt`] = now;

            memberIds.forEach(uid => {
                updates[`user_chats/${uid}/${convId}/lastMsgTimestamp`] = now;
                updates[`user_chats/${uid}/${convId}/updatedAt`] = now;
                if (uid !== actorId) {
                    updates[`user_chats/${uid}/${convId}/unreadCount`] = increment(1);
                }
            });

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi sendGroupSystemMessage:', error);
            throw error;
        }
    },
    /**
     * Tạo nhóm mới
     */
    createGroup: async (
        creatorId: string,
        name: string,
        memberIds: string[],
        avatar?: MediaObject
    ): Promise<string> => {
        try {
            const allMemberIds = [creatorId, ...memberIds.filter(id => id !== creatorId)];

            if (allMemberIds.length > GROUP_LIMITS.MAX_MEMBERS) {
                throw new Error(`Nhóm chỉ được tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`);
            }

            const newConvRef = push(ref(rtdb, 'conversations'));
            const convId = newConvRef.key!;

            const members: Record<string, MemberRole> = {};
            members[creatorId] = 'admin';
            memberIds.forEach(id => {
                if (id !== creatorId) {
                    members[id] = 'member';
                }
            });

            const conversationData: RtdbConversation = {
                isGroup: true,
                name,
                avatar: avatar || null,
                creatorId,
                members,
                typing: {},
                lastMessage: null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await set(newConvRef, conversationData);

            const updates: Record<string, any> = {};
            const now = Date.now();
            allMemberIds.forEach(uid => {
                updates[`user_chats/${uid}/${convId}`] = {
                    isPinned: false,
                    isMuted: false,
                    isArchived: false,
                    unreadCount: 0,
                    lastReadMsgId: null,
                    lastMsgTimestamp: now,
                    clearedAt: 0,
                    createdAt: now,
                    updatedAt: now
                } as RtdbUserChat;
            });

            await update(ref(rtdb), updates);

            return convId;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi createGroup:', error);
            throw error;
        }
    },

    /**
     * Thêm thành viên vào nhóm
     */
    addMembers: async (convId: string, memberIds: string[], actorId: string): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            if (!convSnap.exists()) {
                throw new Error('Nhóm không tồn tại');
            }

            const conversation = convSnap.val() as RtdbConversation;

            if (conversation.members[actorId] !== 'admin') {
                throw new Error('Chỉ Quản trị viên mới có quyền thêm thành viên');
            }

            const currentMemberIds = Object.keys(conversation.members || {});
            
            if (currentMemberIds.length + memberIds.length > GROUP_LIMITS.MAX_MEMBERS) {
                throw new Error(`Nhóm chỉ được tối đa ${GROUP_LIMITS.MAX_MEMBERS} thành viên`);
            }

            const updates: Record<string, any> = {};
            const now = Date.now();

            memberIds.forEach(uid => {
                if (!currentMemberIds.includes(uid)) {
                    updates[`conversations/${convId}/members/${uid}`] = 'member';
                    updates[`user_chats/${uid}/${convId}`] = {
                        isPinned: false,
                        isMuted: false,
                        isArchived: false,
                        unreadCount: 0,
                        lastReadMsgId: null,
                        lastMsgTimestamp: now,
                        clearedAt: 0,
                        createdAt: now,
                        updatedAt: now
                    } as RtdbUserChat;
                }
            });

            updates[`conversations/${convId}/updatedAt`] = now;
            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi addMembers:', error);
            throw error;
        }
    },

    /**
     * Xóa thành viên khỏi nhóm
     */
    removeMember: async (convId: string, uid: string, actorId: string): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (!convSnap.exists()) throw new Error('Nhóm không tồn tại');

            const conversation = convSnap.val() as RtdbConversation;

            if (conversation.members[actorId] !== 'admin') {
                throw new Error('Chỉ Quản trị viên mới có quyền xóa thành viên');
            }

            const updates: Record<string, any> = {};
            updates[`conversations/${convId}/members/${uid}`] = null;
            updates[`conversations/${convId}/updatedAt`] = Date.now();
            updates[`user_chats/${uid}/${convId}`] = null;

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi removeMember:', error);
            throw error;
        }
    },

    /**
     * Giải tán nhóm (Chỉ Creator)
     */
    disbandGroup: async (convId: string, actorId: string): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (!convSnap.exists()) return;

            const conversation = convSnap.val() as RtdbConversation;

            if (conversation.creatorId !== actorId) {
                throw new Error('Chỉ người tạo nhóm mới được quyền giải tán nhóm');
            }

            const now = Date.now();
            const updates: Record<string, any> = {};

            updates[`conversations/${convId}/isDisbanded`] = true;
            updates[`conversations/${convId}/updatedAt`] = now;

            updates[`messages/${convId}`] = null;

            updates[`conversations/${convId}/lastMessage`] = {
                senderId: 'system',
                content: systemMessages.DISBAND_GROUP(),
                type: 'system',
                timestamp: now,
                messageId: null
            };

            const memberIds = Object.keys(conversation.members || {});
            
            memberIds.forEach(uid => {
                if (uid === actorId) {
                    updates[`user_chats/${uid}/${convId}`] = null;
                } else {
                    updates[`user_chats/${uid}/${convId}/lastMsgTimestamp`] = now;
                    updates[`user_chats/${uid}/${convId}/unreadCount`] = increment(1);
                    updates[`user_chats/${uid}/${convId}/updatedAt`] = now;
                }
            });

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi disbandGroup:', error);
            throw error;
        }
    },

    /**
     * Cập nhật thông tin nhóm (tên, avatar)
     */
    updateGroupInfo: async (
        convId: string,
        updates: { name?: string; avatar?: MediaObject }
    ): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const updateData: any = { ...updates, updatedAt: Date.now() };
            await update(convRef, updateData);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi updateGroupInfo:', error);
            throw error;
        }
    },

    /**
     * Cập nhật role của thành viên
     */
    updateMemberRole: async (convId: string, uid: string, role: MemberRole, actorId: string): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);
            if (!convSnap.exists()) throw new Error('Nhóm không tồn tại');

            const conversation = convSnap.val() as RtdbConversation;

            if (conversation.creatorId !== actorId) {
                throw new Error('Chỉ người tạo nhóm mới có quyền thay đổi vai trò thảnh viên');
            }

            const updates: Record<string, any> = {};
            updates[`conversations/${convId}/members/${uid}`] = role;
            updates[`conversations/${convId}/updatedAt`] = Date.now();

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi updateMemberRole:', error);
            throw error;
        }
    },

    /**
     * Rời khỏi nhóm
     */
    leaveGroup: async (convId: string, uid: string): Promise<void> => {
        try {
            const convRef = ref(rtdb, `conversations/${convId}`);
            const convSnap = await get(convRef);

            if (!convSnap.exists()) {
                throw new Error('Nhóm không tồn tại');
            }

            const conversation = convSnap.val() as RtdbConversation;
            const memberIds = Object.keys(conversation.members || {});
            const updates: Record<string, any> = {};
            const now = Date.now();

            if (memberIds.length <= 1) {
                if (conversation.creatorId === uid) {
                    updates[`conversations/${convId}`] = null;
                    updates[`messages/${convId}`] = null;
                    updates[`user_chats/${uid}/${convId}`] = null;
                    await update(ref(rtdb), updates);
                } else {
                    updates[`conversations/${convId}/members/${uid}`] = null;
                    updates[`conversations/${convId}/updatedAt`] = now;
                    updates[`user_chats/${uid}/${convId}`] = null;
                    await update(ref(rtdb), updates);
                }
                return;
            }

            if (conversation.creatorId === uid) {
                const admins = memberIds.filter(id => id !== uid && conversation.members[id] === 'admin');
                const newCreatorId = admins.length > 0 ? admins[0] : memberIds.find(id => id !== uid)!;

                updates[`conversations/${convId}/creatorId`] = newCreatorId;
                if (conversation.members[newCreatorId] !== 'admin') {
                    updates[`conversations/${convId}/members/${newCreatorId}`] = 'admin';
                }
            }
            updates[`conversations/${convId}/members/${uid}`] = null;
            updates[`conversations/${convId}/updatedAt`] = now;
            updates[`user_chats/${uid}/${convId}`] = null;

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi leaveGroup:', error);
            throw error;
        }
    },

    /**
     * Upload ảnh đại diện nhóm
     */
    uploadGroupAvatar: async (
        conversationId: string,
        file: File,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<MediaObject> => {
        try {
            const compressedFile = await compressImage(file, IMAGE_COMPRESSION.AVATAR);

            const fileExt = file.name.split('.').pop();
            const fileName = `group_${conversationId}_${Date.now()}.${fileExt}`;
            const path = `group-avatars/${conversationId}/${fileName}`;

            const convRef = ref(rtdb, `conversations/${conversationId}`);
            const convSnap = await get(convRef);
            const oldAvatar = convSnap.exists() ? (convSnap.val() as RtdbConversation).avatar : null;

            const downloadURL = await uploadWithProgress(path, compressedFile, onProgress);

            const mediaObject: MediaObject = {
                url: downloadURL,
                fileName: file.name,
                mimeType: file.type,
                size: file.size,
                isSensitive: false
            };

            if (oldAvatar?.url) {
                await deleteStorageFile(oldAvatar.url);
            }

            return mediaObject;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi uploadGroupAvatar:', error);
            throw error;
        }
    }
};
