import { create } from 'zustand';
import { Comment, ReactionType, CommentStatus } from '../../shared/types';
import { DocumentSnapshot, Timestamp } from 'firebase/firestore';
import { commentService } from '../services/commentService';
import { PAGINATION } from '../constants';
import { getSafeMillis } from '../utils/timestampHelpers';

type SortOrder = 'asc' | 'desc';

const mergeOptimisticComments = (
  existing: Comment[],
  incoming: Comment[],
  sortOrder: SortOrder
): { merged: Comment[]; hasChanges: boolean } => {
  const mergedIds = new Set(incoming.map(c => c.id));
  
  const filteredExisting = existing.filter(e => !mergedIds.has(e.id));
  
  const isAllNewInExisting = incoming.every(c => existing.some(e => e.id === c.id));
  const isCountSame = existing.length === incoming.length;

  if (isAllNewInExisting && isCountSame && incoming.length > 0) {
    const hasDataChanges = incoming.some(c => {
      const e = existing.find(ex => ex.id === c.id);
      return e && (e.content !== c.content || e.replyCount !== c.replyCount || e.status !== c.status);
    });
    if (!hasDataChanges) return { merged: existing, hasChanges: false };
  }

  const merged = [...filteredExisting, ...incoming].sort((a, b) =>
    sortOrder === 'desc'
      ? getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt)
      : getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)
  );

  return { merged, hasChanges: true };
};

interface CommentState {
  rootComments: Record<string, Comment[]>;
  replies: Record<string, Record<string, Comment[]>>;
  myCommentReactions: Record<string, string>; // commentId -> reactionType

  lastRootDoc: Record<string, DocumentSnapshot | null>;
  hasMoreRoot: Record<string, boolean>;

  lastReplyDoc: Record<string, Record<string, DocumentSnapshot | null>>;
  hasMoreReply: Record<string, Record<string, boolean>>;

  loadingPosts: Record<string, boolean>;

  fetchRootComments: (postId: string, blockedUserIds?: string[], loadMore?: boolean) => Promise<void>;
  fetchReplies: (postId: string, parentId: string, blockedUserIds?: string[], loadMore?: boolean) => Promise<void>;
  subscribeToComments: (postId: string, blockedUserIds?: string[]) => () => void;
  subscribeToReplies: (postId: string, parentId: string, blockedUserIds?: string[]) => () => void;
  createComment: (postId: string, userId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: any) => Promise<string>;
  updateComment: (postId: string, commentId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: any) => Promise<void>;
  deleteComment: (postId: string, commentId: string, userId: string, parentId?: string | null) => Promise<void>;
  reactToComment: (postId: string, commentId: string, userId: string, reaction: ReactionType | 'REMOVE', parentId?: string | null) => Promise<void>;

  setRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  addRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  setReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  addReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  clearComments: (postId: string) => void;
  updateCommentInStore: (postId: string, commentId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: any) => void;
  isLoadingPost: (postId: string) => boolean;
  reset: () => void;
}

export const useCommentStore = create<CommentState>((set, get) => ({
  rootComments: {},
  replies: {},
  myCommentReactions: {},
  lastRootDoc: {},
  hasMoreRoot: {},
  lastReplyDoc: {},
  hasMoreReply: {},
  loadingPosts: {},

  isLoadingPost: (postId: string) => get().loadingPosts[postId] || false,

  reset: () => {
    set({
      rootComments: {},
      replies: {},
      myCommentReactions: {},
      lastRootDoc: {},
      hasMoreRoot: {},
      lastReplyDoc: {},
      hasMoreReply: {},
      loadingPosts: {},
    });
  },

  fetchRootComments: async (postId: string, blockedUserIds: string[] = [], loadMore = false) => {
    const { lastRootDoc, loadingPosts } = get();
    if (loadingPosts[postId]) return;

    set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: true } }));
    try {
      const lastDoc = loadMore ? lastRootDoc[postId] : undefined;
      const result = await commentService.getRootComments(postId, blockedUserIds, PAGINATION.COMMENTS, lastDoc || undefined);

      const commentIds = result.comments.map(c => c.id);
      const currentUserId = get().myCommentReactions ? Object.keys(get().myCommentReactions)[0]?.split('-')[0] : '';
      if (commentIds.length > 0 && currentUserId) {
        const myReactions = await commentService.batchLoadMyReactionsForComments(commentIds, currentUserId);
        set(state => ({
          myCommentReactions: loadMore ? { ...state.myCommentReactions, ...myReactions } : { ...state.myCommentReactions, ...myReactions }
        }));
      }

      if (loadMore) {
        get().addRootComments(postId, result.comments, result.lastDoc, result.hasMore);
      } else {
        get().setRootComments(postId, result.comments, result.lastDoc, result.hasMore);
      }
    } catch (error) {
      console.error('Lỗi tải bình luận gốc:', error);
    } finally {
      set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: false } }));
    }
  },

  fetchReplies: async (postId: string, parentId: string, blockedUserIds: string[] = [], loadMore = false) => {
    const { lastReplyDoc, loadingPosts } = get();
    if (loadingPosts[postId]) return;

    set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: true } }));
    try {
      const lastDoc = loadMore ? lastReplyDoc[postId]?.[parentId] : undefined;
      const result = await commentService.getReplies(postId, parentId, blockedUserIds, PAGINATION.REPLIES, lastDoc || undefined);

      const commentIds = result.replies.map(c => c.id);
      const currentUserId = get().myCommentReactions ? Object.keys(get().myCommentReactions)[0]?.split('-')[0] : '';
      if (commentIds.length > 0 && currentUserId) {
        const myReactions = await commentService.batchLoadMyReactionsForComments(commentIds, currentUserId);
        set(state => ({
          myCommentReactions: { ...state.myCommentReactions, ...myReactions }
        }));
      }

      if (loadMore) {
        get().addReplies(postId, parentId, result.replies, result.lastDoc, result.hasMore);
      } else {
        get().setReplies(postId, parentId, result.replies, result.lastDoc, result.hasMore);
      }
    } catch (error) {
      console.error('Lỗi tải phản hồi:', error);
    } finally {
      set(state => ({ loadingPosts: { ...state.loadingPosts, [postId]: false } }));
    }
  },

  subscribeToComments: (postId: string, blockedUserIds: string[] = []) => {
    return commentService.subscribeToComments(
      postId,
      blockedUserIds,
      (action, data) => {
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
            const existing = state.rootComments[postId] || [];
            const { merged, hasChanges } = mergeOptimisticComments(existing, comments, 'desc');
            if (!hasChanges) return state;
            return { rootComments: { ...state.rootComments, [postId]: merged } };
          }

          if (action === 'update') {
            return {
              rootComments: {
                ...state.rootComments,
                [postId]: (state.rootComments[postId] || []).map(c => {
                  const updated = comments.find(uc => uc.id === c.id);
                  return updated || c;
                })
              }
            };
          }

          if (action === 'remove') {
            const removedIds = new Set(comments.map(c => c.id));
            return {
              rootComments: {
                ...state.rootComments,
                [postId]: (state.rootComments[postId] || []).filter(c => !removedIds.has(c.id))
              }
            };
          }

          return {};
        });
      }
    );
  },

  subscribeToReplies: (postId: string, parentId: string, blockedUserIds: string[] = []) => {
    return commentService.subscribeToReplies(
      postId,
      parentId,
      blockedUserIds,
      (action, data) => {
        set(state => {
          const postReplies = state.replies[postId] || {};
          const currentReplies = postReplies[parentId] || [];

          if (action === 'initial') {
            const { replies, lastDoc, hasMore } = data as { replies: Comment[]; lastDoc: DocumentSnapshot | null; hasMore: boolean };
            return {
              replies: {
                ...state.replies,
                [postId]: { ...postReplies, [parentId]: replies }
              },
              lastReplyDoc: {
                ...state.lastReplyDoc,
                [postId]: { ...(state.lastReplyDoc[postId] || {}), [parentId]: lastDoc }
              },
              hasMoreReply: {
                ...state.hasMoreReply,
                [postId]: { ...(state.hasMoreReply[postId] || {}), [parentId]: hasMore }
              }
            };
          }

          const replies = data as Comment[];

          if (action === 'add') {
            const { merged, hasChanges } = mergeOptimisticComments(currentReplies, replies, 'asc');
            if (!hasChanges) return {};
            return {
              replies: {
                ...state.replies,
                [postId]: { ...postReplies, [parentId]: merged }
              }
            };
          }

          if (action === 'update') {
            return {
              replies: {
                ...state.replies,
                [postId]: {
                  ...postReplies,
                  [parentId]: currentReplies.map(r => {
                    const updated = replies.find(ur => ur.id === r.id);
                    return updated || r;
                  })
                }
              }
            };
          }

          if (action === 'remove') {
            const removedIds = new Set(replies.map(r => r.id));
            return {
              replies: {
                ...state.replies,
                [postId]: {
                  ...postReplies,
                  [parentId]: currentReplies.filter(r => !removedIds.has(r.id))
                }
              }
            };
          }

          return {};
        });
      }
    );
  },

  createComment: async (postId: string, userId: string, content: string, parentId?: string, replyToUserId?: string, replyToId?: string, image?: any) => {
    const realId = commentService.generateCommentId();
    const optimisticComment: Comment = {
      id: realId,
      postId,
      authorId: userId,
      content,
      parentId: parentId || undefined,
      replyToUserId: replyToUserId || undefined,
      replyToId: replyToId || undefined,
      image: image || undefined,
      createdAt: Timestamp.now(),
      replyCount: 0,
      status: CommentStatus.ACTIVE,
      updatedAt: Timestamp.now(),
    };

    const previousState = {
      rootComments: { ...get().rootComments },
      replies: { ...get().replies }
    };
    if (parentId) {
      set(state => {
        const postReplies = state.replies[postId] || {};
        const parentReplies = postReplies[parentId] || [];
        return {
          replies: {
            ...state.replies,
            [postId]: { ...postReplies, [parentId]: [...parentReplies, optimisticComment] }
          },
          rootComments: {
            ...state.rootComments,
            [postId]: (state.rootComments[postId] || []).map(c =>
              c.id === parentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c
            )
          }
        };
      });
    } else {
      set(state => ({
        rootComments: { ...state.rootComments, [postId]: [optimisticComment, ...(state.rootComments[postId] || [])] }
      }));
    }

    try {
      await commentService.createComment(postId, userId, content, parentId || null, replyToUserId, replyToId, image, realId);

      return realId;
    } catch (error) {
      set(previousState);
      console.error('Lỗi thêm bình luận:', error);
      throw error;
    }
  },

  updateComment: async (postId: string, commentId: string, content: string, parentId?: string, replyToUserId?: string, replyToId?: string, image?: any) => {
    try {
      await commentService.updateComment(commentId, content, image);
      const comment = parentId 
        ? get().replies[postId]?.[parentId]?.find(r => r.id === commentId)
        : get().rootComments[postId]?.find(c => c.id === commentId);
      get().updateCommentInStore(postId, commentId, content, parentId, comment?.replyToUserId, comment?.replyToId, image);
    } catch (error) {
      console.error('Lỗi cập nhật bình luận:', error);
      throw error;
    }
  },

  deleteComment: async (postId, commentId, userId, parentId) => {
    const previousState = {
      rootComments: { ...get().rootComments },
      replies: { ...get().replies }
    };

    set(state => {
      if (parentId) {
        const postReplies = state.replies[postId] || {};
        const parentReplies = postReplies[parentId] || [];
        return {
          replies: {
            ...state.replies,
            [postId]: { ...postReplies, [parentId]: parentReplies.filter(c => c.id !== commentId) }
          },
          rootComments: {
            ...state.rootComments,
            [postId]: (state.rootComments[postId] || []).map(c =>
              c.id === parentId ? { ...c, replyCount: Math.max(0, (c.replyCount || 0) - 1) } : c
            )
          }
        };
      } else {
        return {
          rootComments: {
            ...state.rootComments,
            [postId]: (state.rootComments[postId] || []).filter(c => c.id !== commentId)
          }
        };
      }
    });

    try {
      await commentService.deleteComment(commentId, userId, parentId || null);
    } catch (error) {
      set(previousState);
      console.error('Lỗi xóa bình luận:', error);
      throw error;
    }
  },

  reactToComment: async (postId, commentId, userId, reaction, parentId) => {
    const { rootComments, replies, myCommentReactions } = get();

    const findComment = (): Comment | undefined => parentId
      ? replies[postId]?.[parentId]?.find(c => c.id === commentId)
      : rootComments[postId]?.find(c => c.id === commentId);

    const comment = findComment();
    const prevMyReaction = myCommentReactions[commentId];
    const isRemove = prevMyReaction === reaction || reaction === 'REMOVE';

    // Update myCommentReactions
    const newMyReactions = { ...myCommentReactions };
    if (isRemove) {
      delete newMyReactions[commentId];
    } else {
      newMyReactions[commentId] = reaction;
    }

    set({ myCommentReactions: newMyReactions });

    try {
      await commentService.reactToComment(commentId, userId, reaction);
    } catch (error) {
      console.error('Lỗi bày tỏ cảm xúc:', error);
      // Rollback myCommentReactions
      set(state => ({
        myCommentReactions: { ...state.myCommentReactions, [commentId]: prevMyReaction },
      }));
    }
  },

  setRootComments: (postId, comments, lastDoc, hasMore) => set((state) => ({
    rootComments: { ...state.rootComments, [postId]: comments },
    lastRootDoc: { ...state.lastRootDoc, [postId]: lastDoc },
    hasMoreRoot: { ...state.hasMoreRoot, [postId]: hasMore }
  })),

  addRootComments: (postId, comments, lastDoc, hasMore) => set((state) => ({
    rootComments: { ...state.rootComments, [postId]: [...(state.rootComments[postId] || []), ...comments] },
    lastRootDoc: { ...state.lastRootDoc, [postId]: lastDoc },
    hasMoreRoot: { ...state.hasMoreRoot, [postId]: hasMore }
  })),

  setReplies: (postId, parentId, replies, lastDoc, hasMore) => set((state) => ({
    replies: {
      ...state.replies,
      [postId]: { ...(state.replies[postId] || {}), [parentId]: replies }
    },
    lastReplyDoc: {
      ...state.lastReplyDoc,
      [postId]: { ...(state.lastReplyDoc[postId] || {}), [parentId]: lastDoc }
    },
    hasMoreReply: {
      ...state.hasMoreReply,
      [postId]: { ...(state.hasMoreReply[postId] || {}), [parentId]: hasMore }
    }
  })),

  addReplies: (postId, parentId, replies, lastDoc, hasMore) => set((state) => ({
    replies: {
      ...state.replies,
      [postId]: {
        ...(state.replies[postId] || {}),
        [parentId]: [...(state.replies[postId]?.[parentId] || []), ...replies]
      }
    },
    lastReplyDoc: {
      ...state.lastReplyDoc,
      [postId]: { ...(state.lastReplyDoc[postId] || {}), [parentId]: lastDoc }
    },
    hasMoreReply: {
      ...state.hasMoreReply,
      [postId]: { ...(state.hasMoreReply[postId] || {}), [parentId]: hasMore }
    }
  })),

  clearComments: (postId) => set((state) => {
    const { [postId]: _root, ...newRootComments } = state.rootComments;
    const { [postId]: _replies, ...newReplies } = state.replies;
    const { [postId]: _lastRoot, ...newLastRootDoc } = state.lastRootDoc;
    const { [postId]: _hasMoreRoot, ...newHasMoreRoot } = state.hasMoreRoot;
    const { [postId]: _lastReply, ...newLastReplyDoc } = state.lastReplyDoc;
    const { [postId]: _hasMoreReply, ...newHasMoreReply } = state.hasMoreReply;
    return {
      rootComments: newRootComments,
      replies: newReplies,
      lastRootDoc: newLastRootDoc,
      hasMoreRoot: newHasMoreRoot,
      lastReplyDoc: newLastReplyDoc,
      hasMoreReply: newHasMoreReply
    };
  }),

  updateCommentInStore: (postId, commentId, content, parentId, replyToUserId, replyToId, imageUrl) => set((state) => {
    const updateObj = (c: Comment) => ({
      ...c,
      content,
      updatedAt: Timestamp.now(),
      ...(imageUrl !== undefined && { image: imageUrl })
    });

    if (!parentId) {
      const updatedRoot = (state.rootComments[postId] || []).map(c =>
        c.id === commentId ? updateObj(c) : c
      );
      return { rootComments: { ...state.rootComments, [postId]: updatedRoot } };
    } else {
      const postReplies = state.replies[postId] || {};
      const updatedReplies = (postReplies[parentId] || []).map(r =>
        r.id === commentId ? updateObj(r) : r
      );
      return {
        replies: {
          ...state.replies,
          [postId]: { ...postReplies, [parentId]: updatedReplies }
        }
      };
    }
  })
}));


