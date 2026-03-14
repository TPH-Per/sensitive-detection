import { useCallback } from 'react';
import { useRtdbChatStore } from '../../store';

interface UseChatMessagesProps {
  selectedConversationId: string | null;
  currentUserId: string | null;
}

// Xử lý gửi và quản lý tin nhắn
export const useChatMessages = ({
  selectedConversationId,
  currentUserId
}: UseChatMessagesProps) => {
  const {
    sendTextMessage,
    sendImageMessage,
    sendFileMessage,
    sendVideoMessage,
    sendVoiceMessage,
    recallMessage,
    deleteMessageForMe,
    editMessage,
    forwardMessage: storeForwardMessage,
  } = useRtdbChatStore();

  const handleSendText = useCallback(async (
    text: string,
    mentions?: string[],
    replyToId?: string
  ) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendTextMessage(selectedConversationId, currentUserId, text, mentions, replyToId);
  }, [selectedConversationId, currentUserId, sendTextMessage]);

  const handleSendImage = useCallback(async (files: File[], replyToId?: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendImageMessage(selectedConversationId, currentUserId, files, replyToId);
  }, [selectedConversationId, currentUserId, sendImageMessage]);

  const handleSendFile = useCallback(async (file: File, replyToId?: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendFileMessage(selectedConversationId, currentUserId, file, replyToId);
  }, [selectedConversationId, currentUserId, sendFileMessage]);

  const handleSendVideo = useCallback(async (file: File, replyToId?: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendVideoMessage(selectedConversationId, currentUserId, file, replyToId);
  }, [selectedConversationId, currentUserId, sendVideoMessage]);

  const handleSendVoice = useCallback(async (file: File, replyToId?: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendVoiceMessage(selectedConversationId, currentUserId, file, replyToId);
  }, [selectedConversationId, currentUserId, sendVoiceMessage]);

  const handleEditMessage = useCallback(async (messageId: string, text: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await editMessage(selectedConversationId, messageId, text);
  }, [selectedConversationId, currentUserId, editMessage]);

  const handleRecallMessage = useCallback(async (messageId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await recallMessage(selectedConversationId, messageId);
  }, [selectedConversationId, currentUserId, recallMessage]);

  const handleDeleteForMe = useCallback(async (messageId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await deleteMessageForMe(selectedConversationId, messageId, currentUserId);
  }, [selectedConversationId, currentUserId, deleteMessageForMe]);

  const forwardMessage = useCallback(async (conversationId: string, message: any) => {
    if (!currentUserId) return;
    await storeForwardMessage(conversationId, currentUserId, message);
  }, [currentUserId, storeForwardMessage]);

  const replyToMessage = useCallback(async (text: string, replyToId: string) => {
    if (!selectedConversationId || !currentUserId) return;
    await sendTextMessage(selectedConversationId, currentUserId, text, undefined);
  }, [selectedConversationId, currentUserId, sendTextMessage]);

  const handleSendCall = useCallback(async (
    callType: 'voice' | 'video',
    status: 'ended' | 'missed' | 'rejected',
    duration?: number
  ) => {
    console.log('Send call message not yet implemented', callType, status, duration);
  }, []);

  return {
    handleSendText,
    handleSendImage,
    handleSendFile,
    handleSendVideo,
    handleSendVoice,
    handleSendCall,
    handleEditMessage,
    handleRecallMessage,
    handleDeleteForMe,
    forwardMessage,
    replyToMessage,
  };
};
