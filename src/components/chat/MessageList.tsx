import React, { useMemo } from 'react';
import { RtdbMessage, User, RtdbConversation, RtdbUserChat } from '../../types';
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
  chatName: string;
  avatarSrc?: string;
  partner?: User;
  isBlocked?: boolean;
}

const MessageListInner: React.FC<MessageListProps> = ({
  messages,
  currentUserId,
  usersMap,
  conversation,
  participants,
  lastReadByMap,
  onRecall,
  onDeleteForMe,
  onForward,
  onReply,
  onEdit,
  onCall,
  chatName,
  avatarSrc,
  partner,
  isBlocked = false
}) => {
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Array<{ id: string; data: RtdbMessage }> }[] = [];
    let currentDate = '';

    const processedMessages = messages
      .filter(msg => !msg.data.deletedBy || !msg.data.deletedBy[currentUserId])
      .map(msg => msg);

    processedMessages.forEach((msg) => {
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

  const shouldShowAvatar = (msg: { id: string; data: RtdbMessage }, index: number, dayMessages: Array<{ id: string; data: RtdbMessage }>): boolean => {
    if (msg.data.senderId === currentUserId) return false;
    if (index === dayMessages.length - 1) return true;
    const nextMsg = dayMessages[index + 1];
    return nextMsg.data.senderId !== msg.data.senderId;
  };

  const shouldShowName = (msg: { id: string; data: RtdbMessage }, index: number, dayMessages: Array<{ id: string; data: RtdbMessage }>): boolean => {
    if (!conversation.data.isGroup) return false;
    if (msg.data.senderId === currentUserId) return false;
    if (index === 0) return true;
    const prevMsg = dayMessages[index - 1];
    return prevMsg.data.senderId !== msg.data.senderId;
  };

  if (groupedMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="mb-4">
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
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">{chatName}</h3>
        <p className="text-sm text-text-secondary">Bắt đầu cuộc trò chuyện</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupedMessages.map((group, groupIndex) => (
        <div key={groupIndex}>
          <div className="flex items-center justify-center my-4">
            <div className="bg-secondary text-text-secondary text-xs px-3 py-1 rounded-full">
              {group.date}
            </div>
          </div>

          <div className="space-y-1">
            {group.messages.map((msg, index) => {
              const isMe = msg.data.senderId === currentUserId;
              const sender = usersMap[msg.data.senderId];
              const showAvatar = shouldShowAvatar(msg, index, group.messages);
              const showName = shouldShowName(msg, index, group.messages);
              const isLastMessage = msg.id === messages[messages.length - 1]?.id;

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
                  onCall={() => {
                    if (onCall) {
                      let isVideo = false;
                      try {
                        const parsed = JSON.parse(msg.data.content);
                        isVideo = parsed.callType === 'video';
                      } catch { }
                      onCall(isVideo);
                    }
                  }}
                  currentUserId={currentUserId}
                  usersMap={usersMap}
                  isGroup={conversation.data.isGroup}
                  allMessages={messages}
                  isBlocked={isBlocked}
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
