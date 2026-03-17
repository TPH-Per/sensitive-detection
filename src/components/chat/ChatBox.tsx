import React, { useMemo } from 'react';
import { RtdbMessage, User, RtdbConversation, RtdbUserChat } from '../../../shared/types';
import { Loading } from '../ui';
import { ChatBoxSkeleton } from './ChatBoxSkeleton';
import { MessageRequestBanner } from './message/MessageRequestBanner';
import { useChatScroll } from '../../hooks/chat/useChatScroll';
import { ChatBoxHeader } from './ChatBoxHeader';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { useAuthStore } from '../../store';

interface ChatBoxProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  messages: Array<{ id: string; data: RtdbMessage }>;
  participants: User[];
  currentUserId: string;
  currentUserFriendIds?: string[];
  friendRequestStatus?: 'none' | 'sent' | 'received';
  usersMap: Record<string, User>;
  typingUsers: string[];
  onBack?: () => void;
  onInfoClick?: () => void;
  onRecall?: (messageId: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  onAddFriend?: (userId: string) => void;
  onAcceptFriend?: (userId: string) => void;
  onBlock?: (userId: string) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isBlocked?: boolean;
  isBlockedByMe?: boolean;
  myBlockOptions?: { blockMessages: boolean; blockCalls: boolean; blockViewMyActivity: boolean; hideTheirActivity: boolean };
  onUnblock?: () => void;
  onManageBlock?: () => void;
  shouldShowBlockBanner?: boolean;
  onCall?: (isVideo: boolean) => void;
  onVideoCall?: () => void;
  canCall?: boolean;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  conversation,
  messages,
  participants,
  currentUserId,
  currentUserFriendIds = [],
  friendRequestStatus = 'none',
  usersMap,
  typingUsers,
  onBack,
  onInfoClick,
  onRecall,
  onDeleteForMe,
  onForward,
  onReply,
  onEdit,
  onAddFriend,
  onAcceptFriend,
  onBlock,
  isLoading,
  isLoadingMore,
  hasMoreMessages,
  onLoadMore,
  isBlocked = false,
  isBlockedByMe = false,
  myBlockOptions,
  onUnblock,
  onManageBlock,
  shouldShowBlockBanner = false,
  onCall,
  onVideoCall,
  canCall = true,
}) => {
  const {
    messagesEndRef,
    messagesContainerRef,
    handleScroll
  } = useChatScroll({
    messages,
    conversationId: conversation.id,
    isLoading: !!isLoading,
    hasMoreMessages: !!hasMoreMessages,
    isLoadingMore: !!isLoadingMore,
    onLoadMore
  });

  const partner = useMemo(() =>
    conversation.data.isGroup ? null : participants.find(p => p.id !== currentUserId)
    , [conversation.data.isGroup, participants, currentUserId]);

  const chatName = conversation.data.isGroup ? conversation.data.name : partner?.fullName || 'Không rõ';
  const avatarSrc = conversation.data.isGroup ? conversation.data.avatar?.url : partner?.avatar.url;

  const isMessageRequest = useMemo(() =>
    !conversation.data.isGroup && partner &&
    !currentUserFriendIds.includes(partner.id) &&
    !isBlockedByMe && !isBlocked
    , [conversation.data.isGroup, partner, currentUserFriendIds, isBlockedByMe, isBlocked]);

  const { settings } = useAuthStore();

  const lastReadByMap = useMemo(() => {
    const map: Record<string, User[]> = {};
    const reversed = [...messages].reverse();
    const participantIds = Object.keys(conversation.data.members);
    
    if (settings?.showReadReceipts === false) return map;

    if (conversation.data.isGroup) {
      participantIds.forEach(uid => {
        if (uid === currentUserId) return;
        
        // Chỉ hiển thị nếu người dùng bật "Thông báo đã xem" trong hồ sơ công khai
        const user = usersMap[uid];
        if (user?.settings?.showReadReceipts === false) return;

        const lastReadMsg = reversed.find(m => m.data.readBy?.[uid]);
        if (lastReadMsg) {
          if (!map[lastReadMsg.id]) map[lastReadMsg.id] = [];
          if (user) map[lastReadMsg.id].push(user);
        }
      });

      Object.keys(map).forEach(msgId => {
        const msg = messages.find(m => m.id === msgId);
        if (msg?.data.readBy) {
          const readByEntries = Object.entries(msg.data.readBy);
          map[msgId].sort((a, b) => {
            const aTime = readByEntries.find(([uid]) => uid === a.id)?.[1] || 0;
            const bTime = readByEntries.find(([uid]) => uid === b.id)?.[1] || 0;
            return aTime - bTime;
          });
        }
      });
    } else if (messages.length > 0) {
      const partnerId = participantIds.find(id => id !== currentUserId);
      const partner = partnerId ? usersMap[partnerId] : null;

      if (partnerId && partner && partner.settings?.showReadReceipts !== false) {
        const lastReadMsg = reversed.find(m => m.data.readBy?.[partnerId]);
        if (lastReadMsg) {
          map[lastReadMsg.id] = [partner];
        }
      }
    }
    return map;
  }, [messages, conversation, usersMap, currentUserId, settings?.showReadReceipts]);

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-secondary transition-theme">
      <ChatBoxHeader
        conversation={conversation}
        participants={participants}
        chatName={chatName}
        avatarSrc={avatarSrc}
        partner={partner || undefined}
        usersMap={usersMap}
        onBack={onBack}
        onInfoClick={onInfoClick}
        onCall={() => onCall && onCall(false)}
        onVideoCall={onVideoCall}
        canCall={canCall}
      />

      {isMessageRequest && partner && onAddFriend && onBlock && (
        <MessageRequestBanner
          partnerName={partner.fullName || 'Người dùng'}
          friendRequestStatus={friendRequestStatus}
          onAddFriend={() => onAddFriend(partner.id)}
          onAcceptFriend={onAcceptFriend ? () => onAcceptFriend(partner.id) : undefined}
          onBlock={() => onBlock(partner.id)}
        />
      )}

      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-0 bg-secondary custom-scrollbar"
      >
        {isLoading ? (
          <ChatBoxSkeleton />
        ) : conversation.data.isDisbanded ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-text-secondary text-sm mb-2">
              Nhóm đã giải tán. Bạn có thể xóa hội thoại này.
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4 min-h-full">
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loading size="sm" />
              </div>
            )}

            <MessageList
              messages={messages}
              currentUserId={currentUserId}
              usersMap={usersMap}
              conversation={conversation}
              participants={participants}
              lastReadByMap={lastReadByMap}
              onRecall={onRecall}
              onDeleteForMe={onDeleteForMe}
              onForward={onForward}
              onReply={onReply}
              chatName={chatName}
              avatarSrc={avatarSrc}
              partner={partner || undefined}
              isBlocked={isBlocked}
              onCall={onCall}
              onEdit={onEdit}
            />

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {!conversation.data.isDisbanded && (
        <TypingIndicator
          typingUsers={typingUsers}
          currentUserId={currentUserId}
          usersMap={usersMap}
        />
      )}
    </div>
  );
};
