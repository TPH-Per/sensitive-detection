import React, { useState } from 'react';
import { RtdbConversation, RtdbUserChat } from '../../../types';
import { Bell, BellOff, Pin, PinOff, Trash2, ChevronRight, Ban, UserCheck, LogOut, Edit3, User as UserIcon, Flag } from 'lucide-react';
import { ConfirmDialog, Button } from '../../ui';
import { useReportStore } from '../../../store/reportStore';
import { ReportType, NotificationType, User } from '../../../types';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { Mail, MailCheck, Archive as ArchiveIcon } from 'lucide-react';
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
  onViewProfile
}) => {
  const { openReportModal } = useReportStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);

  const isGroup = conversation.data.isGroup;
  const memberRole = conversation.data.members[currentUserId];
  const isAdmin = isGroup && memberRole === 'admin';
  const isCreator = isGroup && conversation.data.creatorId === currentUserId;

  // Xác định các actions dựa trên loại conversation
  const actions = [];

  // Mute/Unmute - cho cả group và 1-1
  const isMuted = memberSettings?.isMuted || false;
  actions.push({
    icon: isMuted ? <Bell size={20} /> : <BellOff size={20} />,
    label: isMuted ? 'Bật thông báo' : 'Tắt thông báo',
    onClick: onToggleMute,
    variant: 'default' as const,
  });

  // Pin/Unpin
  actions.push({
    icon: memberSettings?.isPinned ? <PinOff size={20} /> : <Pin size={20} />,
    label: memberSettings?.isPinned ? 'Bỏ ghim' : 'Ghim cuộc trò chuyện',
    onClick: onTogglePin,
    variant: 'default' as const,
  });

  // Archive/Unarchive
  if (onToggleArchive) {
    actions.push({
      icon: <ArchiveIcon size={20} />,
      label: memberSettings?.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ cuộc trò chuyện',
      onClick: onToggleArchive,
      variant: 'default' as const,
    });
  }

  // Đổi tên/ảnh nhóm — mọi thành viên đều có quyền
  if (isGroup && onEditGroup) {
    actions.push({
      icon: <Edit3 size={20} />,
      label: 'Chỉnh sửa nhóm',
      onClick: onEditGroup,
      variant: 'default' as const,
    });
  }

  // Xem trang cá nhân - chỉ cho chat 1-1
  if (!isGroup && onViewProfile) {
    actions.push({
      icon: <UserIcon size={20} />,
      label: 'Xem trang cá nhân',
      onClick: onViewProfile,
      variant: 'default' as const,
    });
  }

  // Block - chỉ cho chat 1-1
  if (!isGroup) {
    actions.push({
      icon: isBlocked ? <UserCheck size={20} /> : <Ban size={20} />,
      label: isBlocked ? 'Bỏ chặn người dùng' : 'Chặn người dùng',
      onClick: onToggleBlock,
      variant: 'danger' as const,
    });

    const participantIds = Object.keys(conversation.data.members);
    const partnerId = participantIds.find(id => id !== currentUserId);
    if (partnerId) {
      actions.push({
        icon: <Flag size={20} />,
        label: 'Báo cáo người dùng',
        onClick: () => openReportModal(ReportType.USER, partnerId, partnerId),
        variant: 'danger' as const,
      });
    }
  }

  // Leave group - cho group (không phải creator)
  if (isGroup && onLeaveGroup) {
    actions.push({
      icon: <LogOut size={20} />,
      label: 'Rời khỏi nhóm',
      onClick: () => setShowLeaveConfirm(true),
      variant: 'danger' as const,
    });
  }

  // Delete - cho phép mọi thành viên xóa lịch sử hội thoại
  if (onDelete) {
    actions.push({
      icon: <Trash2 size={20} />,
      label: isGroup && isCreator ? 'Giải tán nhóm' : 'Xóa cuộc trò chuyện',
      onClick: () => setShowDeleteConfirm(true),
      variant: 'danger' as const,
    });
  }

  return (
    <div className="py-4 border-t border-border-light">
      <h3 className="px-4 text-sm font-semibold text-text-secondary mb-2">
        Tùy chọn
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
        title={isGroup ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.TITLE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.TITLE}
        message={isGroup ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.MESSAGE : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.MESSAGE}
        confirmLabel={isGroup ? CONFIRM_MESSAGES.CHAT.DISBAND_GROUP.CONFIRM : CONFIRM_MESSAGES.CHAT.DELETE_CONVERSATION.CONFIRM}
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
