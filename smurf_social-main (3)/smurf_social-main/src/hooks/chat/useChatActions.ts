import { useCallback } from 'react';
import { useRtdbChatStore } from '../../store';

interface UseChatActionsProps {
  selectedConversationId: string | null;
  currentUserId: string | null;
  selectConversation: (id: string | null) => void;
}

/** Thao tác quản lý hội thoại: ghim, tắt thông báo, lưu trữ */
export const useChatActions = ({
  selectedConversationId,
  currentUserId,
  selectConversation
}: UseChatActionsProps) => {
  const {
    togglePin,
    toggleMute,
    toggleArchive,
    toggleMarkUnread,
    deleteConversation,
    markAllAsRead,
  } = useRtdbChatStore();

  const handlePin = useCallback(async (id: string, pinned: boolean) => {
    if (!currentUserId) return;
    await togglePin(id, currentUserId, pinned);
  }, [togglePin, currentUserId]);

  const handleMute = useCallback(async (id: string, muted: boolean) => {
    if (!currentUserId) return;
    await toggleMute(id, currentUserId, muted);
  }, [toggleMute, currentUserId]);

  const handleDelete = useCallback(async (id: string) => {
    if (!currentUserId) return;
    await deleteConversation(id, currentUserId);
    if (selectedConversationId === id) {
      selectConversation(null);
    }
  }, [deleteConversation, currentUserId, selectedConversationId, selectConversation]);

  const handleArchive = useCallback(async (id: string, archived: boolean) => {
    if (!currentUserId) return;
    await toggleArchive(id, currentUserId, archived);
    if (archived && selectedConversationId === id) {
      selectConversation(null);
    }
  }, [toggleArchive, currentUserId, selectedConversationId, selectConversation]);

  const handleMarkUnread = useCallback(async (id: string, markedUnread: boolean) => {
    if (!currentUserId) return;
    await toggleMarkUnread(id, currentUserId, markedUnread);
  }, [toggleMarkUnread, currentUserId]);

  const handleMarkAllRead = useCallback(async () => {
    if (currentUserId) await markAllAsRead(currentUserId);
  }, [currentUserId, markAllAsRead]);

  return {
    handlePin,
    handleMute,
    handleDelete,
    handleArchive,
    handleMarkUnread,
    handleMarkAllRead,
  };
};
