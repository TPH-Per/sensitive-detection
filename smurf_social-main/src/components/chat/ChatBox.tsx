import React, { useMemo } from 'react';
import { RtdbMessage, User, UserStatus, RtdbConversation, RtdbUserChat } from '../../../shared/types';
import { Loading } from '../ui';
import { ChatBoxSkeleton } from './ChatBoxSkeleton';
import { MessageRequestBanner } from './message/MessageRequestBanner';
import { useChatScroll } from '../../hooks/chat/useChatScroll';
import { ChatBoxHeader } from './ChatBoxHeader';
import { MessageList } from './MessageList';
import { TypingIndicator } from './TypingIndicator';
import { useMessageStatus } from '../../hooks/chat/useMessageStatus';

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
  partnerStatus?: UserStatus;
  myBlockOptions?: {
    blockMessages: boolean; blockCalls: boolean;
    blockViewMyActivity: boolean; hideTheirActivity: boolean;
  };
  onUnblock?: () => void;
  onManageBlock?: () => void;
  shouldShowBlockBanner?: boolean;
  onCall?: (isVideo: boolean) => void;
  onVideoCall?: () => void;
  canCall?: boolean;
  onJoinCall?: (callType: 'voice' | 'video') => void;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
  conversation, messages, participants, currentUserId,
  currentUserFriendIds = [], friendRequestStatus = 'none',
  usersMap, typingUsers, onBack, onInfoClick,
  onRecall, onDeleteForMe, onForward, onReply, onEdit,
  onAddFriend, onAcceptFriend, onBlock,
  isLoading, isLoadingMore, hasMoreMessages, onLoadMore,
  isBlocked = false, isBlockedByMe = false, partnerStatus,
  myBlockOptions, onUnblock, onManageBlock, shouldShowBlockBanner = false,
  onCall, onVideoCall, canCall = true, onJoinCall,
}) => {
  const { messagesEndRef, messagesContainerRef, handleScroll } = useChatScroll({
    messages,
    conversationId: conversation.id,
    isLoading: !!isLoading,
    hasMoreMessages: !!hasMoreMessages,
    isLoadingMore: !!isLoadingMore,
    onLoadMore,
  });

  const partner = useMemo(() =>
    conversation.data.isGroup ? null : participants.find(p => p.id !== currentUserId),
    [conversation.data.isGroup, participants, currentUserId]
  );

  const chatName = conversation.data.isGroup
    ? conversation.data.name
    : partner?.fullName || 'Không rõ';
  const avatarSrc = conversation.data.isGroup
    ? conversation.data.avatar?.url
    : partner?.avatar?.url;

  const isPartnerBanned = partnerStatus === UserStatus.BANNED || partner?.status === UserStatus.BANNED;

  const isMessageRequest = useMemo(() =>
    !conversation.data.isGroup &&
    partner !== null && partner !== undefined &&
    !isPartnerBanned &&
    !currentUserFriendIds.includes(partner.id) &&
    !isBlockedByMe && !isBlocked,
    [conversation.data.isGroup, partner, isPartnerBanned, currentUserFriendIds, isBlockedByMe, isBlocked]
  );

  const resolvedPartnerStatus = isPartnerBanned
    ? UserStatus.BANNED
    : (partnerStatus ?? partner?.status);

  const { lastReadByMap } = useMessageStatus({
    messages, conversation, currentUserId, usersMap,
    partnerStatus: resolvedPartnerStatus,
  });

  return (
    <div className="relative flex-1 flex flex-col min-h-0 bg-bg-chat transition-theme">
      <ChatBoxHeader
        conversation={conversation}
        participants={participants}
        chatName={chatName}
        avatarSrc={avatarSrc}
        partner={partner || undefined}
        usersMap={usersMap}
        onBack={onBack}
        onInfoClick={onInfoClick}
        onCall={() => onCall?.(false)}
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
        className="flex-1 overflow-y-auto overflow-x-hidden bg-bg-chat scroll-hide"
      >
        {isLoading ? (
          <ChatBoxSkeleton />
        ) : conversation.data.isDisbanded ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <p className="text-sm text-text-secondary">
              Nhóm đã giải tán. Bạn có thể xóa hội thoại này.
            </p>
          </div>
        ) : (
          <div className="px-3 md:px-4 py-4 min-h-full">
            {isLoadingMore && (
              <div className="flex justify-center py-3">
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
              partnerStatus={resolvedPartnerStatus}
              onCall={onCall}
              onJoinCall={onJoinCall}
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
