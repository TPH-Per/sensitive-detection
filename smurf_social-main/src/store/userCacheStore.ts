import { User } from '../../shared/types';
import { PAGINATION } from '../constants';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { batchGetUsers } from '../utils/batchUtils';

interface UserCacheState {
  users: Record<string, User>;
  loadingIds: Set<string>;
  accessOrder: string[];
  
  fetchUsers: (ids: string[]) => Promise<void>;
  fetchUser: (id: string) => Promise<User | undefined>;
  getUser: (id: string) => User | undefined;
  setUser: (user: User) => void;
  invalidateUser: (id: string) => void;
  reset: () => void;
}

export const useUserCache = create<UserCacheState>()(
  persist(
    (set, get) => ({
      users: {},
      loadingIds: new Set(),
      accessOrder: [],

  // Tải thông tin user theo lô, delegate cho batchGetUsers
  fetchUsers: async (ids: string[]) => {
    if (!ids || ids.length === 0) return;

    const { users, loadingIds } = get();
    const missingIds = ids.filter(id => !users[id] && !loadingIds.has(id));
    if (missingIds.length === 0) return;

    set({ loadingIds: new Set([...loadingIds, ...missingIds]) });

    try {
      const newUsers = await batchGetUsers(missingIds);

      set({ 
        users: { ...users, ...newUsers },
        loadingIds: new Set([...loadingIds].filter(id => !missingIds.includes(id)))
      });
    } catch (error) {
      console.error('Lỗi fetch users batch:', error);
      set({ 
        loadingIds: new Set([...loadingIds].filter(id => !missingIds.includes(id)))
      });
    }
  },

  // Tải thông tin một người dùng
  fetchUser: async (id: string) => {
    const { users } = get();
    
    if (users[id]) {
      return users[id];
    }

    await get().fetchUsers([id]);
    return get().users[id];
  },

  getUser: (id: string) => {
    return get().users[id];
  },

  setUser: (user: User) => {
    const { users, accessOrder } = get();
    let newUsers = { ...users, [user.id]: user };
    
    let newOrder = accessOrder.filter(id => id !== user.id);
    newOrder.push(user.id);
    
    if (newOrder.length > PAGINATION.USER_CACHE_LIMIT) {
      const evictId = newOrder.shift()!;
      delete newUsers[evictId];
    }

    set({ users: newUsers, accessOrder: newOrder });
  },

  invalidateUser: (id: string) => {
    const { users } = get();
    const { [id]: _, ...rest } = users;
    set({ users: rest });
  },

  reset: () => {
    set({ users: {}, loadingIds: new Set(), accessOrder: [] });
  }
}), {
  name: 'smurf_user_cache',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ users: state.users }),
}));
import { registerStore } from './storeUtils';
registerStore(() => useUserCache.getState().reset());
