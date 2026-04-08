import { StateCreator } from 'zustand';
import { CommentStoreState } from './types';
import { commentService } from '../../services/commentService';
import { useReactionStore } from '../reactionStore';
import { Comment, CommentStatus } from '../../../shared/types';
import { Timestamp } from 'firebase/firestore';

export const createActionSlice: StateCreator<CommentStoreState, [], [], any> = (set, get) => ({
  createComment: async (postId, userId, content, parentId, replyToUserId, replyToId, image) => {
    const realId = commentService.generateCommentId();
    const opt: Comment = {
      id: realId, postId, authorId: userId, content, parentId: parentId || undefined,
      replyToUserId: replyToUserId || undefined, replyToId: replyToId || undefined,
      image: image || undefined, createdAt: Timestamp.now(), replyCount: 0,
      status: CommentStatus.ACTIVE, updatedAt: Timestamp.now(),
    };

    const prev = { rootComments: { ...get().rootComments }, replies: { ...get().replies } };
    if (parentId) {
      set(s => {
        const pr = s.replies[postId] || {};
        const rr = pr[parentId] || [];
        return {
          replies: { ...s.replies, [postId]: { ...pr, [parentId]: [...rr, opt] } },
          rootComments: { ...s.rootComments, [postId]: (s.rootComments[postId] || []).map(c => c.id === parentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c) }
        };
      });
    } else {
      set(s => ({ rootComments: { ...s.rootComments, [postId]: [opt, ...(s.rootComments[postId] || [])] } }));
    }

    try {
      await commentService.createComment(postId, userId, content, parentId || null, replyToUserId, replyToId, image, realId, opt.createdAt, opt.updatedAt);
      return realId;
    } catch (err) { set(prev); console.error('Lỗi thêm bình luận:', err); throw err; }
  },

  updateComment: async (postId, commentId, content, parentId, _replyToUserId, _replyToId, image) => {
    try {
      await commentService.updateComment(commentId, content, image);
      const c = parentId ? get().replies[postId]?.[parentId]?.find(r => r.id === commentId) : get().rootComments[postId]?.find(cc => cc.id === commentId);
      get().updateCommentInStore(postId, commentId, content, parentId, c?.replyToUserId, c?.replyToId, image);
    } catch (err) { console.error('Lỗi cập nhật bình luận:', err); throw err; }
  },

  deleteComment: async (postId, commentId, userId, parentId) => {
    const prev = { rootComments: { ...get().rootComments }, replies: { ...get().replies } };
    set(s => {
      if (parentId) {
        const pr = s.replies[postId] || {};
        return {
          replies: { ...s.replies, [postId]: { ...pr, [parentId]: (pr[parentId] || []).filter(c => c.id !== commentId) } },
          rootComments: { ...s.rootComments, [postId]: (s.rootComments[postId] || []).map(c => c.id === parentId ? { ...c, replyCount: Math.max(0, (c.replyCount || 0) - 1) } : c) }
        };
      }
      const pr = { ...(s.replies[postId] || {}) }; delete pr[commentId];
      return { rootComments: { ...s.rootComments, [postId]: (s.rootComments[postId] || []).filter(c => c.id !== commentId) }, replies: { ...s.replies, [postId]: pr } };
    });
    try { await commentService.deleteComment(commentId, userId, parentId || null); }
    catch (err) { set(prev); console.error('Lỗi xóa bình luận:', err); throw err; }
  },

  reactToComment: async (postId, commentId, userId, reaction) => {
    const { setOptimisticReaction, clearOptimisticReaction } = useReactionStore.getState();
    setOptimisticReaction(commentId, reaction === 'REMOVE' ? null : reaction);
    try {
      await commentService.reactToComment(commentId, userId, reaction);
      setTimeout(() => clearOptimisticReaction(commentId), 500);
    } catch (err) { console.error('Lỗi react bình luận:', err); clearOptimisticReaction(commentId); throw err; }
  },

  updateCommentInStore: (postId, commentId, content, parentId, _replyToUserId, _replyToId, image) => set(s => {
    const update = (c: Comment) => ({ ...c, content, updatedAt: Timestamp.now(), ...(image !== undefined && { image }) });
    if (!parentId) {
      return { rootComments: { ...s.rootComments, [postId]: (s.rootComments[postId] || []).map(c => c.id === commentId ? update(c) : c) } };
    }
    const pr = s.replies[postId] || {};
    return { replies: { ...s.replies, [postId]: { ...pr, [parentId]: (pr[parentId] || []).map(r => r.id === commentId ? update(r) : r) } } };
  }),

  reset: () => set({ rootComments: {}, replies: {}, lastRootDoc: {}, hasMoreRoot: {}, lastReplyDoc: {}, hasMoreReply: {}, loadingPosts: {} }),
});
