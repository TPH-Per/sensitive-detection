import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Clock } from 'lucide-react';
import { UserAvatar, Button } from '../ui';
import { FriendRequest, User } from '../../../shared/types';
import { formatRelativeTime } from '../../utils/dateUtils';

interface FriendRequestItemProps {
  request: FriendRequest;
  user: User;
  type: 'received' | 'sent';
  onAccept?: (requestId: string, friendId: string) => void;
  onReject?: (requestId: string) => void;
  onCancel?: (requestId: string) => void;
  isLoading?: boolean;
}

const FriendRequestItemInner: React.FC<FriendRequestItemProps> = ({
  request,
  user,
  type,
  onAccept,
  onReject,
  onCancel,
  isLoading = false
}) => {
  const navigate = useNavigate();

  const handleProfileClick = () => {
    if (user?.id) {
      navigate(`/profile/${user.id}`);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-bg-hover active:bg-bg-active rounded-xl first:rounded-t-xl last:rounded-b-xl transition-all duration-base border-b border-divider last:border-0 gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <UserAvatar
          userId={user.id}
          src={user.avatar.url}
          name={user.fullName}
          size="lg"
          initialStatus={user.status}
          onClick={handleProfileClick}
        />
        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-text-primary cursor-pointer hover:underline truncate"
            onClick={handleProfileClick}
          >
            {user.fullName}
          </h3>
          <p className="text-xs text-text-tertiary mt-1 flex items-center gap-1">
            <Clock size={12} />
            {formatRelativeTime(request.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex gap-2 sm:shrink-0">
        {type === 'received' && (
          <>
            <Button
              className="flex-1 sm:flex-none"
              variant="primary"
              size="sm"
              icon={<Check size={16} />}
              onClick={() => onAccept?.(request.id, user.id)}
              disabled={isLoading}
            >
              Chấp nhận
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              variant="secondary"
              size="sm"
              icon={<X size={16} />}
              onClick={() => onReject?.(request.id)}
              disabled={isLoading}
            >
              Từ chối
            </Button>
          </>
        )}
        {type === 'sent' && (
          <Button
            className="flex-1 sm:flex-none"
            variant="secondary"
            size="sm"
            onClick={() => onCancel?.(request.id)}
            disabled={isLoading}
          >
            Hủy lời mời
          </Button>
        )}
      </div>
    </div>
  );
};

export const FriendRequestItem = React.memo(FriendRequestItemInner);
