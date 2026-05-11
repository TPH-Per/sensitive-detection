import React, { useState } from 'react';
import { RtdbConversation, RtdbUserChat, ReportType, User, UserStatus } from '../../../../shared/types';
import {
  Bell, BellOff, Pin, PinOff, Trash2, ChevronRight,
  Ban, LogOut, Edit3, User as UserIcon, Flag, Archive as ArchiveIcon,
} from 'lucide-react';
import { ConfirmDialog } from '../../ui';
import { useReportStore } from '../../../store/reportStore';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { useConversationMemberSettings } from '../../../hooks/chat/useConversationMemberSettings';

interface ChatDetailsActionsProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  partner?: User;
  isBlocked?: boolean;
  onToggleMute?: () => void;
  onTogglePin?: () => void;
  onToggleBlock?: () => void;
  onToggleArchive?: () => void;
  onDelete?: () => void;
  onLeaveGroup?: () => void;
  onEditGroup?: () => void;
  onViewProfile?: () => void;
}

type ActionVariant = 'default' | 'danger';

interface Action {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant: ActionVariant;
}

export const ChatDetailsActions: React.FC<ChatDetailsActionsProps> = ({
  conversation, currentUserId, partner,
  onToggleMute, onTogglePin, onToggleBlock, onToggleArchive,
  onDelete, onLeaveGroup, onEditGroup, onViewProfile,
}) => {
  const { openReportModal } = useReportStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);
  const isGroup = conversation.data.isGroup;
  const isCreator = isGroup && conversation.data.creatorId === currentUserId;
  const isDisbandAction = isGroup && isCreator;
  const isMuted = memberSettings?.isMuted || false;

  const actions: Action[] = [
    {
      icon: isMuted ? <Bell size={18} /> : <BellOff size={18} />,
      label: isMuted ? 'Bật thông báo' : 'Tắt thông báo',
      onClick: onToggleMute,
      variant: 'default',
    },
    {
      icon: memberSettings?.isPinned ? <PinOff size={18} /> : <Pin size={18} />,
      label: memberSettings?.isPinned ? 'Bỏ ghim' : 'Ghim cuộc trò chuyện',
      onClick: onTogglePin,
      variant: 'default',
    },
    ...(onToggleArchive ? [{
      icon: <ArchiveIcon size={18} />,
      label: memberSettings?.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ cuộc trò chuyện',
      onClick: onToggleArchive,
      variant: 'default' as ActionVariant,
    }] : []),
    ...(isGroup && onEditGroup ? [{
      icon: <Edit3 size={18} />,
      label: 'Chỉnh sửa nhóm',
      onClick: onEditGroup,
      variant: 'default' as ActionVariant,
    }] : []),
    ...(!isGroup && onViewProfile ? [{
      icon: <UserIcon size={18} />,
      label: 'Xem trang cá nhân',
      onClick: onViewProfile,
      variant: 'default' as ActionVariant,
    }] : []),
    ...(!isGroup && partner?.status !== UserStatus.BANNED ? [
      {
        icon: <Ban size={18} />,
        label: 'Quản lý chặn',
        onClick: onToggleBlock,
        variant: 'danger' as ActionVariant,
      },
      ...(() => {
        const partnerId = Object.keys(conversation.data.members).find(id => id !== currentUserId);
        return partnerId ? [{
          icon: <Flag size={18} />,
          label: 'Báo cáo người dùng',
          onClick: () => openReportModal(ReportType.USER, partnerId, partnerId),
          variant: 'danger' as ActionVariant,
        }] : [];
      })(),
    ] : []),
    ...(isGroup && onLeaveGroup ? [{
      icon: <LogOut size={18} />,
      label: 'Rời khỏi nhóm',
      onClick: () => setShowLeaveConfirm(true),
      variant: 'danger' as ActionVariant,
    }] : []),
    ...(onDelete ? [{
      icon: <Trash2 size={18} />,
      label: isDisbandAction ? 'Giải tán nhóm' : 'Xóa cuộc trò chuyện',
      onClick: () => setShowDeleteConfirm(true),
      variant: 'danger' as ActionVariant,
    }] : []),
  ];

  return (
    <div className="py-3 border-t border-border-light">
      <p className="px-4 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wide">
        Tùy chọn
      </p>

      <div>
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`
              w-full flex items-center gap-3 px-4 py-3 transition-colors duration-200 text-left
              ${action.variant === 'danger'
                ? 'text-error hover:bg-error/5 active:bg-error/10'
                : 'text-text-primary hover:bg-bg-hover active:bg-bg-active'
              }
            `}
          >
            <span className={`flex-shrink-0 ${action.variant === 'danger' ? 'text-error' : 'text-text-secondary'}`}>
              {action.icon}
            </span>
            <span className="flex-1 text-sm font-medium">{action.label}</span>
            <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
          </button>
        ))}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => onDelete?.()}
        title={isDisbandAction
          ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.TITLE
          : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.TITLE}
        message={isDisbandAction
          ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.MESSAGE
          : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.MESSAGE}
        confirmLabel={isDisbandAction
          ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.CONFIRM
          : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.CONFIRM}
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
