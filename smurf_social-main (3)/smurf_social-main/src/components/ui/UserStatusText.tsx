import React from 'react';
import { formatStatusTime } from '../../utils/dateUtils';
import { usePresence } from '../../hooks/usePresence';
import { useUserCache } from '../../store/userCacheStore';

import { useContactStore } from '../../store/contactStore';


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
  const cachedUser = useUserCache(state => state.users[userId]);
  const isFriend = useContactStore(state => state.friends.some(f => f.id === userId));

  const effectiveStatus = cachedUser?.status ?? initialStatus;

  if (effectiveStatus === 'banned' || !isFriend) return null;

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
