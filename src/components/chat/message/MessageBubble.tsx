import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Smile, Check, CheckCheck } from 'lucide-react';

import { RtdbMessage, User, MessageType } from '../../../../shared/types';
import {
  Avatar,
  UserAvatar,
  ReactionDisplay,
  ReactionSelector,
  Modal,
  UserStatusText,
  ConfirmDialog,
  MediaViewer,
  ReactionDetailsModal
} from '../../ui';
import { useRtdbChatStore } from '../../../store';
import { TIME_LIMITS } from '../../../constants/appConfig';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { scrollToMessage } from '../../../utils';
import { MessageContent } from './MessageContent';
import { MessageActions } from './MessageActions';


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
  onCall?: () => void;
  conversationId: string;
  allMessages?: Array<{ id: string; data: RtdbMessage }>;
}

const MessageBubbleInner: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  sender,
  showAvatar,
  showName,
  isLastMessage,
  onRecall,
  onDeleteForMe,
  onForward,
  onReply,
  onEdit,
  currentUserId,
  usersMap,
  isGroup = false,
  lastReadByUsers = [],
  isBlocked = false,
  onCall,
  conversationId,
  allMessages = [],
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
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleProfileClick = useCallback(() => {
    if (sender?.id) {
      navigate(`/profile/${sender.id}`);
    }
  }, [sender?.id, navigate]);

  const senderName = sender?.fullName || 'Người dùng';

  const isDelivered = message.data.deliveredTo && Object.keys(message.data.deliveredTo).length > 0;

  const canEdit = isMe && !message.data.isRecalled && message.data.type === MessageType.TEXT && (
    (Date.now() - message.data.createdAt) <= TIME_LIMITS.MESSAGE_EDIT_WINDOW
  );

  const hasReactions = message.data.reactions && Object.keys(message.data.reactions).length > 0;
  const myReaction = message.data.reactions?.[currentUserId];

  const reactionSummary = useMemo(() => {
    if (!message.data.reactions) return {};
    return Object.entries(message.data.reactions).reduce((acc, [_, emoji]) => {
      acc[emoji] = (acc[emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [message.data.reactions]);

  const reactionCount = useMemo(() => Object.keys(message.data.reactions || {}).length, [message.data.reactions]);

  const handleToggleVoice = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) {
      const voiceUrl = message.data.media?.[0]?.url || message.data.content;
      audioRef.current = new Audio(voiceUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  if (message.data.type === 'system') {
    return (
      <div className="w-full flex justify-center mb-3">
        <div className="flex flex-col items-center w-full my-1">
          <span className="bg-bg-secondary/50 px-3 py-1 rounded-full text-[11px] text-text-tertiary italic text-center max-w-[90%]">
            {message.data.content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        id={`msg-${message.id}`}
        className={`flex w-full mb-1 group ${isMe ? 'justify-end' : 'justify-start gap-3'}`}
      >
        {/* Avatar người nhận */}
        {!isMe && (
          <div className="w-8 flex-shrink-0 flex items-end">
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

        <div className={`flex flex-col max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'} relative mb-1`}>
          {/* Tên người gửi trong nhóm */}
          {!isMe && showName && (
            <span
              className="text-[11px] text-text-secondary ml-1 mb-1 font-medium cursor-pointer hover:underline"
              onClick={handleProfileClick}
            >
              {senderName}
            </span>
          )}

          <div className={`relative group/message ${hasReactions ? 'mb-3.5' : ''}`}>
            <ReactionDetailsModal
              isOpen={showReactionDetails}
              onClose={() => setShowReactionDetails(false)}
              sourceId={message.id}
              sourceType="message"
              reactions={message.data.reactions}
              currentUserId={currentUserId}
              context="CHAT"
            />

            <div
              className={`
                relative text-sm
                ${(message.data.type === 'text' || message.data.isRecalled || message.data.replyToId || message.data.type === 'call')
                  ? `px-3 py-1.5 rounded-2xl shadow-sm ${isMe
                    ? 'bg-bg-message-sent text-text-on-primary rounded-br-sm break-all'
                    : 'bg-bg-message-received text-text-primary border border-border-light rounded-bl-sm break-all'
                  }`
                  : ''
                }
                ${message.data.type === 'call' && !message.data.isRecalled && onCall ? 'cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all duration-base' : ''}
                ${hasReactions ? 'min-w-[80px] pb-[12px]' : ''}
              `}
              onClick={() => {
                if (message.data.type === 'call' && !message.data.isRecalled && onCall) {
                  onCall();
                }
              }}
            >
              {!message.data.isRecalled && message.data.replyToId && (() => {
                const replyToMsg = allMessages.find(m => m.id === message.data.replyToId);

                if (!replyToMsg || replyToMsg.data.isRecalled) {
                  return (
                    <div className={`mb-2 p-2 rounded border-l-4 text-xs ${isMe
                      ? 'bg-white/10 border-white/50 text-white/90'
                      : 'bg-bg-secondary border-primary text-text-secondary'
                      } max-w-full overflow-hidden truncate opacity-90`}
                    >
                      <div className={`font-bold mb-1 ${isMe ? 'text-white' : 'text-primary'}`}>
                        {replyToMsg?.data.senderId === currentUserId
                          ? 'Bạn'
                          : usersMap[replyToMsg?.data.senderId || '']?.fullName || 'Người dùng'}
                      </div>
                      <div className="truncate italic opacity-70">
                        Tin nhắn đã thu hồi
                      </div>
                    </div>
                  );
                }

                return (
                  <div className={`mb-2 p-2 rounded border-l-4 text-xs ${isMe
                    ? 'bg-white/10 border-white/50 text-white/90'
                    : 'bg-bg-secondary border-primary text-text-secondary'
                    } max-w-full overflow-hidden truncate opacity-90 cursor-pointer`}
                    onClick={() => scrollToMessage(message.data.replyToId!)}
                  >
                    <div className={`font-bold mb-1 ${isMe ? 'text-white' : 'text-primary'}`}>
                      {replyToMsg.data.senderId === currentUserId
                        ? 'Bạn'
                        : usersMap[replyToMsg.data.senderId]?.fullName || 'Người dùng'}
                    </div>
                    <div className="truncate">
                      {replyToMsg.data.type === 'text'
                        ? replyToMsg.data.content.replace(/@\[([^\]]+)\]/g, '@$1')
                        : replyToMsg.data.type === 'image' ? ((replyToMsg.data.media?.length || 0) > 1 ? '[Album ảnh]' : '[Hình ảnh]')
                        : replyToMsg.data.type === 'video' ? '[Video]'
                          : replyToMsg.data.type === 'file' ? `[File] ${replyToMsg.data.media?.[0]?.fileName || 'File'}`
                            : replyToMsg.data.type === 'voice' ? '[Tin nhắn thoại]'
                              : replyToMsg.data.type === 'call' ? (() => {
                                try {
                                  const parsed = JSON.parse(replyToMsg.data.content) as { callType?: 'voice' | 'video' };
                                  return parsed.callType === 'video' ? '[Cuộc gọi video]' : '[Cuộc gọi thoại]';
                                } catch {
                                  return '[Cuộc gọi]';
                                }
                              })()
                                : `[${replyToMsg.data.type}]`
                      }
                    </div>
                  </div>
                );
              })()}

              {!message.data.isRecalled && message.data.replyToId && (message.data.type === 'image' || message.data.type === 'video' || message.data.type === 'file') && (
                <div className="px-3 pt-1.5">
                    <MessageContent
                      message={message}
                      isMe={isMe}
                      uploadProgress={uploadProgress}
                      isPlaying={isPlaying}
                      onToggleVoice={handleToggleVoice}
                      onOpenImage={setSelectedImageIndex}
                    />
                  </div>
                )}

              {!message.data.isRecalled && (!message.data.replyToId || (message.data.type !== 'image' && message.data.type !== 'video' && message.data.type !== 'file')) && (
                <MessageContent
                  message={message}
                  isMe={isMe}
                  uploadProgress={uploadProgress}
                  isPlaying={isPlaying}
                  onToggleVoice={handleToggleVoice}
                  onOpenImage={setSelectedImageIndex}
                />
              )}

              {message.data.isRecalled && (
                <MessageContent
                  message={message}
                  isMe={isMe}
                  uploadProgress={uploadProgress}
                  isPlaying={isPlaying}
                  onToggleVoice={handleToggleVoice}
                  onOpenImage={setSelectedImageIndex}
                />
              )}

              {/* Thời gian & Trạng thái */}
              {(message.data.type === 'text' || message.data.type === 'call' || message.data.isRecalled) && (
                <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-white/80' : 'text-text-tertiary'
                  }`}>
                  <span>{formatTimeOnly(message.data.createdAt)}</span>
                </div>
              )}

              {/* Hiển thị cảm xúc & Bộ chọn Emoji */}
              {!message.data.isRecalled && message.data.type !== MessageType.CALL && (
                <div className={`absolute -bottom-3.5 z-10 flex items-center gap-1 ${isMe ? 'left-1' : 'right-1'}`}>
                  {hasReactions && (
                    <ReactionDisplay
                      reactionSummary={reactionSummary}
                      reactionCount={reactionCount}
                      variant="xs"
                      onClick={() => setShowReactionDetails(true)}
                    />
                  )}

                  {!isBlocked && (
                    <div className={`relative ${hasReactions ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100'} transition-all duration-base flex items-center z-[var(--z-popover)]`}>
                      <button
                        className="flex items-center justify-center w-8 h-[26px] bg-bg-secondary rounded-full border border-divider shadow-sm text-text-secondary hover:text-primary hover:border-primary hover:shadow-md transition-all duration-base"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowReactionSelector(!showReactionSelector);
                        }}
                      >
                        <Smile size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {showReactionSelector && (
                    <>
                      <div
                        className="fixed inset-0 z-[var(--z-dropdown)] bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowReactionSelector(false);
                        }}
                      />
                      <div className={`absolute bottom-full mb-1 ${isMe ? 'right-0 pb-1.5' : 'left-0 pb-1.5'} z-[var(--z-popover)]`}>
                        <ReactionSelector
                          onSelect={(emoji) => toggleReaction(conversationId, message.id, currentUserId, emoji)}
                          onClose={() => setShowReactionSelector(false)}
                          autoClose={false}
                          className="relative shadow-dropdown animate-in fade-in zoom-in-95 duration-200"
                          currentReaction={myReaction}
                          size="xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
              />
            )}
          </div>

          {/* Thời gian cho file media */}
          {message.data.type !== 'text' && message.data.type !== 'call' && !message.data.isRecalled && (
            <span className="text-[10px] text-text-tertiary mt-1">
              {formatTimeOnly(message.data.createdAt)}
            </span>
          )}
          {isMe && (isLastMessage || lastReadByUsers.length > 0) && (
            <div className="flex flex-col items-end mt-0.5">
              {/* Hiển thị "Đã gửi/Đã nhận" nếu là tin nhắn cuối cùng và chưa ai đọc */}
              {isLastMessage && lastReadByUsers.length === 0 && (
                <div className={`mt-0.5 select-none ${isDelivered ? 'text-primary' : 'text-text-tertiary'}`}>
                  {isDelivered ? <CheckCheck size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
                </div>
              )}

              {/* Danh sách avatar người đã đọc tin nhắn này (đây là tin cuối cùng họ xem) */}
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

              {/* Danh sách người xem chi tiết khi click (chỉ cho group) */}
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
            </div>
          )}
        </div>
      </div >

      <MediaViewer
        media={(message.data.media && message.data.media.length > 0)
          ? message.data.media.map(m => ({ type: 'image' as const, url: m.url }))
          : [{ type: 'image' as const, url: message.data.content }]}
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
