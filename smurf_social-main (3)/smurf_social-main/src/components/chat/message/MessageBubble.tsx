import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smile } from 'lucide-react';
import { RtdbMessage, User, MessageType, UserStatus } from '../../../../shared/types';
import {
  UserAvatar, ReactionDisplay, ReactionSelector,
  Modal, UserStatusText, ConfirmDialog, MediaViewer, ReactionDetailsModal,
} from '../../ui';
import { useRtdbChatStore } from '../../../store';
import { getMessageDisplayContent } from '../../../utils/chatUtils';
import { TIME_LIMITS } from '../../../constants/appConfig';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { scrollToMessage } from '../../../utils';
import { MessageContent } from './MessageContent';
import { MessageActions } from './MessageActions';
import { MessageStatus } from './MessageStatus';
import { useIntersectionObserver } from '../../../hooks/utils/useIntersectionObserver';
import { useClickOutside } from '../../../hooks/utils/useClickOutside';

interface MessageBubbleProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  sender?: User;
  showAvatar: boolean;
  showName: boolean;
  isLastMessage?: boolean;
  onRecall?: (messageId: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onForward?: (message: { id: string; data: RtdbMessage }) => void;
  onReply?: (message: { id: string; data: RtdbMessage }) => void;
  onEdit?: (message: { id: string; data: RtdbMessage }) => void;
  currentUserId: string;
  usersMap: Record<string, User>;
  isGroup?: boolean;
  lastReadByUsers?: User[];
  isBlocked?: boolean;
  partnerStatus?: UserStatus;
  onCall?: () => void;
  onJoinCall?: (callType: 'voice' | 'video') => void;
  conversationId: string;
  allMessages?: Array<{ id: string; data: RtdbMessage }>;
  onContentLoad?: () => void;
  onMarkAsRead?: (messageId: string) => void;
}

/** Bong bóng hiển thị nội dung tin nhắn */
const MessageBubbleInner: React.FC<MessageBubbleProps> = ({
  message, isMe, sender, showAvatar, showName, isLastMessage,
  onRecall, onDeleteForMe, onForward, onReply, onEdit,
  currentUserId, usersMap, isGroup = false, lastReadByUsers = [],
  isBlocked = false, partnerStatus, onCall, onJoinCall,
  conversationId, allMessages = [], onContentLoad, onMarkAsRead,
}) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const [showReactionSelector, setShowReactionSelector] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const { toggleReaction, uploadProgress } = useRtdbChatStore();
  const containerRef = React.useRef<HTMLDivElement>(null);

  useClickOutside([containerRef], () => setShowActions(false), showActions);

  const isMedia = useMemo(() => 
    message.data.type === MessageType.IMAGE || 
    message.data.type === MessageType.VIDEO || 
    message.data.type === MessageType.GIF,
  [message.data.type]);
                  
  const [isContentReady, setIsContentReady] = useState(!isMedia);

  const observerRef = useIntersectionObserver(() => {
    if (!isMe && !message.data.readBy?.[currentUserId] && onMarkAsRead) {
      onMarkAsRead(message.id);
    }
  }, { 
    threshold: 0.5, 
    enabled: !isMe && !message.data.readBy?.[currentUserId] && !!onMarkAsRead 
  });

  const handleContentLoad = useCallback(() => {
    setIsContentReady(true);
    onContentLoad?.();
  }, [onContentLoad]);

  const handleProfileClick = useCallback(() => {
    if (sender?.id) navigate(`/profile/${sender.id}`);
  }, [sender?.id, navigate]);

  const isDelivered = useMemo(() => {
    if (!isGroup && partnerStatus === UserStatus.BANNED) return false;
    if (!message.data.deliveredTo) return false;
    return Object.keys(message.data.deliveredTo).some(uid => uid !== currentUserId);
  }, [message.data.deliveredTo, currentUserId, isGroup, partnerStatus]);

  const isPartnerBanned = !isGroup && partnerStatus === UserStatus.BANNED;
  const isInteractionDisabled = isBlocked || isPartnerBanned;

  const canEdit = isMe && !message.data.isRecalled &&
    (message.data.type === MessageType.TEXT || (message.data.type === MessageType.IMAGE && !!message.data.content)) &&
    (Date.now() - message.data.createdAt) <= TIME_LIMITS.MESSAGE_EDIT_WINDOW;

  const hasReactions = message.data.reactions && Object.keys(message.data.reactions).length > 0;
  const myReaction = message.data.reactions?.[currentUserId];

  const reactionSummary = useMemo(() => {
    if (!message.data.reactions) return {};
    return Object.entries(message.data.reactions).reduce((acc, [, emoji]) => {
      acc[emoji] = (acc[emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [message.data.reactions]);

  const reactionCount = useMemo(() =>
    Object.keys(message.data.reactions || {}).length,
    [message.data.reactions]
  );


  /* System Message */
  if (message.data.type === MessageType.SYSTEM) {
    return (
      <div className="flex justify-center my-2">
        <span className="bg-bg-tertiary/70 text-text-tertiary text-xs px-3 py-1 rounded-full italic text-center max-w-[85%]">
          {message.data.content}
        </span>
      </div>
    );
  }

  const shouldWrapBackground = !isMedia || message.data.isRecalled || (message.data.type === MessageType.IMAGE && !!message.data.content);

  return (
    <>
      <div
        id={`msg-${message.id}`}
        ref={observerRef}
        className={`flex w-full group ${isMe ? 'justify-end' : 'justify-start gap-2'} ${hasReactions ? 'mb-3' : 'mb-0.5'}`}
      >
        {/* Avatar Received Only */}
        {!isMe && (
          <div className="w-8 flex-shrink-0 flex items-end pb-1">
            {showAvatar && (
              <UserAvatar
                userId={sender?.id ?? ''}
                size="sm"
                initialStatus={sender?.status}
                showStatus={false}
                onClick={handleProfileClick}
              />
            )}
          </div>
        )}

        <div className={`flex flex-col max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'} relative`}>
          {/* Sender Name Group Only */}
          {!isMe && showName && (
            <button
              className="text-xs text-text-secondary ml-1 mb-0.5 font-semibold hover:text-primary transition-colors duration-200"
              onClick={handleProfileClick}
            >
              {sender?.fullName || 'Người dùng'}
            </button>
          )}

          {/* Bubble And Reaction Zone */}
          <div 
            ref={containerRef}
            className={`relative group/message w-fit max-w-full`}
          >
            <ReactionDetailsModal
              isOpen={showReactionDetails}
              onClose={() => setShowReactionDetails(false)}
              sourceId={message.id}
              sourceType="message"
              reactions={message.data.reactions}
              currentUserId={currentUserId}
            />

            <div 
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} w-full cursor-pointer md:cursor-default`}
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
            >
              {/* Main Content Bubble */}
              <div
                className={`
                  relative text-sm transition-all duration-300 animate-in fade-in max-w-full
                  ${shouldWrapBackground
                    ? `shadow-sm ${hasReactions ? 'min-w-[92px]' : 'min-w-[60px]'} overflow-hidden
                        ${isMe
                        ? 'bg-bg-message-sent border border-primary/10 text-text-primary rounded-xl rounded-br-sm'
                        : 'bg-bg-message-received border border-border-light text-text-primary rounded-xl rounded-bl-sm'
                      }`
                    : `overflow-hidden ${isMe ? 'rounded-xl rounded-br-sm' : 'rounded-xl rounded-bl-sm'}`
                  }
                `}
              >
                {/* Reply Preview */}
                {!message.data.isRecalled && message.data.replyToId && (() => {
                  const replyToMsg = allMessages.find(m => m.id === message.data.replyToId);
                  const replyAuthorName = replyToMsg?.data.senderId === currentUserId
                    ? 'Bạn'
                    : usersMap[replyToMsg?.data.senderId || '']?.fullName || 'Người dùng';

                  return (
                    <div
                      className={`
                        mx-1 mt-1 mb-1 px-2.5 py-1.5 rounded-xl border-l-4 text-[11px] cursor-pointer 
                        transition-all duration-200 hover:brightness-95 active:scale-[0.98]
                        ${isMe
                          ? 'bg-black/5 dark:bg-white/5 border-primary/40 text-text-primary/80'
                          : 'bg-black/5 dark:bg-white/5 border-primary/40 text-text-secondary'
                        }
                        ${!shouldWrapBackground ? 'bg-black/40 backdrop-blur-md border-primary/60 text-white/90' : ''}
                      `}
                      onClick={() => replyToMsg && scrollToMessage(message.data.replyToId!)}
                    >
                      <div className={`font-bold mb-0.5 ${!shouldWrapBackground ? 'text-primary-light' : 'text-primary'}`}>
                        {replyAuthorName}
                      </div>
                      <div className="truncate opacity-80 italic">
                        {replyToMsg?.data.isRecalled
                          ? 'Tin nhắn đã thu hồi'
                          : getMessageDisplayContent(replyToMsg!.data)
                        }
                      </div>
                    </div>
                  );
                })()}

                <div className={shouldWrapBackground && message.data.type !== MessageType.IMAGE ? "px-3 py-2" : ""}>
                  <MessageContent
                    message={message}
                    isMe={isMe}
                    isGroup={isGroup}
                    uploadProgress={uploadProgress}
                    onOpenImage={setSelectedImageIndex}
                    onLoad={handleContentLoad}
                    onCall={onCall}
                    onJoinCall={onJoinCall}
                  />
                </div>

                {/* Timestamp */}
                {!message.data.isRecalled && (
                  <div className={`
                    text-[10px] flex items-center gap-1
                    transition-all duration-500 ease-out transform
                    ${isContentReady ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
                    ${!shouldWrapBackground
                      ? `absolute bottom-2 ${isMe ? 'right-2' : 'left-2'} px-1.5 py-0.5 rounded-full bg-black/40 text-white backdrop-blur-sm z-20`
                      : `${hasReactions ? 'pb-3' : 'pb-1.5'} ${isMe ? 'justify-end text-text-primary opacity-60 px-3' : 'justify-start text-text-tertiary px-3'}`
                    }
                  `}>
                    {formatTimeOnly(message.data.createdAt)}
                  </div>
                )}
              </div>
            </div>

            {/* Reaction Badge Emoji Button */}
            {!message.data.isRecalled && message.data.type !== MessageType.CALL && (
              <div
                className={`absolute -bottom-3 flex items-center gap-1 ${isMe ? 'left-2' : 'right-2'}`}
                style={{ zIndex: 10 }}
              >
                {hasReactions && (
                  <ReactionDisplay
                    reactionSummary={reactionSummary}
                    reactionCount={reactionCount}
                    variant="xs"
                    onClick={() => setShowReactionDetails(true)}
                  />
                )}

                {!isInteractionDisabled && (
                  <div className={`relative ${(hasReactions || showActions) ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'} transition-opacity duration-200`}>
                    <button
                      className="w-7 h-6 flex items-center justify-center bg-bg-primary rounded-full border border-border-light shadow-sm text-text-tertiary hover:text-primary hover:border-primary/30 transition-all duration-200"
                      onClick={(e) => { e.stopPropagation(); setShowReactionSelector(!showReactionSelector); }}
                    >
                      <Smile size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                )}

                {showReactionSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-[var(--z-dropdown)]"
                      onClick={(e) => { e.stopPropagation(); setShowReactionSelector(false); }}
                    />
                    <div className={`absolute bottom-full mb-1 ${isMe ? 'right-0' : 'left-0'} z-[var(--z-popover)]`}>
                      <ReactionSelector
                        onSelect={(emoji) => {
                          toggleReaction(conversationId, message.id, currentUserId, emoji);
                          setShowActions(false);
                        }}
                        onClose={() => setShowReactionSelector(false)}
                        autoClose={false}
                        className="relative shadow-xl animate-fade-in"
                        currentReaction={myReaction}
                        size="xs"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Message Actions Hover */}
            {!message.data.isRecalled && (
                <MessageActions
                  message={message}
                  isMe={isMe}
                  canEdit={canEdit}
                  showMenu={showMenu}
                  setShowMenu={setShowMenu}
                  showActions={showActions}
                  onReply={(msg) => { onReply?.(msg); setShowActions(false); }}
                  onForward={(msg) => { onForward?.(msg); setShowActions(false); }}
                  onEdit={(msg) => { onEdit?.(msg); setShowActions(false); }}
                  setShowRecallConfirm={(show) => { setShowRecallConfirm(show); if (show) setShowActions(false); }}
                  onDeleteForMe={(id) => { onDeleteForMe?.(id); setShowActions(false); }}
                  isBlocked={isBlocked}
                  isPartnerBanned={isPartnerBanned}
                />
            )}
          </div>

          {/* Read Status */}
          {isMe && (isLastMessage || lastReadByUsers.length > 0) && (
            <div className={hasReactions ? "mt-2.5" : "mt-1"}>
              <div
                className="cursor-pointer"
                onClick={() => isGroup && lastReadByUsers.length > 0 && setShowReaders(!showReaders)}
              >
                <MessageStatus
                  isMine={isMe}
                  isRead={lastReadByUsers.length > 0}
                  isDelivered={isDelivered}
                  readers={lastReadByUsers}
                />
              </div>

              {isGroup && lastReadByUsers.length > 0 && (
                <Modal
                  isOpen={showReaders}
                  onClose={() => setShowReaders(false)}
                  title="Người đã xem"
                  maxWidth="sm"
                >
                  <div className="space-y-2">
                    {lastReadByUsers.map(reader => (
                      <div
                        key={reader.id}
                        className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-xl transition-colors duration-200"
                      >
                        <UserAvatar userId={reader.id} size="md" showStatus />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-text-primary truncate">
                            {reader.fullName}
                          </div>
                          <UserStatusText userId={reader.id} className="text-xs text-text-tertiary" />
                        </div>
                      </div>
                    ))}
                  </div>
                </Modal>
              )}
            </div>
          )}
        </div>
      </div>

      <MediaViewer
        media={
          (message.data.media && message.data.media.length > 0)
            ? message.data.media.map(m => ({
              type: m.mimeType?.startsWith('video/') ? 'video' as const : 'image' as const,
              url: m.url,
            }))
            : [{
              type: message.data.type === MessageType.VIDEO ? 'video' as const : 'image' as const,
              url: message.data.content,
            }]
        }
        initialIndex={selectedImageIndex ?? 0}
        isOpen={selectedImageIndex !== null}
        onClose={() => setSelectedImageIndex(null)}
      />

      <ConfirmDialog
        isOpen={showRecallConfirm}
        onClose={() => setShowRecallConfirm(false)}
        onConfirm={() => onRecall?.(message.id)}
        title="Thu hồi tin nhắn"
        message="Tin nhắn này sẽ bị thu hồi đối với tất cả mọi người trong cuộc trò chuyện."
        confirmLabel="Thu hồi"
        variant="danger"
      />
    </>
  );
};

export const MessageBubble = React.memo(MessageBubbleInner);

