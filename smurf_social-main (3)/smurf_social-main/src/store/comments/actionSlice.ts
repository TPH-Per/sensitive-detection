import { StateCreator } from 'zustand';
import { CommentStoreState } from './types';
import { commentService } from '../../services/commentService';
import { useReactionStore } from '../reactionStore';
import { Comment, CommentStatus, MediaObject } from '../../../shared/types';
import { Timestamp } from 'firebase/firestore';
import { toast } from '../toastStore';
import { TOAST_MESSAGES } from '../../constants';

export const createActionSlice: StateCreator<CommentStoreState, [], [], any> = (set, get) => ({
  /** Tạo bình luận mới */
  createComment: async (postId, userId, content, parentId, replyToUserId, replyToId, image) => {
    const realId = commentService.generateCommentId();
    
    let previewUrl = '';
    if (image instanceof File) {
      previewUrl = URL.createObjectURL(image);
    }

    const opt: Comment = {
      id: realId, postId, authorId: userId, content, parentId: parentId || undefined,
      replyToUserId: replyToUserId || undefined, replyToId: replyToId || undefined,
      image: image instanceof File 
        ? { url: previewUrl, fileName: image.name, mimeType: image.type, size: image.size, isSensitive: false } as MediaObject
        : image || undefined, 
      createdAt: Timestamp.now(), replyCount: 0,
      status: CommentStatus.ACTIVE, updatedAt: Timestamp.now(),
    };

    set(s => {
      const sortOrder = s.rootSortOrder[postId] || 'desc';
      const currentRoot = s.rootComments[postId] || [];
      const newRoot = !parentId 
        ? (sortOrder === 'desc' ? [opt, ...currentRoot] : [...currentRoot, opt])
        : currentRoot;

      return {
        rootComments: { ...s.rootComments, [postId]: newRoot },
        replies: parentId
          ? { 
              ...s.replies, 
              [postId]: { 
                ...(s.replies[postId] || {}), 
                [parentId]: [...((s.replies[postId] || {})[parentId] || []), opt] 
              } 
            }
          : s.replies,
        uploadingStates: { ...s.uploadingStates, [realId]: { progress: 0 } }
      };
    });

    if (!parentId) {
    } else {
      set(s => ({
        rootComments: { 
          ...s.rootComments, 
          [postId]: (s.rootComments[postId] || []).map(c => c.id === parentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c) 
        }
      }));
    }

    try {
      let finalImage = image instanceof File ? undefined : image;
      
      if (image instanceof File) {
        finalImage = await commentService.uploadCommentImage(image, userId, (progress) => {
          set(state => ({
            uploadingStates: { ...state.uploadingStates, [realId]: { ...state.uploadingStates[realId], progress } }
          }));
        });
      }

      await commentService.createComment(
        postId, userId, content, parentId || null, 
        replyToUserId, replyToId, finalImage, realId, 
        opt.createdAt as any, opt.updatedAt as any
      );

      set(state => {
        const { [realId]: _, ...newStates } = state.uploadingStates;
        return { uploadingStates: newStates };
      });
      
      return realId;
    } catch (err: any) {
      console.error('Lỗi thêm bình luận:', err);
      const msg = err?.message || 'Lỗi tải lên';
      set(state => {
        const root = state.rootComments[postId] || [];
        const nextRoot = parentId 
          ? root.map(c => c.id === parentId ? { ...c, replyCount: Math.max(0, (c.replyCount || 0) - 1) } : c)
          : root.filter(c => c.id !== realId);

        const nextReplies = { ...state.replies };
        if (parentId && nextReplies[postId]?.[parentId]) {
          nextReplies[postId] = {
            ...nextReplies[postId],
            [parentId]: nextReplies[postId][parentId].filter(c => c.id !== realId)
          };
        }

        return {
          rootComments: { ...state.rootComments, [postId]: nextRoot },
          replies: nextReplies,
          uploadingStates: { ...state.uploadingStates, [realId]: { ...state.uploadingStates[realId], error: msg } }
        };
      });
      toast.error(TOAST_MESSAGES.COMMENT.CREATE_FAILED());
      throw err;
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    }
  },

  /** Cập nhật bình luận */
  updateComment: async (postId, commentId, content, parentId, _replyToUserId, _replyToId, image) => {
    try {
      let finalImage = image instanceof File ? undefined : image;
      let previewUrl = '';

      if (image instanceof File) {
        previewUrl = URL.createObjectURL(image);
        const tempImage = { url: previewUrl, fileName: image.name, mimeType: image.type, size: image.size, isSensitive: false } as MediaObject;
        get().updateCommentInStore(postId, commentId, content, parentId || undefined, _replyToUserId, _replyToId, tempImage);
        
        set(state => ({
          uploadingStates: { ...state.uploadingStates, [commentId]: { progress: 0 } }
        }));

        finalImage = await commentService.uploadCommentImage(image, get().rootComments[postId]?.[0]?.authorId || '', (progress) => {
          set(state => ({
            uploadingStates: { ...state.uploadingStates, [commentId]: { ...state.uploadingStates[commentId], progress } }
          }));
        });
      }

      await commentService.updateComment(commentId, content, finalImage);
      get().updateCommentInStore(postId, commentId, content, parentId || undefined, _replyToUserId, _replyToId, finalImage || undefined);
      
      set(state => {
        const { [commentId]: _, ...newStates } = state.uploadingStates;
        return { uploadingStates: newStates };
      });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } catch (err: any) {
      console.error('Lỗi cập nhật bình luận:', err);
      const msg = err?.message || 'Lỗi tải lên';
      set(state => ({
        uploadingStates: { ...state.uploadingStates, [commentId]: { ...state.uploadingStates[commentId], error: msg } }
      }));
      toast.error(TOAST_MESSAGES.COMMENT.UPDATE_FAILED());
      throw err;
    }
  },

  /** Xóa bình luận */
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

  /** Tương tác cảm xúc */
  reactToComment: async (postId, commentId, userId, reaction) => {
    const { setOptimisticReaction, clearOptimisticReaction } = useReactionStore.getState();
    setOptimisticReaction(commentId, reaction === 'REMOVE' ? null : reaction);
    try {
      await commentService.reactToComment(commentId, userId, reaction);
      setTimeout(() => clearOptimisticReaction(commentId), 500);
    } catch (err) { console.error('Lỗi react bình luận:', err); clearOptimisticReaction(commentId); throw err; }
  },

  /** Cập nhật bình luận trong store */
  updateCommentInStore: (postId, commentId, content, parentId, _replyToUserId, _replyToId, image) => set(s => {
    const update = (c: Comment) => ({ ...c, content, updatedAt: Timestamp.now(), ...(image !== undefined && { image }) });
    if (!parentId) {
      return { rootComments: { ...s.rootComments, [postId]: (s.rootComments[postId] || []).map(c => c.id === commentId ? update(c) : c) } };
    }
    const pr = s.replies[postId] || {};
    return { replies: { ...s.replies, [postId]: { ...pr, [parentId]: (pr[parentId] || []).map(r => r.id === commentId ? update(r) : r) } } };
  }),

  /** Đặt lại trạng thái bình luận */
  reset: () => set({ 
    rootComments: {}, 
    replies: {}, 
    lastRootDoc: {}, 
    hasMoreRoot: {}, 
    lastReplyDoc: {}, 
    hasMoreReply: {}, 
    loadingPosts: {}, 
    uploadingStates: {},
    rootSortOrder: {}
  }),
});
