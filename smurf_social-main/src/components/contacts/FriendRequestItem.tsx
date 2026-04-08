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
  request, user, type, onAccept, onReject, onCancel, isLoading = false,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3.5 transition-colors duration-200 hover:bg-bg-hover border-b border-border-light/60 last:border-0 gap-3">
      {/* User info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <UserAvatar
          userId={user.id}
          src={user.avatar?.url}
          name={user.fullName}
          size="md"
          initialStatus={user.status}
          onClick={() => navigate(`/profile/${user.id}`)}
        />
        <div className="flex-1 min-w-0">
          <button
            className="text-sm font-semibold text-text-primary hover:text-primary transition-colors duration-200 truncate block text-left"
            onClick={() => navigate(`/profile/${user.id}`)}
          >
            {user.fullName}
          </button>
          <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
            <Clock size={11} />
            {formatRelativeTime(request.createdAt)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {type === 'received' && (
          <>
            <Button
              size="sm"
              icon={<Check size={15} />}
              onClick={() => onAccept?.(request.id, user.id)}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              Chấp nhận
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<X size={15} />}
              onClick={() => onReject?.(request.id)}
              disabled={isLoading}
              className="flex-1 sm:flex-none"
            >
              Từ chối
            </Button>
          </>
        )}
        {type === 'sent' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCancel?.(request.id)}
            disabled={isLoading}
            className="flex-1 sm:flex-none"
          >
            Hủy lời mời
          </Button>
        )}
      </div>
    </div>
  );
};

export const FriendRequestItem = React.memo(FriendRequestItemInner);
