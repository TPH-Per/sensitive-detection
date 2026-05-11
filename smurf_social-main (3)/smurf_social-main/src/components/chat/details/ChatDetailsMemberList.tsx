import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, RtdbConversation, RtdbUserChat, UserStatus } from '../../../../shared/types';
import {
  UserAvatar, UserStatusText, Dropdown, DropdownItem,
  ConfirmDialog, IconButton,
} from '../../ui';
import {
  Crown, Shield, UserPlus, MoreVertical,
  UserMinus, ShieldPlus, ShieldMinus, Lock, Users, ChevronRight,
} from 'lucide-react';
import { CONFIRM_MESSAGES } from '../../../constants/confirmMessages';
import { PendingMembersModal } from './PendingMembersModal';

interface ChatDetailsMemberListProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  participants: User[];
  usersMap: Record<string, User>;
  onMemberClick?: (userId: string) => void;
  onAddMember?: () => void;
  onRemoveMember?: (userId: string) => void;
  onPromoteToAdmin?: (userId: string) => void;
  onDemoteFromAdmin?: (userId: string) => void;
  onApproveMembers?: (uids: string[]) => Promise<void>;
  onRejectMembers?: (uids: string[]) => Promise<void>;
}

/** Danh sách thành viên trong nhóm chat */
export const ChatDetailsMemberList: React.FC<ChatDetailsMemberListProps> = ({
  conversation, currentUserId, participants, usersMap,
  onMemberClick, onAddMember, onRemoveMember,
  onPromoteToAdmin, onDemoteFromAdmin,
  onApproveMembers, onRejectMembers,
}) => {
  const navigate = useNavigate();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);

  if (!conversation.data.isGroup) return null;

  const creatorId = conversation.data.creatorId;
  const memberRoles = conversation.data.members;
  const pendingMembers = conversation.data.pendingMembers || {};
  const pendingEntries = Object.entries(pendingMembers);

  const isCurrentUserAdmin = memberRoles[currentUserId] === 'admin';
  const isCurrentUserCreator = creatorId === currentUserId;
  const canManageMembers = isCurrentUserAdmin || isCurrentUserCreator;

  const getMemberRole = (memberId: string) => {
    if (memberId === creatorId) return 'creator';
    if (memberRoles[memberId] === 'admin') return 'admin';
    return 'member';
  };

  const canManageMember = (memberId: string) => {
    if (memberId === currentUserId) return false;
    if (memberId === creatorId) return false;
    if (!canManageMembers) return false;
    if (memberRoles[memberId] === 'admin' && !isCurrentUserCreator) return false;
    return true;
  };


  return (
    <div className="py-3">
      {canManageMembers && pendingEntries.length > 0 && (
        <button
          onClick={() => setShowPendingModal(true)}
          className="w-[calc(100%-1.5rem)] mx-3 mb-4 flex items-center gap-3 px-4 py-3 bg-primary/5 hover:bg-primary/10 rounded-xl border border-primary/10 transition-all duration-200 group"
        >
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Users size={20} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-primary">Phê duyệt thành viên</p>
            <p className="text-xs text-primary/70">{pendingEntries.length} người đang chờ duyệt</p>
          </div>
          <ChevronRight size={18} className="text-primary/40 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Members Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
          Thành viên ({participants.length})
        </p>
        {onAddMember && (
          <button
            onClick={onAddMember}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline transition-colors duration-200"
          >
            <UserPlus size={13} />
            Thêm
          </button>
        )}
      </div>

      {/* Members List */}
      <div>
        {participants.map((member) => {
          const isCurrentUser = member.id === currentUserId;
          const role = getMemberRole(member.id);
          const canManage = canManageMember(member.id);
          const isBanned = member.status === UserStatus.BANNED;

          return (
            <div
              key={member.id}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors duration-200 group
                ${isBanned ? 'opacity-60' : 'hover:bg-bg-hover active:bg-bg-active'}`}
            >
              <div
                onClick={() => !isCurrentUser && !isBanned && onMemberClick?.(member.id)}
                className={`flex items-center gap-3 flex-1 min-w-0 ${!isCurrentUser && !isBanned ? 'cursor-pointer' : ''}`}
              >
                <UserAvatar
                  userId={member.id}
                  size="sm"
                  showStatus={!isBanned}
                  onClick={() => !isBanned && navigate(`/profile/${member.id}`)}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {member.fullName}
                      {isCurrentUser && (
                        <span className="text-text-tertiary font-normal"> (Bạn)</span>
                      )}
                    </span>

                    {role === 'creator' && (
                      <Crown size={13} className="text-warning flex-shrink-0" aria-label="Trưởng nhóm" />
                    )}
                    {role === 'admin' && (
                      <Shield size={13} className="text-info flex-shrink-0" aria-label="Admin" />
                    )}
                    {isBanned && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-error/10 text-error flex-shrink-0">
                        <Lock size={9} />
                        Đã khóa
                      </span>
                    )}
                  </div>

                  {!isBanned && (
                    <UserStatusText
                      userId={member.id}
                      initialStatus={member.status}
                      className="text-xs"
                    />
                  )}
                </div>
              </div>

              {/* Context menu */}
              {canManage && (
                <Dropdown
                  isOpen={menuOpenId === member.id}
                  onOpenChange={(open) => setMenuOpenId(open ? member.id : null)}
                  trigger={
                    <IconButton
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      icon={<MoreVertical size={16} />}
                      size="sm"
                    />
                  }
                >
                  {!isBanned && role === 'member' && isCurrentUserCreator && onPromoteToAdmin && (
                    <DropdownItem
                      icon={<ShieldPlus size={14} />}
                      label="Thăng làm Admin"
                      onClick={() => { onPromoteToAdmin(member.id); setMenuOpenId(null); }}
                    />
                  )}
                  {!isBanned && role === 'admin' && isCurrentUserCreator && onDemoteFromAdmin && (
                    <DropdownItem
                      icon={<ShieldMinus size={14} />}
                      label="Hạ quyền Admin"
                      onClick={() => { onDemoteFromAdmin(member.id); setMenuOpenId(null); }}
                    />
                  )}
                  {onRemoveMember && (
                    <DropdownItem
                      icon={<UserMinus size={14} />}
                      label="Xóa khỏi nhóm"
                      variant="danger"
                      onClick={() => { setConfirmRemove(member.id); setMenuOpenId(null); }}
                    />
                  )}
                </Dropdown>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending Members Modal */}
      <PendingMembersModal
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        conversation={conversation}
        usersMap={usersMap}
        onApproveMembers={onApproveMembers}
        onRejectMembers={onRejectMembers}
      />

      {/* Remove Member Confirmation */}
      <ConfirmDialog
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => { if (confirmRemove) onRemoveMember?.(confirmRemove); setConfirmRemove(null); }}
        title="Xóa thành viên"
        message="Bạn có chắc chắn muốn xóa thành viên này khỏi nhóm?"
        confirmLabel="Xóa ngay"
        variant="danger"
      />
    </div>
  );
};
