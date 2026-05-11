import React, { useState, useMemo } from 'react';
import {
  Pin, VolumeX, Trash2, MoreVertical, Ban, Archive,
  Volume2, User as UserIcon,
} from 'lucide-react';
import { RtdbConversation, RtdbUserChat, ReactionType, UserStatus } from '../../../../shared/types';
import { Dropdown, DropdownItem, ConfirmDialog, UserAvatar, IconButton, BannedBadge } from '../../ui';
import { useConversationItem } from '../../../hooks/chat/useConversationItem';
import { useConversationMemberSettings } from '../../../hooks/chat/useConversationMemberSettings';
import { MessageStatus } from '../message/MessageStatus';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { getReactionIcon } from '../reactions/ReactionIcons';
import { useRtdbChatStore } from '../../../store';
import { getLastName } from '../../../utils/uiUtils';
import { TIME_LIMITS } from '../../../constants';

/* ── Skeleton ── */
const ConversationItemSkeleton: React.FC = () => (
  <div className="flex items-center gap-3 px-3 py-3 mx-1 my-0.5 rounded-xl animate-pulse">
    <div className="w-11 h-11 rounded-full bg-bg-tertiary flex-shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex justify-between">
        <div className="h-3.5 bg-bg-tertiary rounded w-24" />
        <div className="h-3 bg-bg-tertiary rounded w-10" />
      </div>
      <div className="h-3 bg-bg-tertiary rounded w-36" />
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
  onBlock?: (partnerId: string, partnerName: string) => void;
  onArchive?: (conversationId: string, archived: boolean) => void;
  onMarkUnread?: (conversationId: string, markedUnread: boolean) => void;
  onViewProfile?: () => void;
}

const renderMessagePreview = (preview: string): React.ReactNode => {
  const match = preview.match(/^([A-Z_]+)\s+(.+)$/);
  if (match) {
    const [, type, text] = match;
    const icon = getReactionIcon(type as ReactionType, 'inline-block mb-0.5', 13);
    if (icon) {
      return (
        <span className="inline-flex items-center gap-1 truncate max-w-full">
          <span className="flex-shrink-0">{icon}</span>
          <span className="truncate">{text}</span>
        </span>
      );
    }
  }
  return preview;
};

const ConversationItemInner: React.FC<ConversationItemProps> = ({
  conversation, isActive, currentUserId, currentUserFriendIds = [],
  showMessageRequestBadge = false, onClick,
  onPin, onMute, onDelete, onBlock, onArchive, onMarkUnread, onViewProfile,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const typingUsers = useMemo(() => {
    const typing = conversation.data.typing || {};
    const now = Date.now();
    return Object.entries(typing)
      .filter(([uid, timestamp]) => uid !== currentUserId && (now - (timestamp as number)) < TIME_LIMITS.TYPING_TIMEOUT)
      .map(([uid]) => uid);
  }, [conversation.data.typing, currentUserId]);
  const draft = useRtdbChatStore(state => state.draftMessages[conversation.id] ?? '');
  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);

  const {
    partner, participants, isDataMissing, chatInfo,
    isMessageRequest, isUnread, unreadCount,
    lastMessagePreview, isLastMessageMine, readers,
    isLastMessageRead, isLastMessageDelivered, displayTime,
  } = useConversationItem({ conversation, currentUserId, isActive, currentUserFriendIds });

  const typingText = useMemo(() => {
    const active = typingUsers.filter(id => id !== currentUserId);
    if (active.length === 0) return null;
    const objs = active.map(uid => participants.find(p => p.id === uid)).filter(Boolean);
    if (objs.length === 1) return `${getLastName(objs[0]?.fullName) || 'Ai đó'} đang soạn...`;
    if (objs.length === 2) return `${getLastName(objs[0]?.fullName)} và ${getLastName(objs[1]?.fullName)} đang soạn...`;
    return `${getLastName(objs[0]?.fullName)} và ${objs.length - 1} người khác đang soạn...`;
  }, [typingUsers, participants, currentUserId]);

  if (isDataMissing) return <ConversationItemSkeleton />;

  const isGroupCreator = conversation.data.isGroup && conversation.data.creatorId === currentUserId;

  return (
    <div
      onClick={onClick}
      className={`
        relative flex items-center gap-3 px-3 py-3 mx-1 my-0.5 cursor-pointer
        transition-all duration-200 rounded-xl group
        hover:bg-bg-hover active:bg-bg-active
        ${isActive ? 'bg-primary/10' : ''}
        ${memberSettings?.isPinned && !isActive ? 'bg-bg-secondary/60' : ''}
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <UserAvatar
          userId={conversation.data.isGroup ? '' : partner?.id}
          src={conversation.data.isGroup ? conversation.data.avatar?.url : undefined}
          size="md"
          isGroup={conversation.data.isGroup}
          members={participants}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <h3 className={`text-sm truncate ${isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}>
              {chatInfo.name}
            </h3>
            {!conversation.data.isGroup && partner?.status === UserStatus.BANNED && (
              <BannedBadge size="sm" />
            )}
            {memberSettings?.isPinned && (
              <Pin size={12} className="text-primary flex-shrink-0" />
            )}
            {memberSettings?.isMuted && (
              <VolumeX size={12} className="text-text-tertiary flex-shrink-0" />
            )}
          </div>
          <span className={`text-xs flex-shrink-0 ml-2 ${isMenuOpen ? 'md:hidden' : 'md:group-hover:hidden'} ${isUnread ? 'font-semibold text-primary' : 'text-text-tertiary'}`}>
            {displayTime}
          </span>
        </div>

        {/* Preview row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 overflow-hidden">
            {typingText ? (
              <span className="text-xs text-primary italic truncate block">{typingText}</span>
            ) : isUnread ? (
              <span className="text-xs font-semibold text-text-primary truncate block">
                {renderMessagePreview(lastMessagePreview)}
              </span>
            ) : draft && !isActive ? (
              <span className="text-xs truncate block">
                <span className="text-warning font-semibold">Bản nháp: </span>
                <span className="text-text-tertiary italic">{draft}</span>
              </span>
            ) : (
              <span className="text-xs text-text-tertiary truncate block">
                {isLastMessageMine && <span className="text-text-tertiary">Bạn: </span>}
                {renderMessagePreview(lastMessagePreview)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <MessageStatus
              isMine={isLastMessageMine && !isUnread && !typingText}
              isRead={isLastMessageRead}
              isDelivered={isLastMessageDelivered}
              readers={readers}
            />
            {isUnread && unreadCount > 0 ? (
              <span className="bg-error text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : isUnread ? (
              <span className="w-2 h-2 rounded-full bg-error flex-shrink-0" />
            ) : null}
          </div>
        </div>
      </div>

      {/* Context menu */}
      <div className={`md:absolute md:top-2 md:right-2 flex-shrink-0 transition-all duration-200 ${isMenuOpen ? 'opacity-100 md:z-10' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
        <Dropdown
          isOpen={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          trigger={
            <IconButton
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200"
              icon={<MoreVertical size={15} />}
              size="sm"
            />
          }
        >
          {onPin && (
            <DropdownItem
              icon={<Pin size={14} />}
              label={memberSettings?.isPinned ? 'Bỏ ghim' : 'Ghim'}
              onClick={() => onPin(conversation.id, !(memberSettings?.isPinned || false))}
            />
          )}
          {onViewProfile && !conversation.data.isGroup && (
            <DropdownItem
              icon={<UserIcon size={14} />}
              label="Xem trang cá nhân"
              onClick={onViewProfile}
            />
          )}
          {onMute && (
            <DropdownItem
              icon={memberSettings?.isMuted ? <Volume2 size={14} /> : <VolumeX size={14} />}
              label={memberSettings?.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}
              onClick={() => onMute(conversation.id, !(memberSettings?.isMuted || false))}
            />
          )}
          {onArchive && (
            <DropdownItem
              icon={<Archive size={14} />}
              label={memberSettings?.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
              onClick={() => onArchive(conversation.id, !(memberSettings?.isArchived || false))}
            />
          )}
          {onBlock && !conversation.data.isGroup && partner?.status !== UserStatus.BANNED && (
            <DropdownItem
              icon={<Ban size={14} />}
              label="Quản lý chặn"
              variant="danger"
              onClick={() => { onBlock(partner!.id, partner!.fullName); setIsMenuOpen(false); }}
            />
          )}
          {onDelete && (
            <DropdownItem
              icon={<Trash2 size={14} />}
              label={isGroupCreator ? 'Giải tán nhóm' : 'Xóa cuộc trò chuyện'}
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
        title={isGroupCreator ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.TITLE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.TITLE}
        message={isGroupCreator ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.MESSAGE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.MESSAGE}
        confirmLabel={isGroupCreator ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.CONFIRM : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.CONFIRM}
        variant="danger"
      />
    </div>
  );
};

export const ConversationItem = Object.assign(
  React.memo(ConversationItemInner, (prev, next) => {
    const prevLast = prev.conversation.data.lastMessage;
    const nextLast = next.conversation.data.lastMessage;
    const lastMessageEqual =
      prevLast?.messageId === nextLast?.messageId &&
      prevLast?.content === nextLast?.content &&
      JSON.stringify(prevLast?.readBy) === JSON.stringify(nextLast?.readBy) &&
      JSON.stringify(prevLast?.deliveredTo) === JSON.stringify(nextLast?.deliveredTo);

    const prevMemberKeys = Object.keys(prev.conversation.data.members).sort().join(',');
    const nextMemberKeys = Object.keys(next.conversation.data.members).sort().join(',');

    const prevFriendIds = (prev.currentUserFriendIds || []).slice().sort().join(',');
    const nextFriendIds = (next.currentUserFriendIds || []).slice().sort().join(',');

    return (
      prev.isActive === next.isActive &&
      prev.conversation.id === next.conversation.id &&
      prev.conversation.data.updatedAt === next.conversation.data.updatedAt &&
      prev.conversation.data.avatar?.url === next.conversation.data.avatar?.url &&
      prev.conversation.data.name === next.conversation.data.name &&
      prev.conversation.userChat.updatedAt === next.conversation.userChat.updatedAt &&
      prev.currentUserId === next.currentUserId &&
      prev.onClick === next.onClick &&
      prev.onPin === next.onPin &&
      prev.onMute === next.onMute &&
      prevMemberKeys === nextMemberKeys &&
      lastMessageEqual &&
      prevFriendIds === nextFriendIds &&
      JSON.stringify(prev.conversation.data.typing) === JSON.stringify(next.conversation.data.typing)
    );
  }),
  { Skeleton: ConversationItemSkeleton }
);
