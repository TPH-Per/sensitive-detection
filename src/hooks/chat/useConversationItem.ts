import { useMemo } from 'react';
import { RtdbConversation, User, RtdbUserChat } from '../../../shared/types';
import { formatChatTime } from '../../utils/dateUtils';
import { useUserCache } from '../../store/userCacheStore';
import { useConversationParticipants } from './useConversationParticipants';

interface UseConversationItemProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  isActive: boolean;
  currentUserFriendIds: string[];
}

// Logic dữ liệu cho từng hội thoại (RTDB version)
export const useConversationItem = ({
  conversation,
  currentUserId,
  isActive,
  currentUserFriendIds
}: UseConversationItemProps) => {

  const { users: usersMap } = useUserCache();
  const participantIds = Object.keys(conversation.data.members);
  const participants = useConversationParticipants(participantIds);

  const partnerId = useMemo(() =>
    conversation.data.isGroup
      ? null
      : participantIds.find(id => id !== currentUserId),
    [conversation.data.isGroup, participantIds, currentUserId]
  );

  const partner = useMemo(() =>
    partnerId ? (usersMap[partnerId] || participants.find(p => p.id === partnerId)) : null,
    [partnerId, usersMap, participants]
  );

  const isDataMissing = !conversation.data.isGroup && (!partner || !partner.fullName);

  const chatInfo = useMemo(() => ({
    name: conversation.data.isGroup ? conversation.data.name || 'Nhóm chưa đặt tên' : partner?.fullName || '',
    avatar: conversation.data.isGroup ? conversation.data.avatar : partner?.avatar,
    status: partner?.status
  }), [conversation.data, partner]);

  const isMessageRequest = useMemo(() =>
    !conversation.data.isGroup && partner && !currentUserFriendIds.includes(partner.id),
    [conversation.data.isGroup, partner, currentUserFriendIds]
  );

  const unreadCount = conversation.userChat?.unreadCount || 0;
  const isUnread = unreadCount > 0 && !isActive;

  const lastMessage = conversation.data.lastMessage;

  const lastMessagePreview = useMemo(() => {
    const clearedAt = conversation.userChat?.clearedAt || 0;
    if (!lastMessage || (lastMessage.timestamp && lastMessage.timestamp <= clearedAt)) {
      return 'Chưa có tin nhắn';
    }

    let content = lastMessage.content;

    if (lastMessage.type === 'text') {
      return content.replace(/@\[([^\]]+)\]/g, '@$1');
    }
    return content;
  }, [lastMessage]);

  const readers = useMemo(() => {
    if (!lastMessage || isMessageRequest) return [];
    const readBy = lastMessage.readBy || {};
    return Object.keys(readBy)
      .filter(uid => uid !== currentUserId)
      .map(uid => participants.find(p => p.id === uid) ?? usersMap[uid])
      .filter((u): u is User => !!u && u.settings?.showReadReceipts !== false);
  }, [lastMessage, participants, usersMap, currentUserId, isMessageRequest]);

  const deliveredUsers = useMemo(() => {
    if (!lastMessage) return [];
    const deliveredTo = lastMessage.deliveredTo || {};
    return Object.keys(deliveredTo).filter(uid => uid !== currentUserId);
  }, [lastMessage, currentUserId]);

  const displayTime = useMemo(() => {
    const time = conversation.data.updatedAt;
    return time ? formatChatTime(new Date(time)) : '';
  }, [conversation.data.updatedAt]);

  return useMemo(() => ({
    partner,
    participants,
    isDataMissing,
    chatInfo,
    isMessageRequest,
    isUnread,
    unreadCount,
    lastMessage,
    lastMessagePreview,
    isLastMessageMine: lastMessage?.senderId === currentUserId,
    readers,
    isLastMessageRead: readers.length > 0,
    isLastMessageDelivered: deliveredUsers.length > 0,
    displayTime
  }), [
    partner,
    participants,
    isDataMissing,
    chatInfo,
    isMessageRequest,
    isUnread,
    unreadCount,
    lastMessage,
    lastMessagePreview,
    currentUserId,
    readers,
    deliveredUsers,
    displayTime
  ]);
};
