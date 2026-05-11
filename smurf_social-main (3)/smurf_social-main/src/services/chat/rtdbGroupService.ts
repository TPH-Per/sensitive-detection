import { ref, get } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { rtdb, functions } from '../../firebase/config';
import { RtdbConversation, MediaObject, MemberRole } from '../../../shared/types';
import { uploadWithProgress, UploadProgress, deleteStorageFile } from '../../utils/uploadUtils';
import { compressImage } from '../../utils/imageUtils';
import { IMAGE_COMPRESSION } from '../../constants';
import { validateAvatarFile } from '../../utils/fileValidation';

export const rtdbGroupService = {
    /** Tạo nhóm chat mới */
    createGroup: async (
        creatorId: string,
        name: string,
        memberIds: string[],
        avatar?: MediaObject
    ): Promise<string> => {
        try {
            const createGrp = httpsCallable<{ name: string; memberIds: string[]; avatar?: MediaObject }, { convId: string }>(functions, 'createGroup');
            const result = await createGrp({ name, memberIds, avatar });
            return result.data.convId;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi createGroup:', error);
            throw error;
        }
    },

    /** Thêm thành viên vào nhóm */
    addMembers: async (convId: string, memberIds: string[], _actorId: string): Promise<void> => {
        try {
            const addMem = httpsCallable<{ convId: string; memberIds: string[] }>(functions, 'addGroupMembers');
            await addMem({ convId, memberIds });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi addMembers:', error);
            throw error;
        }
    },

    /** Mời người dùng tham gia nhóm */
    inviteMember: async (convId: string, uid: string, _actorId: string): Promise<'direct' | 'pending'> => {
        try {
            const invite = httpsCallable<{ convId: string; targetUid: string }, { result: 'direct' | 'pending' }>(functions, 'inviteMember');
            const result = await invite({ convId, targetUid: uid });
            return result.data.result;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi inviteMember:', error);
            throw error;
        }
    },

    /** Lấy link mời nhóm */
    getGroupInviteLink: async (convId: string): Promise<string> => {
        try {
            const getLink = httpsCallable<{ convId: string; baseUrl: string }, { inviteLink: string }>(functions, 'getGroupInviteLink');
            const result = await getLink({ convId, baseUrl: window.location.origin });
            return result.data.inviteLink;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi getGroupInviteLink:', error);
            throw error;
        }
    },

    /** Đặt lại link mời nhóm */
    regenerateGroupInviteLink: async (convId: string): Promise<string> => {
        try {
            const resetLink = httpsCallable<{ convId: string; baseUrl: string }, { inviteLink: string }>(functions, 'regenerateGroupInviteLink');
            const result = await resetLink({ convId, baseUrl: window.location.origin });
            return result.data.inviteLink;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi regenerateGroupInviteLink:', error);
            throw error;
        }
    },

    /** Tham gia nhóm qua link */
    joinGroupByLink: async (
        token: string
    ): Promise<{ status: 'joined' | 'pending' | 'already_member' | 'invalid' | 'disbanded' | 'full'; convId?: string }> => {
        try {
            const joinLink = httpsCallable<
                { token: string },
                { status: 'joined' | 'pending' | 'already_member' | 'invalid' | 'disbanded' | 'full'; convId?: string }
            >(functions, 'joinGroupByLink');
            const result = await joinLink({ token });
            return result.data;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi joinGroupByLink:', error);
            throw error;
        }
    },
    
    /** Lấy thông tin nhóm từ link mời */
    getGroupInviteInfo: async (
        token: string
    ): Promise<{
        status: 'success' | 'invalid' | 'disbanded';
        convId?: string;
        name?: string;
        avatar?: MediaObject;
        memberCount?: number;
        isMember?: boolean;
        isPending?: boolean;
        joinApprovalMode?: boolean;
    }> => {
        try {
            const getInfo = httpsCallable<{ token: string }, any>(functions, 'getGroupInviteInfo');
            const result = await getInfo({ token });
            return result.data;
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi getGroupInviteInfo:', error);
            throw error;
        }
    },


    /** Phê duyệt thành viên gia nhập */
    approveMembers: async (convId: string, uids: string[]): Promise<void> => {
        try {
            const approve = httpsCallable<{ convId: string; targetUids: string[] }>(functions, 'approveMembers');
            await approve({ convId, targetUids: uids });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi approveMembers:', error);
            throw error;
        }
    },

    /** Từ chối yêu cầu gia nhập */
    rejectMembers: async (convId: string, uids: string[]): Promise<void> => {
        try {
            const reject = httpsCallable<{ convId: string; targetUids: string[] }>(functions, 'rejectMembers');
            await reject({ convId, targetUids: uids });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi rejectMembers:', error);
            throw error;
        }
    },

    /** Chuyển đổi chế độ duyệt thành viên */
    toggleApprovalMode: async (convId: string, enabled: boolean): Promise<string[]> => {
        try {
            const toggle = httpsCallable<{ convId: string; enabled: boolean }>(functions, 'toggleApprovalMode');
            await toggle({ convId, enabled });
            return [];
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi toggleApprovalMode:', error);
            throw error;
        }
    },

    /** Xóa thành viên khỏi nhóm */
    removeMember: async (convId: string, uid: string, _actorId: string): Promise<void> => {
        try {
            const removeMem = httpsCallable<{ convId: string; targetUid: string }>(functions, 'removeGroupMember');
            await removeMem({ convId, targetUid: uid });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi removeMember:', error);
            throw error;
        }
    },

    /** Giải tán nhóm chat */
    disbandGroup: async (convId: string, _actorId: string): Promise<void> => {
        try {
            const disband = httpsCallable<{ convId: string }>(functions, 'disbandGroup');
            await disband({ convId });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi disbandGroup:', error);
            throw error;
        }
    },

    /** Cập nhật thông tin cơ bản của nhóm */
    updateGroupInfo: async (
        convId: string,
        updates: { name?: string; avatar?: MediaObject }
    ): Promise<void> => {
        try {
            const updateGrp = httpsCallable<{ convId: string; name?: string; avatar?: MediaObject }>(functions, 'updateGroupInfo');
            await updateGrp({ convId, ...updates });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi updateGroupInfo:', error);
            throw error;
        }
    },

    /** Cập nhật vai trò thành viên */
    updateMemberRole: async (convId: string, uid: string, role: MemberRole, _actorId: string): Promise<void> => {
        try {
            const updateRole = httpsCallable<{ convId: string; targetUid: string; role: MemberRole }>(functions, 'updateMemberRole');
            await updateRole({ convId, targetUid: uid, role });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi updateMemberRole:', error);
            throw error;
        }
    },

    /** Chuyển nhượng quyền trưởng nhóm */
    transferCreator: async (convId: string, newCreatorId: string, _actorId: string): Promise<void> => {
        try {
            const transfer = httpsCallable<{ convId: string; newCreatorId: string }>(functions, 'transferCreator');
            await transfer({ convId, newCreatorId });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi transferCreator:', error);
            throw error;
        }
    },

    /** Rời khỏi nhóm chat */
    leaveGroup: async (convId: string, _uid: string): Promise<void> => {
        try {
            const leave = httpsCallable<{ convId: string }>(functions, 'leaveGroup');
            await leave({ convId });
        } catch (error) {
            console.error('[rtdbGroupService] Lỗi leaveGroup:', error);
            throw error;
        }
    },

    /** Tải ảnh đại diện nhóm lên Storage */
    uploadGroupAvatar: async (
        conversationId: string,
        file: File,
        onProgress?: (progress: UploadProgress) => void
    ): Promise<MediaObject> => {
        try {
            validateAvatarFile(file);
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
