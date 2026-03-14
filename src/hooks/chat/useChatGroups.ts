import { useCallback } from 'react';
import { MediaObject } from '../../../shared/types';
import { useRtdbChatStore } from '../../store';

interface UseChatGroupsProps {
  selectedConversationId: string | null;
  currentUserId: string | null;
  conversations: Array<{ id: string; data: any }>;
  usersMap: Record<string, any>;
  currentUserName?: string;
}

// Qu?n lý nhóm chat
export const useChatGroups = ({
  selectedConversationId,
  currentUserId,
  conversations,
  usersMap,
}: UseChatGroupsProps) => {
  const {
    createGroup,
    updateGroupInfo,
    addMember,
    removeMember,
    leaveGroup,
    updateMemberRole,
    disbandGroup,
    sendGroupSystemMessage,
  } = useRtdbChatStore();

  const getName = (uid: string) => usersMap[uid]?.fullName || 'Ngu?i dùng';
  const getActorName = () => (currentUserId ? getName(currentUserId) : 'Ngu?i dùng');

  const handleCreateGroup = useCallback(async (
    memberIds: string[],
    groupName: string,
    groupAvatar?: File | MediaObject,
  ) => {
    if (!currentUserId) return;
    const conversationId = await createGroup(currentUserId, memberIds, groupName, groupAvatar);
    await sendGroupSystemMessage(conversationId, currentUserId, `${getActorName()} dã t?o nhóm`);
  }, [currentUserId, createGroup, sendGroupSystemMessage, getActorName]);

  const handleAddMembers = useCallback(async (userIds: string[]) => {
    if (!selectedConversationId) return;
    try {
      await addMember(selectedConversationId, userIds);
      if (currentUserId) {
        const names = userIds.map((id) => getName(id)).join(', ');
        await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã thêm ${names} vào nhóm`);
      }
    } catch (error) {
      console.error(error);
    }
  }, [selectedConversationId, addMember, sendGroupSystemMessage, currentUserId, getActorName, getName]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    await removeMember(selectedConversationId, userId);
    if (currentUserId) {
      await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã xóa ${getName(userId)} kh?i nhóm`);
    }
  }, [selectedConversationId, removeMember, sendGroupSystemMessage, currentUserId, getActorName, getName]);

  const handleLeaveGroup = useCallback(async (): Promise<{ needAssignAdmin: boolean }> => {
    if (!selectedConversationId || !currentUserId) return { needAssignAdmin: false };

    const conv = conversations.find(c => c.id === selectedConversationId);

    if (conv?.data?.isGroup && conv.data.creatorId === currentUserId) {
      const memberCount = Object.keys(conv.data.members || {}).length;
      if (memberCount > 1) {
        return { needAssignAdmin: true };
      }
    }

    await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã r?i nhóm`);
    await leaveGroup(selectedConversationId, currentUserId);
    return { needAssignAdmin: false };
  }, [selectedConversationId, currentUserId, conversations, leaveGroup, sendGroupSystemMessage, getActorName]);

  const handleAssignAdminAndLeave = useCallback(async (newAdminId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await updateMemberRole(selectedConversationId, newAdminId, 'admin');
    await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã chuy?n quy?n qu?n tr? cho ${getName(newAdminId)}`);
    await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã r?i nhóm`);
    await leaveGroup(selectedConversationId, currentUserId);
  }, [selectedConversationId, currentUserId, updateMemberRole, leaveGroup, sendGroupSystemMessage, getActorName, getName]);

  const handlePromoteToAdmin = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    await updateMemberRole(selectedConversationId, userId, 'admin');
    if (currentUserId) {
      await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã thang ${getName(userId)} làm qu?n tr? viên`);
    }
  }, [selectedConversationId, updateMemberRole, sendGroupSystemMessage, currentUserId, getActorName, getName]);

  const handleDemoteFromAdmin = useCallback(async (userId: string) => {
    if (!selectedConversationId) return;
    await updateMemberRole(selectedConversationId, userId, 'member');
    if (currentUserId) {
      await sendGroupSystemMessage(selectedConversationId, currentUserId, `${getActorName()} dã h? quy?n qu?n tr? viên c?a ${getName(userId)}`);
    }
  }, [selectedConversationId, updateMemberRole, sendGroupSystemMessage, currentUserId, getActorName, getName]);

  const handleEditGroup = useCallback(async (updates: { name?: string; avatar?: MediaObject }) => {
    if (!selectedConversationId) return;
    await updateGroupInfo(selectedConversationId, updates);
    if (currentUserId) {
      const conv = conversations.find(c => c.id === selectedConversationId);
      const nameChanged = updates.name && updates.name !== conv?.data?.name;
      const avatarChanged = !!updates.avatar;
      let content = '';
      if (nameChanged && avatarChanged) {
        content = `${getActorName()} dã c?p nh?t ?nh nhóm và d?i tên nhóm thành "${updates.name}"`;
      } else if (nameChanged) {
        content = `${getActorName()} dã d?i tên nhóm thành "${updates.name}"`;
      } else if (avatarChanged) {
        content = `${getActorName()} dã c?p nh?t ?nh nhóm`;
      }
      if (content) {
        await sendGroupSystemMessage(selectedConversationId, currentUserId, content);
      }
    }
  }, [selectedConversationId, updateGroupInfo, currentUserId, conversations, sendGroupSystemMessage, getActorName]);

  const handleDisbandGroup = useCallback(async () => {
    if (!selectedConversationId) return;
    await disbandGroup(selectedConversationId);
  }, [selectedConversationId, disbandGroup]);

  return {
    handleCreateGroup,
    handleAddMembers,
    handleRemoveMember,
    handleLeaveGroup,
    handleAssignAdminAndLeave,
    handlePromoteToAdmin,
    handleDemoteFromAdmin,
    handleEditGroup,
    handleDisbandGroup,
  };
};
