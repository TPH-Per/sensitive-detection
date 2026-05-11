import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PostStoreState } from './types';
import { createFetchSlice } from './fetchSlice';
import { createActionSlice } from './actionSlice';
import { PAGINATION } from '../../constants';
import { registerStore } from '../storeUtils';

export const usePostStore = create<PostStoreState>()(
  persist(
    (...a) => ({
      ...createFetchSlice(...a),
      ...createActionSlice(...a),
    }),
    {
      name: 'smurf_feed_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        posts: state.posts.slice(0, PAGINATION.FEED_CACHE_LIMIT),
        lastFetchTime: state.lastFetchTime
      }),
    }
  )
);

// Đăng ký reset tự động
registerStore(() => usePostStore.getState().reset());
