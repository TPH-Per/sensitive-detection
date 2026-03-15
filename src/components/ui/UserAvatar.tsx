import React, { useEffect, useMemo } from 'react';
import { User } from '../../../shared/types';
import { Avatar } from './Avatar';
import { usePresence } from '../../hooks/usePresence';
import { useAuthStore } from '../../store/authStore';
import { useContactStore } from '../../store/contactStore';
import { useUserCache } from '../../store/userCacheStore';
import { useBlockedUsers } from '../../hooks';

interface UserAvatarProps {
  userId: string;
  src?: string;
  name?: string;
  size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  initialStatus?: 'active' | 'banned';
  className?: string;
  isGroup?: boolean;
  members?: User[];
  showStatus?: boolean;
  showBorder?: boolean;
  onClick?: () => void;
}

const UserAvatarInner: React.FC<UserAvatarProps> = ({
  userId,
  src,
  name,
  size,
  className,
  isGroup,
  members,
  initialStatus,
  showStatus = true,
  showBorder = true,
  onClick
}) => {
  const presence = usePresence(isGroup ? undefined : userId, initialStatus);
  const currentUser = useAuthStore(state => state.user);
  const isFriend = useContactStore(state => state.friends.some(f => f.id === userId));
  const { isBlocked: checkBlocked } = useBlockedUsers();
  const cachedUser = useUserCache(state => userId ? state.users[userId] : undefined);
  const fetchUsers = useUserCache(state => state.fetchUsers);

  useEffect(() => {
    if (userId && !name && !cachedUser) {
      fetchUsers([userId]);
    }
  }, [userId, name, cachedUser, fetchUsers]);

  const displayName = name || cachedUser?.fullName;
  const avatarUrl = src || (userId === currentUser?.id ? currentUser?.avatar?.url : cachedUser?.avatar?.url);

  const statusToDisplay = useMemo((): 'active' | 'banned' | undefined => {
    if (!showStatus || initialStatus === 'banned') return undefined;
    if (userId === currentUser?.id) return presence && 'isOnline' in presence && presence.isOnline ? 'active' : undefined;

    const isBlocked = checkBlocked(userId);
    return (isFriend && !isBlocked && presence && 'isOnline' in presence && presence.isOnline) ? 'active' : undefined;
  }, [presence, showStatus, userId, currentUser?.id, isFriend, checkBlocked, initialStatus]);

  return (
    <Avatar
      src={avatarUrl}
      name={displayName}
      size={size}
      status={statusToDisplay}
      className={className}
      isGroup={isGroup}
      members={members}
      showBorder={showBorder}
      onClick={onClick}
    />
  );
};

export const UserAvatar = React.memo(UserAvatarInner);
