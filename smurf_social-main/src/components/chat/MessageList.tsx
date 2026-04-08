import React, { useMemo } from 'react';
import { RtdbMessage, User, UserStatus, RtdbConversation, RtdbUserChat } from '../../../shared/types';
import { UserAvatar } from '../ui';
import { MessageBubble } from './message/MessageBubble';

interface MessageListProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  currentUserId: string;
  usersMap: Record<string, User>;
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  participants: User[];
  lastReadByMap: Record<string, User[]>;
  onRecall?: (messageId: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  onCall?: (isVideo: boolean) => void;
  onJoinCall?: (callType: 'voice' | 'video') => void;
  chatName: string;
  avatarSrc?: string;
  partner?: User;
  isBlocked?: boolean;
  partnerStatus?: UserStatus;
}

const MessageListInner: React.FC<MessageListProps> = ({
  messages, currentUserId, usersMap, conversation, participants,
  lastReadByMap, onRecall, onDeleteForMe, onForward, onReply, onEdit,
  onCall, onJoinCall, chatName, avatarSrc, partner,
  isBlocked = false, partnerStatus,
}) => {
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Array<{ id: string; data: RtdbMessage }> }[] = [];
    let currentDate = '';

    const visible = messages.filter(
      msg => !msg.data.deletedBy || !msg.data.deletedBy[currentUserId]
    );

    visible.forEach((msg) => {
      const msgDate = new Date(msg.data.createdAt).toLocaleDateString('vi-VN');
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  }, [messages, currentUserId]);

  const shouldShowAvatar = (
    msg: { id: string; data: RtdbMessage },
    index: number,
    dayMessages: Array<{ id: string; data: RtdbMessage }>
  ): boolean => {
    if (msg.data.senderId === currentUserId) return false;
    if (index === dayMessages.length - 1) return true;
    return dayMessages[index + 1].data.senderId !== msg.data.senderId;
  };

  const shouldShowName = (
    msg: { id: string; data: RtdbMessage },
    index: number,
    dayMessages: Array<{ id: string; data: RtdbMessage }>
  ): boolean => {
    if (!conversation.data.isGroup) return false;
    if (msg.data.senderId === currentUserId) return false;
    if (index === 0) return true;
    return dayMessages[index - 1].data.senderId !== msg.data.senderId;
  };

  /* ── Empty state ── */
  if (groupedMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12">
        <UserAvatar
          userId={conversation.data.isGroup ? '' : partner?.id ?? ''}
          src={avatarSrc}
          name={chatName}
          size="xl"
          isGroup={conversation.data.isGroup}
          members={participants}
          initialStatus={partner?.status}
          showStatus={false}
        />
        <h3 className="text-base font-semibold text-text-primary mt-4 mb-1">{chatName}</h3>
        <p className="text-sm text-text-secondary">Bắt đầu cuộc trò chuyện</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groupedMessages.map((group, groupIndex) => (
        <div key={groupIndex}>
          {/* Date separator */}
          <div className="flex items-center justify-center my-4">
            <span className="bg-bg-tertiary text-text-tertiary text-xs px-3 py-1 rounded-full font-medium">
              {group.date}
            </span>
          </div>

          <div className="space-y-1">
            {group.messages.map((msg, index) => {
              const isMe = msg.data.senderId === currentUserId;
              const sender = usersMap[msg.data.senderId];
              const showAvatar = shouldShowAvatar(msg, index, group.messages);
              const showName = shouldShowName(msg, index, group.messages);
              const isLastMessage = msg.id === messages[messages.length - 1]?.id;

              let isVideoCall = false;
              if (onCall) {
                try { isVideoCall = JSON.parse(msg.data.content)?.callType === 'video'; } catch { }
              }

              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isMe={isMe}
                  sender={sender}
                  showAvatar={showAvatar}
                  showName={showName}
                  isLastMessage={isLastMessage}
                  lastReadByUsers={lastReadByMap[msg.id]}
                  onRecall={onRecall}
                  onDeleteForMe={onDeleteForMe}
                  onForward={onForward}
                  onReply={onReply}
                  onEdit={onEdit}
                  onCall={onCall ? () => onCall(isVideoCall) : undefined}
                  onJoinCall={onJoinCall}
                  currentUserId={currentUserId}
                  usersMap={usersMap}
                  isGroup={conversation.data.isGroup}
                  allMessages={messages}
                  isBlocked={isBlocked}
                  partnerStatus={partnerStatus}
                  conversationId={conversation.id}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export const MessageList = React.memo(MessageListInner);
