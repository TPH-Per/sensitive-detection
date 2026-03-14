import { useMemo, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';

/**
 * Helpers kiểm tra block từng loại
 */
export const useBlockedUsers = () => {
  const blockedUsers = useAuthStore(state => state.blockedUsers);

  const blockedUserIds = useMemo(() => Object.keys(blockedUsers), [blockedUsers]);

  const isBlocked = useCallback(
    (userId: string) => !!blockedUsers[userId],
    [blockedUsers]
  );

  const isMessageBlocked = useCallback(
    (userId: string) => !!blockedUsers[userId]?.blockMessages,
    [blockedUsers]
  );

  const isCallBlocked = useCallback(
    (userId: string) => !!blockedUsers[userId]?.blockCalls,
    [blockedUsers]
  );

  const isActivityBlocked = useCallback(
    (userId: string) => !!(blockedUsers[userId]?.blockViewMyActivity || blockedUsers[userId]?.hideTheirActivity),
    [blockedUsers]
  );

  const isTheirActivityHidden = useCallback(
    (userId: string) => !!blockedUsers[userId]?.hideTheirActivity,
    [blockedUsers]
  );

  return { blockedUsers, blockedUserIds, isBlocked, isMessageBlocked, isCallBlocked, isActivityBlocked, isTheirActivityHidden };
};
