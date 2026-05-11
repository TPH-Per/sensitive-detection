import React, { useState } from 'react';
import { RtdbConversation, RtdbUserChat, ReportType, User, UserStatus } from '../../../../shared/types';
import {
  Bell, BellOff, Pin, PinOff, Trash2, ChevronRight,
  Ban, LogOut, Edit3, User as UserIcon, Flag, Archive as ArchiveIcon,
  Crown, Shield, ToggleLeft, ToggleRight, ShieldCheck, Search, Link2, RotateCcw,
  Copy, Check, QrCode,
} from 'lucide-react';
import { ConfirmDialog } from '../../ui';
import { useReportStore } from '../../../store/reportStore';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { useConversationMemberSettings } from '../../../hooks/chat/useConversationMemberSettings';
import { QRCodeModal } from '../modals/QRCodeModal';

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
  onTransferCreator?: () => void;
  onToggleApprovalMode?: (enabled: boolean) => Promise<void>;
  onSetTab?: (tabId: 'info' | 'members' | 'media' | 'search') => void;
  onCopyInviteLink?: () => Promise<void>;
  onResetInviteLink?: () => Promise<void>;
}

const QuickActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
}> = ({ icon, label, onClick, active, danger }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 group outline-none"
  >
    <div className={`
      w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200
      ${danger
        ? 'bg-error/10 text-error hover:bg-error hover:text-white'
        : active
          ? 'bg-primary/10 text-primary'
          : 'bg-bg-secondary text-text-secondary hover:bg-bg-active hover:text-text-primary border border-transparent'
      }
    `}>
      {icon}
    </div>
    <span className={`text-[10px] font-semibold transition-colors ${danger ? 'text-error' : active ? 'text-primary' : 'text-text-tertiary group-hover:text-text-primary'}`}>
      {label}
    </span>
  </button>
);

/** Hành động và cài đặt hội thoại. */
export const ChatDetailsActions: React.FC<ChatDetailsActionsProps> = ({
  conversation, currentUserId, partner,
  onToggleMute, onTogglePin, onToggleBlock, onToggleArchive,
  onDelete, onLeaveGroup, onEditGroup, onViewProfile,
  onTransferCreator, onToggleApprovalMode, onSetTab, onCopyInviteLink, onResetInviteLink,
}) => {
  const { openReportModal } = useReportStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showApprovalOffConfirm, setShowApprovalOffConfirm] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [showResetInviteConfirm, setShowResetInviteConfirm] = useState(false);
  const [isCopyingInvite, setIsCopyingInvite] = useState(false);
  const [isResettingInvite, setIsResettingInvite] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const memberSettings = useConversationMemberSettings(conversation.id, currentUserId);
  const isGroup = conversation.data.isGroup;
  const isCreator = isGroup && conversation.data.creatorId === currentUserId;
  const isAdmin = isGroup && conversation.data.members[currentUserId] === 'admin';
  const isAdminOrCreator = isAdmin || isCreator;
  const isDisbandAction = isGroup && isCreator;
  const isMuted = memberSettings?.isMuted || false;
  const isPinned = memberSettings?.isPinned || false;
  const isArchived = memberSettings?.isArchived || false;
  const approvalMode = conversation.data.joinApprovalMode ?? false;

  const handleApprovalToggle = () => {
    if (approvalMode) {
      setShowApprovalOffConfirm(true);
    } else {
      onToggleApprovalMode?.(true);
    }
  };

  const handleCopyInvite = async () => {
    if (!onCopyInviteLink || isCopyingInvite) return;
    setIsCopyingInvite(true);
    try {
      await onCopyInviteLink();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setIsCopyingInvite(false);
    }
  };

  const handleResetInvite = async () => {
    if (!onResetInviteLink || isResettingInvite) return;
    setIsResettingInvite(true);
    try {
      await onResetInviteLink();
      setShowResetInviteConfirm(false);
    } finally {
      setIsResettingInvite(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Quick Actions Row */}
      <div className="flex items-center justify-around px-4 py-5 bg-bg-primary">
        <QuickActionButton
          icon={isMuted ? <Bell size={18} /> : <BellOff size={18} />}
          label={isMuted ? 'Bật âm' : 'Tắt âm'}
          onClick={onToggleMute}
          active={isMuted}
        />
        <QuickActionButton
          icon={isPinned ? <PinOff size={18} /> : <Pin size={18} />}
          label={isPinned ? 'Bỏ ghim' : 'Ghim'}
          onClick={onTogglePin}
          active={isPinned}
        />
        <QuickActionButton
          icon={<ArchiveIcon size={18} />}
          label={isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
          onClick={onToggleArchive}
          active={isArchived}
        />
        {!isGroup && partner && (
          <QuickActionButton
            icon={<UserIcon size={18} />}
            label="Trang cá nhân"
            onClick={onViewProfile}
          />
        )}
        {isGroup && (
          <QuickActionButton
            icon={<Edit3 size={18} />}
            label="Sửa nhóm"
            onClick={onEditGroup}
          />
        )}
      </div>

      <div className="h-px bg-border-light" />
      {/* Main Settings Sections */}
      <div className="pt-2 pb-6">
        {/* Section: Group Special Settings */}
        {isGroup && isAdminOrCreator && onToggleApprovalMode && (
          <div
            className="flex items-center justify-between w-full px-5 py-3 hover:bg-bg-hover transition-colors cursor-pointer group"
            onClick={handleApprovalToggle}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-bg-secondary text-text-tertiary transition-colors">
                <ShieldCheck size={18} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-text-primary leading-tight">Phê duyệt thành viên</span>
                <span className="text-[10px] text-text-tertiary">Kiểm soát người mới</span>
              </div>
            </div>
            <div className={`w-9 h-5 rounded-full transition-all duration-300 relative flex items-center px-1
              ${approvalMode ? 'bg-primary border border-primary' : 'bg-bg-tertiary border border-border-light'}`}>
              <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-300
                ${approvalMode ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </div>
        )}

        {/* Section: General & Actions */}
        <div className="flex flex-col">
          {isGroup && isAdminOrCreator && (
            <div className="flex items-center justify-between w-full px-5 py-3 hover:bg-bg-hover transition-colors group">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-tertiary shrink-0">
                  <Link2 size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-text-primary leading-tight">Link tham gia</span>
                  <span className="text-[10px] text-primary truncate">
                    {conversation.data.inviteLink 
                      ? `${window.location.origin}/join/${conversation.data.inviteLink}` 
                      : 'Chưa có link mời'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={handleCopyInvite}
                  disabled={isCopyingInvite}
                  className="p-2 rounded-lg hover:bg-bg-active text-text-tertiary hover:text-primary transition-all disabled:opacity-50 outline-none"
                  title="Sao chép link"
                >
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
                <button
                  onClick={() => setShowQRCode(true)}
                  className="p-2 rounded-lg hover:bg-bg-active text-text-tertiary hover:text-primary transition-all outline-none"
                  title="Hiển thị mã QR"
                >
                  <QrCode size={16} />
                </button>
                <button
                  onClick={() => setShowResetInviteConfirm(true)}
                  disabled={isResettingInvite}
                  className="p-2 rounded-lg hover:bg-bg-active text-text-tertiary hover:text-primary transition-all disabled:opacity-50 outline-none"
                  title="Tạo lại link"
                >
                  <RotateCcw size={16} className={isResettingInvite ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          )}

          {isGroup && isCreator && onTransferCreator && (
            <button
              onClick={() => setShowTransferConfirm(true)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-bg-hover transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center text-warning transition-colors">
                  <Crown size={16} />
                </div>
                <span className="text-sm font-semibold text-warning leading-tight">Chuyển quyền trưởng nhóm</span>
              </div>
              <ChevronRight size={14} className="text-text-tertiary" />
            </button>
          )}

          {!isGroup && partner?.status !== UserStatus.BANNED && (
            <>
              <button
                onClick={onToggleBlock}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 transition-colors text-left text-error group"
              >
                <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error transition-colors">
                  <Ban size={16} />
                </div>
                <span className="text-sm font-semibold">Quản lý chặn</span>
              </button>
              <button
                onClick={() => {
                  const partnerId = Object.keys(conversation.data.members).find(id => id !== currentUserId);
                  if (partnerId) openReportModal(ReportType.USER, partnerId, partnerId);
                }}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 transition-colors text-left text-error group"
              >
                <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error transition-colors">
                  <Flag size={16} />
                </div>
                <span className="text-sm font-semibold">Báo cáo người dùng</span>
              </button>
            </>
          )}

          {isGroup && onLeaveGroup && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 transition-colors text-left text-error group"
            >
              <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error transition-colors">
                <LogOut size={16} />
              </div>
              <span className="text-sm font-semibold">Rời khỏi nhóm</span>
            </button>
          )}

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-error/5 transition-colors text-left text-error group"
          >
            <div className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center text-error transition-colors">
              <Trash2 size={16} />
            </div>
            <span className="text-sm font-semibold">{isDisbandAction ? 'Giải tán nhóm' : 'Xóa cuộc trò chuyện'}</span>
          </button>
        </div>
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

      <ConfirmDialog
        isOpen={showApprovalOffConfirm}
        onClose={() => setShowApprovalOffConfirm(false)}
        onConfirm={() => { onToggleApprovalMode?.(false); setShowApprovalOffConfirm(false); }}
        title={CONFIRM_MESSAGES.CHAT.TOGGLE_APPROVAL_OFF.TITLE}
        message={CONFIRM_MESSAGES.CHAT.TOGGLE_APPROVAL_OFF.MESSAGE}
        confirmLabel={CONFIRM_MESSAGES.CHAT.TOGGLE_APPROVAL_OFF.CONFIRM}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showTransferConfirm}
        onClose={() => setShowTransferConfirm(false)}
        onConfirm={() => { onTransferCreator?.(); setShowTransferConfirm(false); }}
        title={CONFIRM_MESSAGES.CHAT.TRANSFER_CREATOR.TITLE}
        message={CONFIRM_MESSAGES.CHAT.TRANSFER_CREATOR.MESSAGE}
        confirmLabel={CONFIRM_MESSAGES.CHAT.TRANSFER_CREATOR.CONFIRM}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showResetInviteConfirm}
        onClose={() => setShowResetInviteConfirm(false)}
        onConfirm={handleResetInvite}
        title="Reset link tham gia"
        message="Link hiện tại sẽ bị vô hiệu ngay lập tức. Bạn có muốn tiếp tục?"
        confirmLabel="Reset link"
        variant="danger"
      />

      <QRCodeModal
        isOpen={showQRCode}
        onClose={() => setShowQRCode(false)}
        value={conversation.data.inviteLink ? `${window.location.origin}/join/${conversation.data.inviteLink}` : ''}
        avatarSrc={conversation.data.avatar}
        avatarName={conversation.data.name}
      />
    </div>
  );
};
