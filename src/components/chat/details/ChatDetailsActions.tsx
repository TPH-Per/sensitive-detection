import React, { useState } from 'react';
import { RtdbConversation, RtdbUserChat } from '../../../../shared/types';
import { Bell, BellOff, Pin, PinOff, Trash2, ChevronRight, Ban, UserCheck, LogOut, Edit3, User as UserIcon, Flag } from 'lucide-react';
import { ConfirmDialog, Button } from '../../ui';
import { useReportStore } from '../../../store/reportStore';
import { ReportType, User } from '../../../../shared/types';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { Archive as ArchiveIcon } from 'lucide-react';
import { useConversationMemberSettings } from '../../../hooks/chat/useConversationMemberSettings';

interface ChatDetailsActionsProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  participants: User[];
  partner?: User;
  isBlocked?: boolean;
  onToggleMute?: () => void;
  onTogglePin?: () => void;
  onToggleBlock?: () => void;
  onToggleArchive?: () => void;
  onToggleMarkUnread?: () => void;
  onDelete?: () => void;
  onLeaveGroup?: () => void;
  onEditGroup?: () => void;
  onViewProfile?: () => void;
}

export const ChatDetailsActions: React.FC<ChatDetailsActionsProps> = ({
  conversation,
  currentUserId,
  participants,
  partner,
  isBlocked,
  onToggleMute,
  onTogglePin,
  onToggleBlock,
  onToggleArchive,
  onToggleMarkUnread,
  onDelete,
  onLeaveGroup,
  onEditGroup,
  onViewProfile,
}) => {
  const { openReportModal } = useReportStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);

  const isGroup = conversation.data.isGroup;
  const isCreator = isGroup && conversation.data.creatorId === currentUserId;
  const isDisbandAction = isGroup && isCreator;

  // Xác d?nh các actions d?a trên lo?i conversation
  const actions = [];

  // Mute/Unmute - cho c? group và 1-1
  const isMuted = memberSettings?.isMuted || false;
  actions.push({
    icon: isMuted ? <Bell size={20} /> : <BellOff size={20} />,
    label: isMuted ? 'B?t thông báo' : 'T?t thông báo',
    onClick: onToggleMute,
    variant: 'default' as const,
  });

  // Pin/Unpin
  actions.push({
    icon: memberSettings?.isPinned ? <PinOff size={20} /> : <Pin size={20} />,
    label: memberSettings?.isPinned ? 'B? ghim' : 'Ghim cu?c trò chuy?n',
    onClick: onTogglePin,
    variant: 'default' as const,
  });

  // Archive/Unarchive
  if (onToggleArchive) {
    actions.push({
      icon: <ArchiveIcon size={20} />,
      label: memberSettings?.isArchived ? 'B? luu tr?' : 'Luu tr? cu?c trò chuy?n',
      onClick: onToggleArchive,
      variant: 'default' as const,
    });
  }

  // Ð?i tên/?nh nhóm — m?i thành viên d?u có quy?n
  if (isGroup && onEditGroup) {
    actions.push({
      icon: <Edit3 size={20} />,
      label: 'Ch?nh s?a nhóm',
      onClick: onEditGroup,
      variant: 'default' as const,
    });
  }

  // Xem trang cá nhân - ch? cho chat 1-1
  if (!isGroup && onViewProfile) {
    actions.push({
      icon: <UserIcon size={20} />,
      label: 'Xem trang cá nhân',
      onClick: onViewProfile,
      variant: 'default' as const,
    });
  }

  // Block - ch? cho chat 1-1
  if (!isGroup) {
    actions.push({
      icon: isBlocked ? <UserCheck size={20} /> : <Ban size={20} />,
      label: isBlocked ? 'B? ch?n ngu?i dùng' : 'Ch?n ngu?i dùng',
      onClick: onToggleBlock,
      variant: 'danger' as const,
    });

    const participantIds = Object.keys(conversation.data.members);
    const partnerId = participantIds.find(id => id !== currentUserId);
    if (partnerId) {
      actions.push({
        icon: <Flag size={20} />,
        label: 'Báo cáo ngu?i dùng',
        onClick: () => openReportModal(ReportType.USER, partnerId, partnerId),
        variant: 'danger' as const,
      });
    }
  }

  // Leave group - cho group (không ph?i creator)
  if (isGroup && onLeaveGroup) {
    actions.push({
      icon: <LogOut size={20} />,
      label: 'R?i kh?i nhóm',
      onClick: () => setShowLeaveConfirm(true),
      variant: 'danger' as const,
    });
  }

  // Delete - cho phép m?i thành viên xóa l?ch s? h?i tho?i
  if (onDelete) {
    actions.push({
      icon: <Trash2 size={20} />,
      label: isDisbandAction ? 'Gi?i tán nhóm' : 'Xóa cu?c trò chuy?n',
      onClick: () => setShowDeleteConfirm(true),
      variant: 'danger' as const,
    });
  }

  return (
    <div className="py-4 border-t border-border-light">
      <h3 className="px-4 text-sm font-semibold text-text-secondary mb-2">
        Tùy ch?n
      </h3>

      <div className="space-y-1">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`
              w-full flex items-center gap-3 px-4 py-3 transition-all duration-base
              ${action.variant === 'danger'
                ? 'text-error hover:bg-error/10'
                : 'text-text-primary hover:bg-bg-hover'
              }
            `}
          >
            <span className={action.variant === 'danger' ? 'text-error' : 'text-text-secondary'}>
              {action.icon}
            </span>
            <span className="flex-1 text-left text-sm font-medium">
              {action.label}
            </span>
            <ChevronRight size={16} className="text-text-tertiary" />
          </button>
        ))}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => onDelete?.()}
        title={isDisbandAction ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.TITLE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.TITLE}
        message={isDisbandAction ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.MESSAGE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.MESSAGE}
        confirmLabel={isDisbandAction ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.CONFIRM : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.CONFIRM}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={() => onLeaveGroup?.()}
        title={CONFIRM_MESSAGES.CHAT.LEAVE_GROUP.TITLE}
        message={CONFIRM_MESSAGES.CHAT.LEAVE_GROUP.MESSAGE}
        confirmLabel={CONFIRM_MESSAGES.CHAT.LEAVE_GROUP.CONFIRM}
        variant="danger"
      />
    </div>
  );
};
