import { StateCreator } from 'zustand';
import { MediaObject } from '../../../shared/types';
import { rtdbGroupService } from '../../services/chat/rtdbGroupService';
import { useAuthStore } from '../authStore';
import { RtdbConversationSlice } from './rtdbConversationSlice';
import { RtdbMessageSlice } from './rtdbMessageSlice';

export interface RtdbGroupSlice {
    createGroup: (creatorId: string, memberIds: string[], groupName: string, groupAvatar?: File | MediaObject) => Promise<string>;
    updateGroupInfo: (conversationId: string, updates: { name?: string; avatar?: MediaObject }) => Promise<void>;
    addMember: (conversationId: string, userId: string | string[]) => Promise<void>;
    inviteMember: (conversationId: string, userId: string) => Promise<'direct' | 'pending'>;
    approveMembers: (conversationId: string, uids: string[]) => Promise<void>;
    rejectMembers: (conversationId: string, uids: string[]) => Promise<void>;
    toggleApprovalMode: (conversationId: string, enabled: boolean) => Promise<string[]>;
    removeMember: (conversationId: string, userId: string) => Promise<void>;
    leaveGroup: (conversationId: string, userId: string) => Promise<void>;
    updateMemberRole: (conversationId: string, userId: string, role: 'admin' | 'member') => Promise<void>;
    transferCreator: (conversationId: string, newCreatorId: string) => Promise<void>;
    disbandGroup: (conversationId: string) => Promise<void>;
    getGroupInviteLink: (conversationId: string) => Promise<string>;
    regenerateGroupInviteLink: (conversationId: string) => Promise<string>;
    joinGroupByLink: (token: string) => Promise<{ status: 'joined' | 'pending' | 'already_member' | 'invalid' | 'disbanded' | 'full'; convId?: string }>;
    fetchGroupInviteInfo: (token: string) => Promise<{
        status: 'success' | 'invalid' | 'disbanded';
        convId?: string;
        name?: string;
        avatar?: MediaObject;
        members?: any[];
        memberCount?: number;
        isMember?: boolean;
        isPending?: boolean;
        joinApprovalMode?: boolean;
    }>;
    globalInviteInfo: {
        token: string | null;
        info: any | null;
        isFetching: boolean;
        isJoining: boolean;
    };
    setGlobalInviteInfo: (updates: Partial<RtdbGroupSlice['globalInviteInfo']>) => void;
    handleGlobalJoinConfirm: () => Promise<{ status: 'joined' | 'pending' | 'already_member' | 'invalid' | 'disbanded' | 'full'; convId?: string }>;
}

type RtdbGroupSliceWithConversation = RtdbGroupSlice & RtdbConversationSlice & RtdbMessageSlice;

export const createRtdbGroupSlice: StateCreator<RtdbGroupSliceWithConversation, [], [], RtdbGroupSlice> = (set, _get) => ({
    /** Tạo nhóm mới và xử lý avatar */
    createGroup: async (creatorId: string, memberIds: string[], groupName: string, groupAvatar?: File | MediaObject) => {
        try {
            let avatarMedia: MediaObject | undefined;

            if (groupAvatar instanceof File) {
                const conversationId = await rtdbGroupService.createGroup(creatorId, groupName, memberIds);
                avatarMedia = await rtdbGroupService.uploadGroupAvatar(conversationId, groupAvatar);
                await rtdbGroupService.updateGroupInfo(conversationId, { avatar: avatarMedia });
                set({ selectedConversationId: conversationId });
                return conversationId;
            } else {
                const conversationId = await rtdbGroupService.createGroup(creatorId, groupName, memberIds, groupAvatar);
                set({ selectedConversationId: conversationId });
                return conversationId;
            }
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi tạo nhóm:', error);
            throw error;
        }
    },

    /** Cập nhật thông tin nhóm */
    updateGroupInfo: async (conversationId: string, updates: { name?: string; avatar?: MediaObject }) => {
        try {
            await rtdbGroupService.updateGroupInfo(conversationId, updates);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi cập nhật thông tin nhóm:', error);
            throw error;
        }
    },

    /** Thêm thành viên vào nhóm */
    addMember: async (conversationId: string, userId: string | string[]) => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            const userIds = Array.isArray(userId) ? userId : [userId];
            await rtdbGroupService.addMembers(conversationId, userIds, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi thêm thành viên:', error);
            throw error;
        }
    },

    /** Mời thành viên tham gia nhóm */
    inviteMember: async (conversationId: string, userId: string) => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            return await rtdbGroupService.inviteMember(conversationId, userId, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi mời thành viên:', error);
            throw error;
        }
    },

    /** Duyệt danh sách chờ gia nhập */
    approveMembers: async (conversationId: string, uids: string[]) => {
        try {
            await rtdbGroupService.approveMembers(conversationId, uids);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi duyệt thành viên:', error);
            throw error;
        }
    },

    /** Từ chối danh sách chờ gia nhập */
    rejectMembers: async (conversationId: string, uids: string[]) => {
        try {
            await rtdbGroupService.rejectMembers(conversationId, uids);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi từ chối thành viên:', error);
            throw error;
        }
    },

    /** Thay đổi chế độ duyệt thành viên */
    toggleApprovalMode: async (conversationId: string, enabled: boolean) => {
        try {
            return await rtdbGroupService.toggleApprovalMode(conversationId, enabled);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi toggle approval mode:', error);
            throw error;
        }
    },

    /** Xóa thành viên khỏi nhóm */
    removeMember: async (conversationId: string, userId: string) => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            await rtdbGroupService.removeMember(conversationId, userId, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi xóa thành viên:', error);
            throw error;
        }
    },

    /** Rời khỏi nhóm chat */
    leaveGroup: async (conversationId: string, userId: string) => {
        try {
            await rtdbGroupService.leaveGroup(conversationId, userId);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi rời nhóm:', error);
            throw error;
        }
    },

    /** Cập nhật vai trò thành viên */
    updateMemberRole: async (conversationId: string, userId: string, role: 'admin' | 'member') => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            await rtdbGroupService.updateMemberRole(conversationId, userId, role, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi cập nhật role:', error);
            throw error;
        }
    },

    /** Chuyển nhượng quyền trưởng nhóm */
    transferCreator: async (conversationId: string, newCreatorId: string) => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            await rtdbGroupService.transferCreator(conversationId, newCreatorId, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi chuyển quyền Creator:', error);
            throw error;
        }
    },

    /** Giải tán toàn bộ nhóm */
    disbandGroup: async (conversationId: string) => {
        try {
            const uid = useAuthStore.getState().user?.id;
            if (!uid) throw new Error('Chưa đăng nhập');
            await rtdbGroupService.disbandGroup(conversationId, uid);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi giải tán nhóm:', error);
            throw error;
        }
    },

    /** Lấy link mời nhóm */
    getGroupInviteLink: async (conversationId: string) => {
        try {
            return await rtdbGroupService.getGroupInviteLink(conversationId);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi lấy link mời:', error);
            throw error;
        }
    },

    /** Đặt lại link mời nhóm */
    regenerateGroupInviteLink: async (conversationId: string) => {
        try {
            return await rtdbGroupService.regenerateGroupInviteLink(conversationId);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi đặt lại link mời:', error);
            throw error;
        }
    },

    /** Tham gia nhóm qua link */
    joinGroupByLink: async (token: string) => {
        try {
            return await rtdbGroupService.joinGroupByLink(token);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi tham gia nhóm qua link:', error);
            throw error;
        }
    },

    /** Lấy thông tin nhóm từ link mời */
    fetchGroupInviteInfo: async (token: string) => {
        try {
            return await rtdbGroupService.getGroupInviteInfo(token);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi lấy thông tin nhóm qua link:', error);
            throw error;
        }
    },

    globalInviteInfo: {
        token: null,
        info: null,
        isFetching: false,
        isJoining: false
    },

    setGlobalInviteInfo: (updates) => {
        set((state) => ({
            globalInviteInfo: { ...state.globalInviteInfo, ...updates }
        }));
    },

    handleGlobalJoinConfirm: async () => {
        const { globalInviteInfo, joinGroupByLink, setGlobalInviteInfo, selectConversation } = _get();
        if (!globalInviteInfo.token) return;

        setGlobalInviteInfo({ isJoining: true });
        try {
            const result = await joinGroupByLink(globalInviteInfo.token);
            if (result.status === 'joined' || result.status === 'already_member') {
                if (result.convId) {
                    selectConversation(result.convId);
                }
            }
            setGlobalInviteInfo({ token: null, info: null, isJoining: false });
            return result;
        } catch (error) {
            setGlobalInviteInfo({ isJoining: false });
            throw error;
        }
    }
});

