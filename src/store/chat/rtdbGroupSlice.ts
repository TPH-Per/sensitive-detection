import { StateCreator } from 'zustand';
import { MediaObject } from '../../../shared/types';
import { rtdbGroupService } from '../../services/chat/rtdbGroupService';
import { useAuthStore } from '../authStore';
import { RtdbConversationSlice } from './rtdbConversationSlice';

export interface RtdbGroupSlice {
    createGroup: (creatorId: string, memberIds: string[], groupName: string, groupAvatar?: File | MediaObject) => Promise<string>;
    updateGroupInfo: (conversationId: string, updates: { name?: string; avatar?: MediaObject }) => Promise<void>;
    addMember: (conversationId: string, userId: string | string[]) => Promise<void>;
    removeMember: (conversationId: string, userId: string) => Promise<void>;
    leaveGroup: (conversationId: string, userId: string) => Promise<void>;
    updateMemberRole: (conversationId: string, userId: string, role: 'admin' | 'member') => Promise<void>;
    disbandGroup: (conversationId: string) => Promise<void>;
    sendGroupSystemMessage: (conversationId: string, actorId: string, content: string) => Promise<void>;
}

type RtdbGroupSliceWithConversation = RtdbGroupSlice & RtdbConversationSlice;

export const createRtdbGroupSlice: StateCreator<RtdbGroupSliceWithConversation, [], [], RtdbGroupSlice> = (set, get) => ({
    createGroup: async (creatorId: string, memberIds: string[], groupName: string, groupAvatar?: File | MediaObject) => {
        try {
            let avatarMedia: MediaObject | undefined;

            // If groupAvatar is a File, upload it first
            if (groupAvatar instanceof File) {
                const conversationId = await rtdbGroupService.createGroup(creatorId, groupName, memberIds);
                avatarMedia = await rtdbGroupService.uploadGroupAvatar(conversationId, groupAvatar);
                await rtdbGroupService.updateGroupInfo(conversationId, { avatar: avatarMedia });
                set({ selectedConversationId: conversationId });
                return conversationId;
            } else {
                // groupAvatar is already MediaObject or undefined
                const conversationId = await rtdbGroupService.createGroup(creatorId, groupName, memberIds, groupAvatar);
                set({ selectedConversationId: conversationId });
                return conversationId;
            }
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi tạo nhóm:', error);
            throw error;
        }
    },

    updateGroupInfo: async (conversationId: string, updates: { name?: string; avatar?: MediaObject }) => {
        try {
            await rtdbGroupService.updateGroupInfo(conversationId, updates);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi cập nhật thông tin nhóm:', error);
            throw error;
        }
    },

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

    leaveGroup: async (conversationId: string, userId: string) => {
        set((state) => ({
            conversations: state.conversations.filter(c => c.id !== conversationId),
            selectedConversationId: state.selectedConversationId === conversationId ? null : state.selectedConversationId
        }));

        try {
            await rtdbGroupService.leaveGroup(conversationId, userId);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi rời nhóm:', error);
            throw error;
        }
    },

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

    sendGroupSystemMessage: async (conversationId: string, actorId: string, content: string) => {
        try {
            await rtdbGroupService.sendGroupSystemMessage(conversationId, actorId, content);
        } catch (error) {
            console.error('[rtdbGroupSlice] Lỗi sendGroupSystemMessage:', error);
            throw error;
        }
    }
});
