import React from 'react';
import { formatStatusTime } from '../../utils/dateUtils';
import { usePresence } from '../../hooks/usePresence';

interface UserStatusTextProps {
  userId: string;
  className?: string;
  initialStatus?: 'active' | 'banned';
  onlineText?: string;
  offlineText?: string;
}

export const UserStatusText: React.FC<UserStatusTextProps> = ({
  userId,
  className = '',
  initialStatus,
  onlineText = 'Đang hoạt động',
  offlineText = 'Không hoạt động'
}) => {
  const presence = usePresence(userId, initialStatus);

  if (initialStatus === 'banned') {
    return null;
  }

  const getStatusText = () => {
    if (presence && 'isOnline' in presence && presence.isOnline) return onlineText;

    if (presence && 'lastSeen' in presence && presence.lastSeen) {
      const date = new Date(presence.lastSeen);
      return formatStatusTime(date);
    }

    return offlineText;
  };

  return (
    <span className={`${className} ${presence && 'isOnline' in presence && presence.isOnline ? '!text-status-online font-medium' : ''}`}>
      {getStatusText()}
    </span>
  );
};
