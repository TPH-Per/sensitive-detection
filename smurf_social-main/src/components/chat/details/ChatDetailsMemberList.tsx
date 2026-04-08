import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, RtdbConversation, RtdbUserChat, UserStatus } from '../../../../shared/types';
import {
  UserAvatar, UserStatusText, Dropdown, DropdownItem,
  ConfirmDialog, IconButton,
} from '../../ui';
import {
  Crown, Shield, UserPlus, MoreVertical,
  UserMinus, ShieldPlus, ShieldMinus, Lock,
} from 'lucide-react';

interface ChatDetailsMemberListProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  participants: User[];
  onMemberClick?: (userId: string) => void;
  onAddMember?: () => void;
  onRemoveMember?: (userId: string) => void;
  onPromoteToAdmin?: (userId: string) => void;
  onDemoteFromAdmin?: (userId: string) => void;
}

export const ChatDetailsMemberList: React.FC<ChatDetailsMemberListProps> = ({
  conversation, currentUserId, participants,
  onMemberClick, onAddMember, onRemoveMember,
  onPromoteToAdmin, onDemoteFromAdmin,
}) => {
  const navigate = useNavigate();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (!conversation.data.isGroup) return null;

  const creatorId = conversation.data.creatorId;
  const memberRoles = conversation.data.members;
  const isCurrentUserAdmin = memberRoles[currentUserId] === 'admin';
  const isCurrentUserCreator = creatorId === currentUserId;

  const getMemberRole = (memberId: string) => {
    if (memberId === creatorId) return 'creator';
    if (memberRoles[memberId] === 'admin') return 'admin';
    return 'member';
  };

  const canManageMember = (memberId: string) => {
    if (memberId === currentUserId) return false;
    if (memberId === creatorId) return false;
    if (!isCurrentUserAdmin && !isCurrentUserCreator) return false;
    if (memberRoles[memberId] === 'admin' && !isCurrentUserCreator) return false;
    return true;
  };

  return (
    <div className="py-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
          Thành viên ({participants.length})
        </p>
        {(isCurrentUserAdmin || isCurrentUserCreator) && onAddMember && (
          <button
            onClick={onAddMember}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline transition-colors duration-200"
          >
            <UserPlus size={13} />
            Thêm
          </button>
        )}
      </div>

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
              {/* Avatar + info */}
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
                      className="text-xs text-text-tertiary"
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
                  {!isBanned && role === 'member' && onPromoteToAdmin && (
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
