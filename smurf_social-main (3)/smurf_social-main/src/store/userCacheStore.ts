import { User } from '../../shared/types';
import { PAGINATION } from '../constants';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { batchGetUsers } from '../utils/batchUtils';

interface UserCache extends User {
  _accessCount?: number;
  _lastAccessed?: number;
  _cachedAt?: number;
}

interface UserCacheState {
  users: Record<string, UserCache>;
  loadingIds: string[];
  accessOrder: string[];
  pendingFetches: Map<string, Promise<Record<string, UserCache>>>;
  
  fetchUsers: (ids: string[]) => Promise<void>;
  fetchUser: (id: string) => Promise<User | undefined>;
  getUser: (id: string) => User | undefined;
  setUser: (user: User) => void;
  updateUser: (user: User) => void;
  invalidateUser: (id: string) => void;
  _updateAccess: (id: string) => void;
  reset: () => void;
}

const STALE_TIME = 1000 * 60 * 60; // 1 giờ

export const useUserCache = create<UserCacheState>()(
  persist(
    (set, get) => ({
      users: {},
      loadingIds: [],
      accessOrder: [],
      pendingFetches: new Map(),

  /** Cập nhật thứ tự truy cập LRU */
  _updateAccess: (id: string) => {
    const { accessOrder, users } = get();
    const newOrder = accessOrder.filter(oid => oid !== id);
    newOrder.push(id);
    
    if (newOrder.length > PAGINATION.USER_CACHE_LIMIT) {
      const evictId = newOrder.shift();
      if (evictId) {
        const { [evictId]: _, ...restUsers } = users;
        set({ users: restUsers, accessOrder: newOrder });
      }
    } else {
      set({ accessOrder: newOrder });
    }
  },

    /** Tải danh sách người dùng theo lô */
    fetchUsers: async (ids: string[]) => {
      const { users, pendingFetches } = get();
      const now = Date.now();
      const targetIds = ids.filter(id => {
        const cachedUser = users[id];
        const isPending = pendingFetches.has(id);
        const isStale = cachedUser && (!cachedUser._cachedAt || now - cachedUser._cachedAt > STALE_TIME);
        
        return (!cachedUser || isStale) && !isPending;
      });

      if (targetIds.length === 0) return;

      set(state => ({ loadingIds: [...state.loadingIds, ...targetIds] }));

      const fetchPromise = batchGetUsers(targetIds).then(newUsers => {
        const usersWithTimestamp = Object.entries(newUsers).reduce((acc, [id, user]) => {
          acc[id] = { ...user, _cachedAt: Date.now() };
          return acc;
        }, {} as Record<string, UserCache>);

        set(state => ({
          users: { ...state.users, ...usersWithTimestamp },
          loadingIds: state.loadingIds.filter(id => !targetIds.includes(id))
        }));
        
        const { pendingFetches: currentPending } = get();
        targetIds.forEach(id => currentPending.delete(id));
        return usersWithTimestamp;
      }).catch(err => {
        set(state => ({
          loadingIds: state.loadingIds.filter(id => !targetIds.includes(id))
        }));
        const { pendingFetches: currentPending } = get();
        targetIds.forEach(id => currentPending.delete(id));
        throw err;
      });

      targetIds.forEach(id => pendingFetches.set(id, fetchPromise));
      await fetchPromise;
    },

  /** Tải thông tin một người dùng */
  fetchUser: async (id: string) => {
    const { users, _updateAccess, fetchUsers } = get();
    if (users[id]) {
      _updateAccess(id);
      return users[id];
    }

    await fetchUsers([id]);
    const updatedUser = get().users[id];
    if (updatedUser) _updateAccess(id);
    return updatedUser;
  },

  /** Lấy người dùng từ bộ nhớ đệm */
  getUser: (id: string) => {
    return get().users[id];
  },

  /** Lưu người dùng vào bộ nhớ đệm */
  setUser: (user: User) => {
    if (!user?.id) return;
    const userWithTimestamp = { ...user, _cachedAt: Date.now() };
    set(state => ({ users: { ...state.users, [user.id]: userWithTimestamp } }));
    get()._updateAccess(user.id);
  },

  /** Cập nhật thông tin người dùng */
  updateUser: (user: User) => {
    if (!user?.id) return;
    const { users } = get();
    
    const existingUser = users[user.id] || {};
    const updatedUser = { ...existingUser, ...user, _cachedAt: Date.now() };
    
    set(state => ({
      users: { ...state.users, [user.id]: updatedUser }
    }));
  },

  /** Xóa người dùng khỏi bộ nhớ đệm */
  invalidateUser: (id: string) => {
    set(state => {
      const { [id]: _, ...rest } = state.users;
      return { 
        users: rest, 
        accessOrder: state.accessOrder.filter(oid => oid !== id) 
      };
    });
  },

  /** Đặt lại bộ nhớ đệm */
  reset: () => {
    set({ users: {}, loadingIds: [], accessOrder: [] });
  }
}), {
  name: 'smurf_user_cache',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({ 
    users: state.users,
    accessOrder: state.accessOrder 
  }),
}));

import { registerStore } from './storeUtils';
registerStore(() => useUserCache.getState().reset());
