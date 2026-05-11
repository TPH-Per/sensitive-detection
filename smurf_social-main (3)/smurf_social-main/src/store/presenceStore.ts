import { create } from 'zustand';
import { presenceService } from '../services/presenceService';
import { RtdbPresence } from '../../shared/types';

interface PresenceState {
  presenceMap: Record<string, RtdbPresence>;
  subscriberCounts: Record<string, number>;
  unsubscribes: Record<string, () => void>;

  subscribe: (userId: string) => void;
  unsubscribe: (userId: string) => void;
  getPresence: (userId: string) => RtdbPresence | null;
  isOnline: (userId: string) => boolean;
  reset: () => void;
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  presenceMap: {},
  subscriberCounts: {},
  unsubscribes: {},

  /** Theo dõi trạng thái hiện diện */
  subscribe: (userId: string) => {
    if (!userId) return;
    const { subscriberCounts, unsubscribes } = get();
    const currentCount = subscriberCounts[userId] || 0;

    if (currentCount > 0) {
      set({ subscriberCounts: { ...subscriberCounts, [userId]: currentCount + 1 } });
      return;
    }

    const unsub = presenceService.subscribeToPresence(userId, (presence) => {
      set(state => {
        if (presence) {
          return {
            presenceMap: { ...state.presenceMap, [userId]: presence }
          };
        } else {
          const { [userId]: _, ...rest } = state.presenceMap;
          return { presenceMap: rest };
        }
      });
    });

    set({
      subscriberCounts: { ...subscriberCounts, [userId]: 1 },
      unsubscribes: { ...unsubscribes, [userId]: unsub }
    });
  },

  /** Ngừng theo dõi trạng thái hiện diện */
  unsubscribe: (userId: string) => {
    if (!userId) return;
    const { subscriberCounts, unsubscribes } = get();
    const currentCount = subscriberCounts[userId] || 0;

    if (currentCount <= 1) {
      unsubscribes[userId]?.();
      const { [userId]: _unsub, ...restUnsubs } = unsubscribes;
      const { [userId]: _count, ...restCounts } = subscriberCounts;
      set({ subscriberCounts: restCounts, unsubscribes: restUnsubs });
    } else {
      // Chỉ giảm counter
      set({ subscriberCounts: { ...subscriberCounts, [userId]: currentCount - 1 } });
    }
  },

  /** Lấy trạng thái hiện diện */
  getPresence: (userId: string) => {
    return get().presenceMap[userId] || null;
  },

  /** Kiểm tra trạng thái trực tuyến */
  isOnline: (userId: string) => {
    const presence = get().presenceMap[userId];
    return presence?.isOnline || false;
  },

  /** Đặt lại toàn bộ trạng thái */
  reset: () => {
    const { unsubscribes } = get();
    Object.values(unsubscribes).forEach(unsub => unsub());
    set({ presenceMap: {}, subscriberCounts: {}, unsubscribes: {} });
  }
}));

import { registerStore } from './storeUtils';
registerStore(() => usePresenceStore.getState().reset());
