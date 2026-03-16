import React, { useState, useMemo } from 'react';
import { Pin, VolumeX, Trash2, MoreVertical, Ban, Archive, MailCheck, Mail, Volume2, User as UserIcon } from 'lucide-react';
import { RtdbConversation, RtdbUserChat, ReactionType } from '../../../../shared/types';
import { Dropdown, DropdownItem, ConfirmDialog, UserAvatar, IconButton, BannedBadge } from '../../ui';
import { useConversationItem } from '../../../hooks/chat/useConversationItem';
import { useConversationMemberSettings } from '../../../hooks/chat/useConversationMemberSettings';
import { MessageStatus } from '../message/MessageStatus';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { getReactionIcon } from '../reactions/ReactionIcons';
import { useRtdbChatStore } from '../../../store';
import { getLastName } from '../../../utils/uiUtils';

const ConversationItemSkeleton: React.FC = () => (
  <div className="flex items-center gap-3 p-3.5 mx-2.5 my-1.5 rounded-xl animate-pulse">
    <div className="w-12 h-12 rounded-full bg-bg-tertiary flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <div className="flex justify-between mb-2">
        <div className="h-4 bg-bg-tertiary rounded w-24" />
        <div className="h-3 bg-bg-tertiary rounded w-10" />
      </div>
      <div className="h-3 bg-bg-tertiary rounded w-40" />
    </div>
  </div>
);

interface ConversationItemProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  isActive: boolean;
  currentUserId: string;
  currentUserFriendIds?: string[];
  showMessageRequestBadge?: boolean;
  onClick: () => void;
  onPin?: (conversationId: string, pinned: boolean) => void;
  onMute?: (conversationId: string, muted: boolean) => void;
  onDelete?: () => void;
  onBlock?: () => void;
  onArchive?: (conversationId: string, archived: boolean) => void;
  onMarkUnread?: (conversationId: string, markedUnread: boolean) => void;
  onViewProfile?: () => void;
}

const ConversationItemInner: React.FC<ConversationItemProps> = ({
  conversation,
  isActive,
  currentUserId,
  currentUserFriendIds = [],
  showMessageRequestBadge = false,
  onClick,
  onPin,
  onMute,
  onDelete,
  onBlock,
  onArchive,
  onMarkUnread,
  onViewProfile
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const typingUsers = useRtdbChatStore(state => state.typingUsers[conversation.id] || []);
  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);

  const {
    partner,
    participants,
    isDataMissing,
    chatInfo,
    isMessageRequest,
    isUnread,
    unreadCount,
    lastMessagePreview,
    isLastMessageMine,
    readers,
    isLastMessageRead,
    isLastMessageDelivered,
    displayTime
  } = useConversationItem({
    conversation,
    currentUserId,
    isActive,
    currentUserFriendIds
  });

  const typingText = useMemo(() => {
    const activeTypingUsers = typingUsers.filter(id => id !== currentUserId);
    if (activeTypingUsers.length === 0) return null;

    const typingUserObjects = activeTypingUsers
      .map(uid => participants.find(p => p.id === uid))
      .filter(Boolean);

    if (typingUserObjects.length === 1) {
      return `${getLastName(typingUserObjects[0]?.fullName) || 'Ai đó'} đang soạn tin...`;
    }
    if (typingUserObjects.length === 2) {
      return `${getLastName(typingUserObjects[0]?.fullName)} và ${getLastName(typingUserObjects[1]?.fullName)} đang soạn tin...`;
    }
    return `${getLastName(typingUserObjects[0]?.fullName)} và ${typingUserObjects.length - 1} người khác đang soạn tin...`;
  }, [typingUsers, participants, currentUserId]);

  if (isDataMissing) {
    return <ConversationItemSkeleton />;
  }

  return (
    <div
      onClick={onClick}
      className={`
        relative flex items-center gap-3 p-3.5 mx-2.5 my-1.5 cursor-pointer transition-all duration-base rounded-xl group
        hover:bg-bg-hover active:bg-bg-active
        ${isActive ? 'bg-primary-light' : ''}
        ${memberSettings?.isPinned && !isActive ? 'bg-bg-secondary' : ''}
      `}
    >
      <div className="relative flex-shrink-0">
        <UserAvatar
          userId={conversation.data.isGroup ? '' : partner?.id}
          size="md"
          isGroup={conversation.data.isGroup}
          members={participants}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-sm truncate ${isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
              {chatInfo.name}
            </h3>
            {!conversation.data.isGroup && partner?.status === 'banned' && <BannedBadge size="sm" />}
            {showMessageRequestBadge && isMessageRequest && (
              <span className="text-[10px] text-warning bg-warning-light px-1.5 py-0.5 rounded-full border border-warning/30 flex-shrink-0">
                Người lạ
              </span>
            )}
            {memberSettings?.isPinned && (
              <Pin size={14} className="text-primary flex-shrink-0" />
            )}
            {memberSettings?.isMuted && (
              <VolumeX size={14} className="text-text-tertiary flex-shrink-0" />
            )}
            {memberSettings?.isArchived && (
              <Archive size={14} className="text-text-tertiary flex-shrink-0" />
            )}
          </div>
          <span className={`text-xs flex-shrink-0 ${isMenuOpen ? 'md:hidden' : 'md:group-hover:hidden'} ${isUnread ? 'font-semibold text-primary' : 'text-text-secondary'}`}>
            {displayTime}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className={`text-sm truncate flex-1 ${isUnread ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
            {typingText ? (
              <span className="text-primary italic text-[13px] truncate block">
                {typingText}
              </span>
            ) : (
              <span className={`flex items-center gap-1 truncate text-[13px] ${isUnread ? 'font-bold text-text-primary' : (lastMessagePreview.match(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u) || lastMessagePreview.match(/^[A-Z_]+\s/)) ? 'text-text-tertiary italic' : 'text-text-secondary'}`}>
                {isLastMessageMine ? 'Bạn: ' : ''}
                {(() => {
                  const enumEmojiRegex = /^([A-Z_]+)\s+(.+)$/;
                  const match = lastMessagePreview.match(enumEmojiRegex);

                  if (match) {
                    const [_, type, text] = match;
                    const icon = getReactionIcon(type as ReactionType, "inline-block mb-0.5", 14);
                    if (icon) {
                      return (
                        <>
                          <span className="flex-shrink-0">{icon}</span>
                          <span className="truncate">{text}</span>
                        </>
                      );
                    }
                  }
                  return lastMessagePreview;
                })()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <MessageStatus
              isMine={isLastMessageMine && !isUnread && !typingText}
              isRead={isLastMessageRead}
              isDelivered={isLastMessageDelivered}
              readers={readers}
            />
            {isUnread && unreadCount > 0 ? (
              <span className="flex-shrink-0 bg-error text-text-on-primary text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {unreadCount}
              </span>
            ) : isUnread ? (
              <span className="flex-shrink-0 bg-error w-2.5 h-2.5 rounded-full" />
            ) : null}
          </div>
        </div>
      </div>

      <div className={`md:absolute md:top-2 md:right-2 transition-all duration-base flex-shrink-0 ${isMenuOpen ? 'opacity-100 md:z-10' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
        <Dropdown
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          trigger={
            <IconButton
              className={`opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-base ${isMenuOpen ? 'opacity-100' : ''}`}
              icon={<MoreVertical size={16} />}
              size="sm"
            />
          }
        >
          {onPin && (
            <DropdownItem
              icon={<Pin size={16} />}
              label={memberSettings?.isPinned ? 'Bỏ ghim' : 'Ghim'}
              onClick={() => onPin(conversation.id, !(memberSettings?.isPinned || false))}
            />
          )}
          {onViewProfile && !conversation.data.isGroup && (
            <DropdownItem
              icon={<UserIcon size={16} />}
              label="Xem trang cá nhân"
              onClick={onViewProfile}
            />
          )}
          {onMute && (
            <DropdownItem
              icon={memberSettings?.isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
              label={memberSettings?.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
              onClick={() => onMute(conversation.id, !(memberSettings?.isMuted || false))}
            />
          )}
          {onArchive && (
            <DropdownItem
              icon={<Archive size={16} />}
              label={memberSettings?.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
              onClick={() => onArchive(conversation.id, !(memberSettings?.isArchived || false))}
            />
          )}
          {onBlock && !conversation.data.isGroup && (
            <DropdownItem
              icon={<Ban size={16} />}
              label="Chặn"
              variant="danger"
              onClick={() => { onBlock?.(); setIsMenuOpen(false); }}
            />
          )}
          {onDelete && (
            <DropdownItem
              icon={<Trash2 size={16} />}
              label={conversation.data.isGroup && conversation.data.creatorId === currentUserId ? "Giải tán nhóm" : "Xóa cuộc trò chuyện"}
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
            />
          )}
        </Dropdown>
      </div>


      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => { onDelete?.(); setShowDeleteConfirm(false); }}
        title={conversation.data.isGroup && conversation.data.creatorId === currentUserId ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.TITLE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.TITLE}
        message={conversation.data.isGroup && conversation.data.creatorId === currentUserId ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.MESSAGE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.MESSAGE}
        confirmLabel={conversation.data.isGroup && conversation.data.creatorId === currentUserId ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.CONFIRM : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.CONFIRM}
        variant="danger"
      />
    </div>
  );
};

export const ConversationItem = Object.assign(
  React.memo(ConversationItemInner),
  { Skeleton: ConversationItemSkeleton }
);
