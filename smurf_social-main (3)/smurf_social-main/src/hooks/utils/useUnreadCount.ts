import { useMemo } from 'react';
import { useRtdbChatStore } from '../../store';
import { useAuthStore } from '../../store/authStore';

/**
 * Tính tổng số tin nhắn chưa đọc
 */
export const useUnreadCount = (): number => {
  const user = useAuthStore(state => state.user);
  const conversations = useRtdbChatStore(state => state.conversations);

  return useMemo(() => {
    if (!user) return 0;
    let total = 0;
    conversations.forEach(conv => {
      const userChat = conv.userChat;
      if (!userChat || userChat.isArchived || userChat.isMuted) return;
      const count = userChat.unreadCount || 0;
      total += count;
    });
    return total;
  }, [user, conversations]);
};
