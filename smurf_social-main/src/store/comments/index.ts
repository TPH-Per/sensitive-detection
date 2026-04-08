import { create } from 'zustand';
import { CommentStoreState } from './types';
import { createFetchSlice } from './fetchSlice';
import { createActionSlice } from './actionSlice';
import { registerStore } from '../storeUtils';

export const useCommentStore = create<CommentStoreState>()((...a) => ({
  ...createFetchSlice(...a),
  ...createActionSlice(...a),
}));

// Đăng ký reset tự động
registerStore(() => useCommentStore.getState().reset());
