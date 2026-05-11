import { useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';

export const useBlockedUsers = () => {
  const blockedUsers = useAuthStore(state => state.blockedUsers);

  const blockedUserIds = useMemo(() => Object.keys(blockedUsers), [blockedUsers]);

  const hiddenActivityUserIds = useMemo(
    () => Object.keys(blockedUsers).filter(id => blockedUsers[id]?.hideTheirActivity),
    [blockedUsers]
  );

  const isHidingMyActivity = useCallback(
    (userId: string) => !!blockedUsers[userId]?.blockViewMyActivity,
    [blockedUsers]
  );
  const isMessageBlocked = useCallback(
    (userId: string) => !!blockedUsers[userId]?.blockMessages,
    [blockedUsers]
  );

  const isBlocked = useCallback(
    (userId: string) => !!blockedUsers[userId],
    [blockedUsers]
  );

  return { 
    blockedUsers, 
    blockedUserIds, 
    hiddenActivityUserIds,
    isBlocked,
    isHidingMyActivity,
    isMessageBlocked 
  };
};
