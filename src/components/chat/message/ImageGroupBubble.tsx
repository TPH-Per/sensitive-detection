import React, { useState } from 'react';
import { Smile, Check, CheckCheck } from 'lucide-react';
import { RtdbMessage, User } from '../../../types';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { Avatar, UserAvatar, MediaViewer, ReactionDisplay, ReactionSelector, Modal, UserStatusText, ConfirmDialog, LazyImage } from '../../ui';
import { useRtdbChatStore } from '../../../store';
import { MessageActions } from './MessageActions';

interface ImageGroupBubbleProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  sender?: User;
  showAvatar: boolean;
  showName: boolean;
  currentUserId: string;
  usersMap: Record<string, User>;
  isGroup?: boolean;
  isLastMessage?: boolean;
  lastReadByUsers?: User[];
  onRecall?: (messageId: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  isBlocked?: boolean;
  conversationId: string;
}

const ImageGroupBubbleInner: React.FC<ImageGroupBubbleProps> = ({
  messages,
  sender,
  showAvatar,
  showName,
  currentUserId,
  usersMap,
  isGroup = false,
  isLastMessage,
  lastReadByUsers = [],
  onRecall,
  onDeleteForMe,
  onForward,
  onReply,
  onEdit,
  isBlocked = false,
  conversationId,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [showMenu, setShowMenu] = useState(false);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const [showReactionSelector, setShowReactionSelector] = useState(false);
  const { toggleReaction } = useRtdbChatStore();

  const validMessages = messages.filter(m => !m.data.isRecalled && !(m.data.deletedBy && m.data.deletedBy[currentUserId]));
  if (validMessages.length === 0) return null;

  const lastMsg = validMessages[validMessages.length - 1];
  const hasReactions = lastMsg.data.reactions && Object.keys(lastMsg.data.reactions).length > 0;

  const isMe = lastMsg.data.senderId === currentUserId;
  const isDelivered = lastMsg.data.deliveredTo && Object.keys(lastMsg.data.deliveredTo).length > 0;

  const gridClass = validMessages.length === 1
    ? 'grid-cols-1'
    : validMessages.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-2';

  const renderImages = () => {
    const count = validMessages.length;

    return validMessages.slice(0, 4).map((msg, index) => {
      const isOverlay = index === 3 && count > 4;
      const imageUrl = msg.data.media?.[0]?.url || msg.data.content;

      return (
        <div
          key={msg.id}
          className={`relative overflow-hidden cursor-pointer ${count === 3 && index === 0 ? 'col-span-2 row-span-2 aspect-video' : 'aspect-square'
            }`}
          onClick={() => setSelectedIndex(index)}
        >
          <LazyImage
            src={imageUrl}
            alt="sent"
            className="w-full h-full object-cover transition-all duration-base"
          />
          {isOverlay && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-bold">
              +{count - 3}
            </div>
          )}
        </div>
      );
    });
  };



  return (
    <div className={`flex w-full mb-1 group ${isMe ? 'justify-end' : 'justify-start gap-3'}`}>
      {!isMe && (
        <div className="w-8 flex-shrink-0 flex items-end">
          {showAvatar && (
            <UserAvatar
              userId={sender?.id ?? ''}
              size="sm"
              showStatus={false}
            />
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[70%] min-w-0 ${isMe ? 'items-end' : 'items-start'} relative mb-1`}>
        {!isMe && showName && (
          <span className="text-[11px] text-text-secondary ml-1 mb-1 font-medium">
            {sender?.fullName}
          </span>
        )}

        <div className={`relative group/message ${hasReactions ? 'mb-3.5' : ''}`}>
          <div className={`rounded-xl overflow-hidden grid gap-0.5 ${gridClass} border border-border-light shadow-sm bg-bg-secondary w-full max-w-[320px]`}>
            {renderImages()}
          </div>

          {/* Cảm xúc & Emoji */}
          <div className={`absolute -bottom-2 z-10 flex items-center ${isMe ? 'left-1' : 'right-1'}`}>
            {hasReactions ? (
              <ReactionDisplay
                reactionSummary={Object.entries(lastMsg.data.reactions || {}).reduce((acc, [_, emoji]) => {
                  acc[emoji] = (acc[emoji] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)}
                reactionCount={Object.keys(lastMsg.data.reactions || {}).length}
                onClick={() => setShowReactionSelector(!showReactionSelector)}
              />
            ) : (
              !isBlocked && (
                <div className="opacity-0 group-hover/message:opacity-100 transition-all duration-base">
                  <button
                    className="flex items-center justify-center w-6 h-5 bg-bg-secondary rounded-full ring-1 ring-border-light shadow-sm text-text-secondary hover:text-primary hover:ring-primary hover:shadow-md transition-all duration-base"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowReactionSelector(!showReactionSelector);
                    }}
                  >
                    <Smile size={12} />
                  </button>
                </div>
              )
            )}

            {showReactionSelector && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReactionSelector(false);
                  }}
                />
                <ReactionSelector
                  onSelect={(emoji) => toggleReaction(conversationId, lastMsg.id, currentUserId, emoji)}
                  onClose={() => setShowReactionSelector(false)}
                  className={`bottom-full mb-1 ${isMe ? 'right-0' : 'left-0'}`}
                  currentReaction={lastMsg.data.reactions?.[currentUserId]}
                />
              </>
            )}
          </div>

          <MessageActions
            message={lastMsg}
            isMe={isMe}
            canEdit={false}
            showMenu={showMenu}
            setShowMenu={setShowMenu}
            onReply={onReply}
            onForward={onForward}
            onEdit={onEdit}
            setShowRecallConfirm={setShowRecallConfirm}
            onDeleteForMe={onDeleteForMe}
            isBlocked={isBlocked}
          />
        </div>

        {/* Thời gian & Trạng thái đọc */}
        <div className="flex flex-col items-end mt-1">
          <span className="text-[10px] text-text-tertiary">
            {formatTimeOnly(lastMsg.data.createdAt)}
          </span>

          {isMe && (isLastMessage || lastReadByUsers.length > 0) && (
            <div className="flex flex-col items-end mt-0.5">
              {isLastMessage && lastReadByUsers.length === 0 && (
                <div className={`mt-0.5 select-none ${isDelivered ? 'text-primary' : 'text-text-tertiary'}`}>
                  {isDelivered ? <CheckCheck size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
                </div>
              )}

              {lastReadByUsers.length > 0 && (
                <div
                  className="flex items-center gap-1 mt-1 cursor-pointer"
                  onClick={() => isGroup && setShowReaders(!showReaders)}
                >
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {lastReadByUsers.slice(0, 3).map(user => (
                      <Avatar
                        key={user.id}
                        src={user.avatar.url}
                        name={user.fullName}
                        size="2xs"
                      />
                    ))}
                  </div>
                  {lastReadByUsers.length > 3 && (
                    <span className="text-[10px] text-text-tertiary font-medium">
                      +{lastReadByUsers.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Viewer */}
      <MediaViewer
        media={validMessages.map(m => ({
          type: 'image' as const,
          url: m.data.media?.[0]?.url || m.data.content
        }))}
        initialIndex={selectedIndex}
        isOpen={selectedIndex !== -1}
        onClose={() => setSelectedIndex(-1)}
      />

      {/* Xem người đã đọc */}
      {isGroup && lastReadByUsers.length > 0 && (
        <Modal
          isOpen={showReaders}
          onClose={() => setShowReaders(false)}
          title="Người đã xem"
          maxWidth="sm"
        >
          <div className="space-y-3">
            {lastReadByUsers.map(reader => (
              <div key={reader.id} className="flex items-center gap-3 p-2 hover:bg-bg-hover active:bg-bg-active rounded-lg transition-all duration-base">
                <UserAvatar userId={reader.id} size="md" showStatus={true} />
                <div className="flex-1">
                  <div className="text-sm font-bold text-text-primary">{reader.fullName}</div>
                  <UserStatusText
                    userId={reader.id}
                    className="text-xs text-text-tertiary"
                  />
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Xác nhận thu hồi */}
      <ConfirmDialog
        isOpen={showRecallConfirm}
        onClose={() => setShowRecallConfirm(false)}
        onConfirm={() => onRecall?.(lastMsg.id)}
        title="Thu hồi tin nhắn"
        message="Album ảnh này sẽ bị thu hồi đối với tất cả mọi người trong cuộc trò chuyện."
        confirmLabel="Thu hồi"
        variant="primary"
      />
    </div>
  );
};

export const ImageGroupBubble = React.memo(ImageGroupBubbleInner);