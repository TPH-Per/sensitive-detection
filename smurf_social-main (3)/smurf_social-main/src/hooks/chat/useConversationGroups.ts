import { useMemo } from 'react';
import { RtdbConversation, RtdbUserChat } from '../../../shared/types';
import { useRtdbChatStore } from '../../store';

interface UseConversationGroupsProps {
  conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
  currentUserId: string;
  currentUserFriendIds: string[];
  viewMode: 'normal' | 'archived';
  activeFilter: 'all' | 'group' | 'stranger';
}

export const useConversationGroups = ({
  conversations,
  currentUserId,
  currentUserFriendIds,
  viewMode,
  activeFilter
}: UseConversationGroupsProps) => {

  const { friendConversations, requestConversations } = useMemo(() => {
    const friends: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }> = [];
    const requests: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }> = [];

    conversations.forEach(conv => {
      if (conv.data.isGroup) {
        friends.push(conv);
      } else {
        const participantIds = Object.keys(conv.data.members);
        const partnerId = participantIds.find(id => id !== currentUserId);
        if (partnerId && currentUserFriendIds.includes(partnerId)) {
          friends.push(conv);
        } else {
          requests.push(conv);
        }
      }
    });

    const sortFn = (a: typeof friends[0], b: typeof friends[0]) => {
      const isAPinned = a.userChat?.isPinned ?? false;
      const isBPinned = b.userChat?.isPinned ?? false;
      if (isAPinned && !isBPinned) return -1;
      if (!isAPinned && isBPinned) return 1;
      return (b.userChat?.lastMsgTimestamp || b.data.updatedAt || 0) - (a.userChat?.lastMsgTimestamp || a.data.updatedAt || 0);
    };

    return {
      friendConversations: friends.sort(sortFn),
      requestConversations: requests.sort(sortFn)
    };
  }, [conversations, currentUserId, currentUserFriendIds]);

  const displayConversations = useMemo(() => {
    if (viewMode === 'archived') {
      return conversations
        .filter(c => c.userChat?.isArchived)
        .sort((a, b) => (b.userChat?.lastMsgTimestamp || b.data.updatedAt || 0) - (a.userChat?.lastMsgTimestamp || a.data.updatedAt || 0));
    }

    const filteredList = friendConversations.filter(conv => {
      if (conv.userChat?.isArchived) return false;

      const clearedAt = conv.userChat?.clearedAt || 0;
      const lastMsgTimestamp = conv.userChat?.lastMsgTimestamp || conv.data.lastMessage?.timestamp || conv.data.updatedAt || 0;
      if (clearedAt > 0 && lastMsgTimestamp <= clearedAt) return false;

      return true;
    });

    if (activeFilter === 'group') {
      return filteredList.filter(c => c.data.isGroup);
    }
    
    if (activeFilter === 'stranger') {
      return requestConversations.filter(conv => {
        const clearedAt = conv.userChat?.clearedAt || 0;
        const lastMsgTimestamp = conv.data.lastMessage?.timestamp || conv.data.updatedAt || 0;
        return !(clearedAt > 0 && lastMsgTimestamp <= clearedAt);
      });
    }


    const allConversations = filteredList;

    return allConversations.sort((a, b) => {
      const isAPinned = a.userChat?.isPinned ?? false;
      const isBPinned = b.userChat?.isPinned ?? false;
      if (isAPinned && !isBPinned) return -1;
      if (!isAPinned && isBPinned) return 1;
      return (b.userChat?.lastMsgTimestamp || b.data.updatedAt || 0) - (a.userChat?.lastMsgTimestamp || a.data.updatedAt || 0);
    });
  }, [viewMode, friendConversations, conversations, activeFilter, requestConversations]);

  const strangerUnreadCount = useMemo(() => {
    return requestConversations.reduce((sum, conv) => {
      const clearedAt = conv.userChat?.clearedAt || 0;
      const lastMsgTimestamp = conv.data.lastMessage?.timestamp || conv.data.updatedAt || 0;
      if (clearedAt > 0 && lastMsgTimestamp <= clearedAt) return sum;
      return sum + (conv.userChat?.unreadCount || 0);
    }, 0);
  }, [requestConversations]);

  return {
    friendConversations,
    requestConversations: requestConversations.filter(conv => {
      const clearedAt = conv.userChat?.clearedAt || 0;
      const lastMsgTimestamp = conv.data.lastMessage?.timestamp || conv.data.updatedAt || 0;
      return !(clearedAt > 0 && lastMsgTimestamp <= clearedAt);
    }),
    displayConversations,
    strangerUnreadCount
  };
};
