import { useCallback } from 'react';
import { MediaObject } from '../../../shared/types';
import { useRtdbChatStore } from '../../store';
import { toast } from '../../store/toastStore';

interface UseChatGroupsProps {
  selectedConversationId: string | null;
  currentUserId: string | null;
  conversations: Array<{ id: string; data: any }>;
}

/** Hook quản lý các hành động trong nhóm chat */
export const useChatGroups = ({
  selectedConversationId,
  currentUserId,
  conversations,
}: UseChatGroupsProps) => {
  const {
    createGroup,
    updateGroupInfo,
    addMember,
    inviteMember,
    approveMembers,
    rejectMembers,
    toggleApprovalMode,
    removeMember,
    leaveGroup,
    updateMemberRole,
    transferCreator,
    disbandGroup,
    getGroupInviteLink,
    regenerateGroupInviteLink,
    joinGroupByLink,
    fetchGroupInviteInfo,
  } = useRtdbChatStore();

  const handleCreateGroup = useCallback(async (

    memberIds: string[],
    groupName: string,
    groupAvatar?: File | MediaObject,
  ) => {
    if (!currentUserId) return;
    await createGroup(currentUserId, memberIds, groupName, groupAvatar);
  }, [currentUserId, createGroup]);


  const handleAddMembers = useCallback(async (userIds: string[]) => {
    if (!selectedConversationId) return;
    try {
      await addMember(selectedConversationId, userIds);
    } catch (error) {
      console.error('[useChatGroups] Lỗi thêm thành viên:', error);
    }
  }, [selectedConversationId, addMember]);


  const handleInviteMembers = useCallback(async (userIds: string[]) => {
    if (!selectedConversationId || !currentUserId) return;
    try {
      for (const uid of userIds) {
        await inviteMember(selectedConversationId, uid);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Không thể mời thành viên');
    }
  }, [selectedConversationId, currentUserId, inviteMember]);

  const handleApproveMembers = useCallback(async (uids: string[]) => {
    if (!selectedConversationId || !currentUserId) return;
    await approveMembers(selectedConversationId, uids);
  }, [selectedConversationId, currentUserId, approveMembers]);

  const handleRejectMembers = useCallback(async (uids: string[]) => {
    if (!selectedConversationId || !currentUserId) return;
    await rejectMembers(selectedConversationId, uids);
  }, [selectedConversationId, currentUserId, rejectMembers]);

  const handleToggleApprovalMode = useCallback(async (enabled: boolean) => {
    if (!selectedConversationId || !currentUserId) return;
    await toggleApprovalMode(selectedConversationId, enabled);
  }, [selectedConversationId, currentUserId, toggleApprovalMode]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    try {
      await removeMember(selectedConversationId, userId);
    } catch (error: any) {
      toast.error(error?.message || 'Không thể xóa thành viên');
    }
  }, [selectedConversationId, removeMember]);

  const handleLeaveGroup = useCallback(async (conversationId?: string): Promise<{ needAssignAdmin: boolean }> => {
    const id = conversationId || selectedConversationId;
    if (!id || !currentUserId) return { needAssignAdmin: false };

    const conv = conversations.find(c => c.id === id);

    if (conv?.data?.isGroup && conv.data.creatorId === currentUserId) {
      const memberCount = Object.keys(conv.data.members || {}).length;
      if (memberCount > 1) {
        return { needAssignAdmin: true };
      }
    }

    await leaveGroup(id, currentUserId);
    return { needAssignAdmin: false };
  }, [selectedConversationId, currentUserId, conversations, leaveGroup]);

  const handleAssignAdminAndLeave = useCallback(async (newAdminId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await updateMemberRole(selectedConversationId, newAdminId, 'admin');
    await leaveGroup(selectedConversationId, currentUserId);
  }, [selectedConversationId, currentUserId, updateMemberRole, leaveGroup]);


  const handleTransferCreator = useCallback(async (newCreatorId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await transferCreator(selectedConversationId, newCreatorId);
  }, [selectedConversationId, currentUserId, transferCreator]);

  const handlePromoteToAdmin = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    await updateMemberRole(selectedConversationId, userId, 'admin');
  }, [selectedConversationId, updateMemberRole]);

  const handleDemoteFromAdmin = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    await updateMemberRole(selectedConversationId, userId, 'member');
  }, [selectedConversationId, updateMemberRole]);

  const handleEditGroup = useCallback(async (updates: { name?: string; avatar?: MediaObject }) => {
    if (!selectedConversationId) return;
    await updateGroupInfo(selectedConversationId, updates);
  }, [selectedConversationId, updateGroupInfo]);

  const handleDisbandGroup = useCallback(async (conversationId?: string) => {
    const id = conversationId || selectedConversationId;
    if (!id) return;
    await disbandGroup(id);
  }, [selectedConversationId, disbandGroup]);

  const handleCopyInviteLink = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      const inviteLink = await getGroupInviteLink(selectedConversationId);
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Đã sao chép link tham gia nhóm');
    } catch (error: any) {
      toast.error(error?.message || 'Không thể sao chép link nhóm');
    }
  }, [selectedConversationId, getGroupInviteLink]);

  const handleResetInviteLink = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      const inviteLink = await regenerateGroupInviteLink(selectedConversationId);
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Đã reset và sao chép link nhóm mới');
    } catch (error: any) {
      toast.error(error?.message || 'Không thể reset link nhóm');
    }
  }, [selectedConversationId, regenerateGroupInviteLink]);

  const handleJoinGroupByLink = useCallback(async (token: string) => {
    return await joinGroupByLink(token);
  }, [joinGroupByLink]);

  return {
    handleCreateGroup,
    handleAddMembers,
    handleInviteMembers,
    handleApproveMembers,
    handleRejectMembers,
    handleToggleApprovalMode,
    handleRemoveMember,
    handleLeaveGroup,
    handleAssignAdminAndLeave,
    handleTransferCreator,
    handlePromoteToAdmin,
    handleDemoteFromAdmin,
    handleEditGroup,
    handleDisbandGroup,
    handleCopyInviteLink,
    handleResetInviteLink,
    handleJoinGroupByLink,
    fetchGroupInviteInfo,
  };
};

