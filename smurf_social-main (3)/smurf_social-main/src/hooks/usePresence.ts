import { useEffect } from 'react';
import { usePresenceStore } from '../store/presenceStore';

/** Theo dõi trạng thái hoạt động của người dùng */
export const usePresence = (userId: string | undefined, initialStatus?: 'active' | 'banned') => {
  const subscribe = usePresenceStore(state => state.subscribe);
  const unsubscribe = usePresenceStore(state => state.unsubscribe);
  const presence = usePresenceStore(state => userId ? state.presenceMap[userId] || null : null);

  useEffect(() => {
    if (!userId) return;
    subscribe(userId);
    return () => unsubscribe(userId);
  }, [userId, subscribe, unsubscribe]);

  return presence || (initialStatus ? { status: initialStatus } : null);
};
