import { StateCreator } from 'zustand';
import { CommentStoreState } from './types';
import { commentService } from '../../services/commentService';
import { PAGINATION } from '../../constants';
import { Comment } from '../../../shared/types';
import { DocumentSnapshot } from 'firebase/firestore';
import { getSafeMillis } from '../../utils/timestampHelpers';

const mergeOptimisticComments = (existing: Comment[], incoming: Comment[], sortOrder: 'asc' | 'desc') => {
  const mergedIds = new Set(incoming.map(c => c.id));
  const filteredExisting = existing.filter(e => !mergedIds.has(e.id));
  return [...filteredExisting, ...incoming].sort((a, b) =>
    sortOrder === 'desc' ? getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt) : getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)
  );
};

export const createFetchSlice: StateCreator<CommentStoreState, [], [], any> = (set, get) => ({
  rootComments: {},
  replies: {},
  lastRootDoc: {},
  hasMoreRoot: {},
  lastReplyDoc: {},
  hasMoreReply: {},
  loadingPosts: {},
  uploadingStates: {},
  rootSortOrder: {},

  /** Kiểm tra trạng thái tải bài viết */
  isLoadingPost: (postId: string) => get().loadingPosts[postId] || false,

  /** Lấy bình luận gốc đã lọc */
  getFilteredRootComments: (postId: string, _postOwnerId: string, _currentUserId: string, _friendIds: string[]) => {
    const comments = get().rootComments[postId] || [];
    return { visibleComments: comments, hiddenCount: 0 };
  },

  /** Lấy phản hồi đã lọc */
  getFilteredReplies: (postId: string, parentId: string, _postOwnerId: string, _currentUserId: string, _friendIds: string[]) => {
    const postReplies = get().replies[postId] || {};
    const replies = postReplies[parentId] || [];
    return { visibleReplies: replies, hiddenCount: 0 };
  },

  /** Tải bình luận gốc */
  fetchRootComments: async (postId: string, hiddenActivityUserIds: string[] = [], loadMore = false) => {
    if (get().loadingPosts[postId]) return;
    set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: true } }));
    try {
      const sortOrder = get().rootSortOrder[postId] || 'desc';
      const lastDoc = loadMore ? get().lastRootDoc[postId] : undefined;
      const result = await commentService.getRootComments(postId, hiddenActivityUserIds, PAGINATION.COMMENTS, lastDoc || undefined, sortOrder);
      if (loadMore) get().addRootComments(postId, result.comments, result.lastDoc, result.hasMore);
      else get().setRootComments(postId, result.comments, result.lastDoc, result.hasMore);
    } catch (err) { console.error('Lỗi tải bình luận gốc:', err); }
    finally { set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: false } })); }
  },

  /** Tải phản hồi */
  fetchReplies: async (postId: string, parentId: string, hiddenActivityUserIds: string[] = [], loadMore = false) => {
    if (get().loadingPosts[postId]) return;
    set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: true } }));
    try {
      const lastDoc = loadMore ? get().lastReplyDoc[postId]?.[parentId] : undefined;
      const result = await commentService.getReplies(postId, parentId, hiddenActivityUserIds, PAGINATION.REPLIES, lastDoc || undefined);
      if (loadMore) get().addReplies(postId, parentId, result.replies, result.lastDoc, result.hasMore);
      else get().setReplies(postId, parentId, result.replies, result.lastDoc, result.hasMore);
    } catch (err) { console.error('Lỗi tải phản hồi:', err); }
    finally { set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: false } })); }
  },

  /** Theo dõi bình luận */
  subscribeToComments: (postId: string, hiddenActivityUserIds: string[] = []) => {
    const sortOrder = get().rootSortOrder[postId] || 'desc';
    return commentService.subscribeToComments(postId, hiddenActivityUserIds, (action, data) => {
      set(state => {
        if (action === 'initial') {
          const { comments, lastDoc, hasMore } = data as { comments: Comment[]; lastDoc: DocumentSnapshot | null; hasMore: boolean };
          return {
            rootComments: { ...state.rootComments, [postId]: comments },
            lastRootDoc: { ...state.lastRootDoc, [postId]: lastDoc },
            hasMoreRoot: { ...state.hasMoreRoot, [postId]: hasMore }
          };
        }
        const comments = data as Comment[];
        if (action === 'add') {
          const merged = mergeOptimisticComments(state.rootComments[postId] || [], comments, sortOrder);
          return { rootComments: { ...state.rootComments, [postId]: merged } };
        }
        if (action === 'update') {
          return {
            rootComments: {
              ...state.rootComments,
              [postId]: (state.rootComments[postId] || []).map(c => {
                const serverVersion = comments.find(uc => uc.id === c.id);
                if (!serverVersion) return c;
                return { ...serverVersion, replyCount: Math.max(serverVersion.replyCount || 0, c.replyCount || 0) };
              })
            }
          };
        }
        if (action === 'remove') {
          const removedIds = new Set(comments.map(c => c.id));
          return { rootComments: { ...state.rootComments, [postId]: (state.rootComments[postId] || []).filter(c => !removedIds.has(c.id)) } };
        }
        return {};
      });
    }, PAGINATION.COMMENTS, sortOrder);
  },

  /** Theo dõi phản hồi */
  subscribeToReplies: (postId: string, parentId: string, hiddenActivityUserIds: string[] = []) => {
    return commentService.subscribeToReplies(postId, parentId, hiddenActivityUserIds, (action, data) => {
      set(state => {
        const postReplies = state.replies[postId] || {};
        const currentReplies = postReplies[parentId] || [];
        if (action === 'initial') {
          const { replies, lastDoc, hasMore } = data as { replies: Comment[]; lastDoc: DocumentSnapshot | null; hasMore: boolean };
          return {
            replies: { ...state.replies, [postId]: { ...postReplies, [parentId]: replies } },
            lastReplyDoc: { ...state.lastReplyDoc, [postId]: { ...(state.lastReplyDoc[postId] || {}), [parentId]: lastDoc } },
            hasMoreReply: { ...state.hasMoreReply, [postId]: { ...(state.hasMoreReply[postId] || {}), [parentId]: hasMore } }
          };
        }
        const replies = data as Comment[];
        if (action === 'add') {
          const merged = mergeOptimisticComments(currentReplies, replies, 'asc');
          return { replies: { ...state.replies, [postId]: { ...postReplies, [parentId]: merged } } };
        }
        if (action === 'update') {
          return { replies: { ...state.replies, [postId]: { ...postReplies, [parentId]: currentReplies.map(r => replies.find(ur => ur.id === r.id) || r) } } };
        }
        if (action === 'remove') {
          const removedIds = new Set(replies.map(r => r.id));
          return { replies: { ...state.replies, [postId]: { ...postReplies, [parentId]: currentReplies.filter(r => !removedIds.has(r.id)) } } };
        }
        return {};
      });
    });
  },

  /** Thiết lập bình luận gốc */
  setRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => set(s => ({
    rootComments: { ...s.rootComments, [postId]: comments },
    lastRootDoc: { ...s.lastRootDoc, [postId]: lastDoc },
    hasMoreRoot: { ...s.hasMoreRoot, [postId]: hasMore }
  })),

  /** Thêm bình luận gốc */
  addRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => set(s => ({
    rootComments: { ...s.rootComments, [postId]: [...(s.rootComments[postId] || []), ...comments] },
    lastRootDoc: { ...s.lastRootDoc, [postId]: lastDoc },
    hasMoreRoot: { ...s.hasMoreRoot, [postId]: hasMore }
  })),

  /** Thiết lập phản hồi */
  setReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => set(s => ({
    replies: { ...s.replies, [postId]: { ...(s.replies[postId] || {}), [parentId]: replies } },
    lastReplyDoc: { ...s.lastReplyDoc, [postId]: { ...(s.lastReplyDoc[postId] || {}), [parentId]: lastDoc } },
    hasMoreReply: { ...s.hasMoreReply, [postId]: { ...(s.hasMoreReply[postId] || {}), [parentId]: hasMore } }
  })),

  /** Thêm phản hồi */
  addReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => set(s => ({
    replies: { ...s.replies, [postId]: { ...(s.replies[postId] || {}), [parentId]: [...(s.replies[postId]?.[parentId] || []), ...replies] } },
    lastReplyDoc: { ...s.lastReplyDoc, [postId]: { ...(s.lastReplyDoc[postId] || {}), [parentId]: lastDoc } },
    hasMoreReply: { ...s.hasMoreReply, [postId]: { ...(s.hasMoreReply[postId] || {}), [parentId]: hasMore } }
  })),

  /** Thiết lập thứ tự sắp xếp */
  setRootSortOrder: (postId: string, order: 'asc' | 'desc') => {
    set(s => ({
      rootSortOrder: { ...s.rootSortOrder, [postId]: order },
      rootComments: { ...s.rootComments, [postId]: [] },
      lastRootDoc: { ...s.lastRootDoc, [postId]: null },
      hasMoreRoot: { ...s.hasMoreRoot, [postId]: false }
    }));
  },

  /** Xóa bình luận bài viết */
  clearComments: (postId: string) => set(s => {
    const { [postId]: _r, ...rootComments } = s.rootComments;
    const { [postId]: _re, ...replies } = s.replies;
    const { [postId]: _lr, ...lastRootDoc } = s.lastRootDoc;
    const { [postId]: _hr, ...hasMoreRoot } = s.hasMoreRoot;
    const { [postId]: _lre, ...lastReplyDoc } = s.lastReplyDoc;
    const { [postId]: _hre, ...hasMoreReply } = s.hasMoreReply;
    return { rootComments, replies, lastRootDoc, hasMoreRoot, lastReplyDoc, hasMoreReply };
  }),
});
