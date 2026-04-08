import React, { useCallback } from 'react';
import { MoreVertical, UserMinus, User as UserIcon, Lock } from 'lucide-react';
import { UserAvatar, UserStatusText, IconButton, Dropdown, DropdownItem, Skeleton } from '../ui';
import { User, UserStatus } from '../../../shared/types';
import { useNavigate } from 'react-router-dom';

interface FriendItemProps {
  friend: User;
  onUnfriend?: (friendId: string) => void;
  onMessage?: (friendId: string) => void;
}

const FriendItemInner: React.FC<FriendItemProps> = ({ friend, onUnfriend, onMessage }) => {
  const navigate = useNavigate();
  const isBanned = friend.status === UserStatus.BANNED;

  const handleMessage = useCallback(() => {
    if (isBanned) return;
    if (onMessage) onMessage(friend.id);
    else navigate('/');
  }, [onMessage, friend.id, navigate, isBanned]);

  return (
    <div
      className={`relative flex items-center justify-between px-4 py-3 transition-colors duration-200 group
        border-b border-border-light/60 last:border-0
        ${isBanned
          ? 'opacity-60 cursor-default'
          : 'hover:bg-bg-hover active:bg-bg-active cursor-pointer'
        }`}
      onClick={handleMessage}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <UserAvatar userId={friend.id} size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {friend.fullName}
            </h3>
            {isBanned && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-error/10 text-error flex-shrink-0">
                <Lock size={9} />
                Đã khóa
              </span>
            )}
          </div>
          {!isBanned && (
            <UserStatusText
              userId={friend.id}
              className="text-xs text-text-tertiary"
              initialStatus={friend.status}
            />
          )}
        </div>
      </div>

      {/* Context menu */}
      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
        <Dropdown
          trigger={
            <IconButton
              icon={<MoreVertical size={15} />}
              size="sm"
              className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-200"
            />
          }
        >
          <DropdownItem
            icon={<UserIcon size={14} />}
            label="Xem trang cá nhân"
            onClick={() => navigate(`/profile/${friend.id}`)}
          />
          <DropdownItem
            icon={<UserMinus size={14} />}
            label="Hủy kết bạn"
            variant="danger"
            onClick={() => onUnfriend?.(friend.id)}
          />
        </Dropdown>
      </div>
    </div>
  );
};

const FriendItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-border-light/60 last:border-0">
    <div className="flex items-center gap-3 flex-1">
      <Skeleton variant="circle" width={40} height={40} />
      <div className="space-y-1.5">
        <Skeleton variant="line" width={120} height={13} />
        <Skeleton variant="line" width={75} height={11} className="opacity-60" />
      </div>
    </div>
    <Skeleton variant="rect" width={30} height={30} className="rounded-lg opacity-40" />
  </div>
);

export const FriendItem = Object.assign(
  React.memo(FriendItemInner),
  { Skeleton: FriendItemSkeleton }
) as React.FC<FriendItemProps> & { Skeleton: React.FC };
