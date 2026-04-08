import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smile } from 'lucide-react';
import { RtdbMessage, User, MessageType, UserStatus } from '../../../../shared/types';
import {
  UserAvatar, ReactionDisplay, ReactionSelector,
  Modal, UserStatusText, ConfirmDialog, MediaViewer, ReactionDetailsModal,
} from '../../ui';
import { useRtdbChatStore } from '../../../store';
import { TIME_LIMITS } from '../../../constants/appConfig';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { scrollToMessage } from '../../../utils';
import { MessageContent } from './MessageContent';
import { MessageActions } from './MessageActions';
import { MessageStatus } from './MessageStatus';

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
}

const MessageBubbleInner: React.FC<MessageBubbleProps> = ({
  message, isMe, sender, showAvatar, showName, isLastMessage,
  onRecall, onDeleteForMe, onForward, onReply, onEdit,
  currentUserId, usersMap, isGroup = false, lastReadByUsers = [],
  isBlocked = false, partnerStatus, onCall, onJoinCall,
  conversationId, allMessages = [],
}) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showRecallConfirm, setShowRecallConfirm] = useState(false);
  const [showReaders, setShowReaders] = useState(false);
  const [showReactionSelector, setShowReactionSelector] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const { toggleReaction, uploadProgress } = useRtdbChatStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  const handleProfileClick = useCallback(() => {
    if (sender?.id) navigate(`/profile/${sender.id}`);
  }, [sender?.id, navigate]);

  const isDelivered = useMemo(() => {
    if (!isGroup && partnerStatus === UserStatus.BANNED) return false;
    return !!(message.data.deliveredTo &&
      Object.keys(message.data.deliveredTo).some(uid => uid !== currentUserId));
  }, [message.data.deliveredTo, currentUserId, isGroup, partnerStatus]);

  const isPartnerBanned = !isGroup && partnerStatus === UserStatus.BANNED;
  const isInteractionDisabled = isBlocked || isPartnerBanned;

  const canEdit = isMe && !message.data.isRecalled &&
    message.data.type === MessageType.TEXT &&
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

  const handleToggleVoice = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      const voiceUrl = message.data.media?.[0]?.url || message.data.content;
      audioRef.current = new Audio(voiceUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  /* ── System message ── */
  if (message.data.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="bg-bg-tertiary/70 text-text-tertiary text-xs px-3 py-1 rounded-full italic text-center max-w-[85%]">
          {message.data.content}
        </span>
      </div>
    );
  }

  const isTextLike = message.data.type === 'text' || message.data.isRecalled ||
    message.data.replyToId || message.data.type === 'call';

  return (
    <>
      <div
        id={`msg-${message.id}`}
        className={`flex w-full mb-1 group ${isMe ? 'justify-end' : 'justify-start gap-2'}`}
      >
        {/* Avatar (received only) */}
        {!isMe && (
          <div className="w-7 flex-shrink-0 flex items-end pb-0.5">
            {showAvatar && (
              <UserAvatar
                userId={sender?.id ?? ''}
                size="xs"
                initialStatus={sender?.status}
                showStatus={false}
                onClick={handleProfileClick}
              />
            )}
          </div>
        )}

        <div className={`flex flex-col max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'} relative`}>
          {/* Sender name (group only) */}
          {!isMe && showName && (
            <button
              className="text-xs text-text-secondary ml-1 mb-0.5 font-semibold hover:text-primary transition-colors duration-200"
              onClick={handleProfileClick}
            >
              {sender?.fullName || 'Người dùng'}
            </button>
          )}

          {/* Bubble + reaction zone */}
          <div className={`relative group/message w-fit max-w-full ${hasReactions ? 'mb-4' : ''}`}>
            <ReactionDetailsModal
              isOpen={showReactionDetails}
              onClose={() => setShowReactionDetails(false)}
              sourceId={message.id}
              sourceType="message"
              reactions={message.data.reactions}
              currentUserId={currentUserId}
              context="CHAT"
            />

            {/* Bubble */}
            <div
              className={`
                relative text-sm
                ${isTextLike
                  ? `px-3 py-2 rounded-2xl shadow-sm
                    ${isMe
                    ? 'bg-bg-message-sent text-text-on-primary rounded-br-sm'
                    : 'bg-bg-message-received text-text-primary rounded-bl-sm'
                  }`
                  : ''
                }
                ${hasReactions ? 'pb-3' : ''}
              `}
            >
              {/* Reply preview */}
              {!message.data.isRecalled && message.data.replyToId && (() => {
                const replyToMsg = allMessages.find(m => m.id === message.data.replyToId);
                const replyAuthorName = replyToMsg?.data.senderId === currentUserId
                  ? 'Bạn'
                  : usersMap[replyToMsg?.data.senderId || '']?.fullName || 'Người dùng';

                return (
                  <div
                    className={`mb-2 px-2.5 py-1.5 rounded-xl border-l-[3px] text-xs cursor-pointer
                      ${isMe
                        ? 'bg-white/15 border-white/60 text-white/90'
                        : 'bg-bg-secondary border-primary/60 text-text-secondary'
                      }`}
                    onClick={() => replyToMsg && scrollToMessage(message.data.replyToId!)}
                  >
                    <div className={`font-semibold mb-0.5 ${isMe ? 'text-white' : 'text-primary'}`}>
                      {replyAuthorName}
                    </div>
                    <div className="truncate opacity-80">
                      {replyToMsg?.data.isRecalled
                        ? 'Tin nhắn đã thu hồi'
                        : replyToMsg?.data.type === 'text'
                          ? replyToMsg.data.content.replace(/@\[([^\]]+)\]/g, '@$1')
                          : replyToMsg?.data.type === MessageType.IMAGE ? '[Hình ảnh]'
                            : replyToMsg?.data.type === MessageType.VIDEO ? '[Video]'
                              : replyToMsg?.data.type === 'file' ? `[File] ${replyToMsg.data.media?.[0]?.fileName || ''}`
                                : replyToMsg?.data.type === 'voice' ? '[Tin nhắn thoại]'
                                  : '[Tin nhắn]'
                      }
                    </div>
                  </div>
                );
              })()}

              <MessageContent
                message={message}
                isMe={isMe}
                isGroup={isGroup}
                uploadProgress={uploadProgress}
                isPlaying={isPlaying}
                onToggleVoice={handleToggleVoice}
                onOpenImage={setSelectedImageIndex}
                onCall={onCall}
                onJoinCall={onJoinCall}
              />

              {/* Timestamp (text/call/recalled only) */}
              {isTextLike && (
                <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-white/70' : 'text-text-tertiary'}`}>
                  {formatTimeOnly(message.data.createdAt)}
                </div>
              )}

              {/* Reaction badge + emoji button */}
              {!message.data.isRecalled && message.data.type !== MessageType.CALL && (
                <div
                  className={`absolute -bottom-3.5 flex items-center gap-1 ${isMe ? 'left-1' : 'right-1'}`}
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
                    <div className={`relative ${hasReactions ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'} transition-opacity duration-200`}>
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
                          onSelect={(emoji) => toggleReaction(conversationId, message.id, currentUserId, emoji)}
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
            </div>

            {/* Message actions (hover) */}
            {!message.data.isRecalled && (
              <MessageActions
                message={message}
                isMe={isMe}
                canEdit={canEdit}
                showMenu={showMenu}
                setShowMenu={setShowMenu}
                onReply={onReply}
                onForward={onForward}
                onEdit={onEdit}
                setShowRecallConfirm={setShowRecallConfirm}
                onDeleteForMe={onDeleteForMe}
                isBlocked={isBlocked}
                isPartnerBanned={isPartnerBanned}
              />
            )}
          </div>

          {/* Timestamp for media messages */}
          {!isTextLike && !message.data.isRecalled && (
            <span className="text-[10px] text-text-tertiary mt-1">
              {formatTimeOnly(message.data.createdAt)}
            </span>
          )}

          {/* Read status */}
          {isMe && (isLastMessage || lastReadByUsers.length > 0) && (
            <div className="mt-0.5">
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
