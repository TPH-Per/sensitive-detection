import React from 'react';
import { formatStatusTime } from '../../utils/dateUtils';
import { usePresence } from '../../hooks/usePresence';
import { useUserCache } from '../../store/userCacheStore';
import { useAuthStore } from '../../store/authStore';
import { useContactStore } from '../../store/contactStore';
import { useBlockedUsers } from '../../hooks';

interface UserStatusTextProps {
  userId: string;
  className?: string;
  initialStatus?: 'active' | 'banned';
  onlineText?: string;
  offlineText?: string;
}

export const UserStatusText: React.FC<UserStatusTextProps> = ({
  userId, className = '', initialStatus,
  onlineText = 'Đang hoạt động', offlineText = 'Không hoạt động',
}) => {
  const presence = usePresence(userId, initialStatus);
  const currentUser = useAuthStore(state => state.user);
  const isFriend = useContactStore(state => state.friends.some(f => f.id === userId));
  const { isBlocked: checkBlocked } = useBlockedUsers();
  const cachedUser = useUserCache(state => state.users[userId]);

  const effectiveStatus = cachedUser?.status ?? initialStatus;

  if (effectiveStatus === 'banned') return null;
  const canShowStatus = userId === currentUser?.id || (isFriend && !checkBlocked(userId));
  if (!canShowStatus) return null;

  const isOnline = presence && 'isOnline' in presence && presence.isOnline;

  const statusText = isOnline
    ? onlineText
    : (presence && 'lastSeen' in presence && presence.lastSeen)
      ? formatStatusTime(new Date(presence.lastSeen))
      : offlineText;

  return (
    <span className={`${isOnline ? 'text-status-online font-medium' : 'text-text-tertiary'} ${className}`}>
      {statusText}
    </span>
  );
};
