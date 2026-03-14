import { create } from 'zustand';
import { presenceService } from '../services/presenceService';
import { RtdbPresence } from '../types';

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

  subscribe: (userId: string) => {
    if (!userId) return;
    const { subscriberCounts, unsubscribes } = get();
    const currentCount = subscriberCounts[userId] || 0;

    // Nếu đã subscribe rồi, chỉ tăng counter
    if (currentCount > 0) {
      set({ subscriberCounts: { ...subscriberCounts, [userId]: currentCount + 1 } });
      return;
    }

    // Subscribe mới
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

  unsubscribe: (userId: string) => {
    if (!userId) return;
    const { subscriberCounts, unsubscribes } = get();
    const currentCount = subscriberCounts[userId] || 0;

    if (currentCount <= 1) {
      // Unsubscribe hoàn toàn
      unsubscribes[userId]?.();
      const { [userId]: _unsub, ...restUnsubs } = unsubscribes;
      const { [userId]: _count, ...restCounts } = subscriberCounts;
      set({ subscriberCounts: restCounts, unsubscribes: restUnsubs });
    } else {
      // Chỉ giảm counter
      set({ subscriberCounts: { ...subscriberCounts, [userId]: currentCount - 1 } });
    }
  },

  getPresence: (userId: string) => {
    return get().presenceMap[userId] || null;
  },

  isOnline: (userId: string) => {
    const presence = get().presenceMap[userId];
    return presence?.isOnline || false;
  },

  reset: () => {
    const { unsubscribes } = get();
    Object.values(unsubscribes).forEach(unsub => unsub());
    set({ presenceMap: {}, subscriberCounts: {}, unsubscribes: {} });
  }
}));
