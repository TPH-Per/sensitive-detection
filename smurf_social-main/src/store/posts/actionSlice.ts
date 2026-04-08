import { StateCreator } from 'zustand';
import { PostStoreState } from './types';
import { postService } from '../../services/postService';
import { toast } from '../toastStore';
import { TOAST_MESSAGES } from '../../constants';
import { Post, PostType, MediaObject, Visibility, PostStatus, ReactionType } from '../../../shared/types';
import { Timestamp, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useLoadingStore } from '../loadingStore';
import { useReactionStore } from '../reactionStore';
import { convertDoc } from '../../utils/firebaseUtils';

export const createActionSlice: StateCreator<PostStoreState, [], [], any> = (set, get) => ({
  createPost: async (userId, content, media, visibility = Visibility.FRIENDS, pendingFiles, onProgress) => {
    const postId = postService.generatePostId();
    const previewMedia = pendingFiles ? pendingFiles.map(f => ({
      url: URL.createObjectURL(f),
      fileName: f.name,
      mimeType: f.type,
      size: f.size,
      isSensitive: false,
    } as MediaObject)) : [];

    const tempPost: Post = {
      id: postId, authorId: userId, type: PostType.REGULAR, content,
      media: [...media, ...previewMedia], visibility, commentCount: 0,
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(), status: PostStatus.ACTIVE,
    };

    set(state => ({
      posts: [tempPost, ...state.posts],
      uploadingStates: { ...state.uploadingStates, [postId]: { progress: 0 } }
    }));

    try {
      let finalMedia = [...media];
      if (pendingFiles?.length) {
        finalMedia = [...finalMedia, ...await postService.uploadPostMedia(pendingFiles, userId, (progress) => {
          onProgress?.(progress);
          set(state => ({
            uploadingStates: { ...state.uploadingStates, [postId]: { ...state.uploadingStates[postId], progress } }
          }));
        })];
      }

      await postService.createPost({
        authorId: userId, type: PostType.REGULAR, content,
        media: finalMedia, visibility, createdAt: tempPost.createdAt as any, updatedAt: tempPost.updatedAt as any
      }, postId);

      set(state => {
        const { [postId]: _, ...newStates } = state.uploadingStates;
        return {
          uploadingStates: newStates,
          posts: state.posts.map(p => p.id === postId ? { ...p, media: finalMedia } : p)
        };
      });
      toast.success(TOAST_MESSAGES.POST.CREATE_SUCCESS);
    } catch (error: any) {
      console.error("[postStore] Lỗi đăng bài:", error);
      const msg = error?.message || 'Lỗi không xác định';
      set(state => ({
        posts: state.posts.filter(p => p.id !== postId),
        uploadingStates: { ...state.uploadingStates, [postId]: { ...state.uploadingStates[postId], error: msg } }
      }));
      toast.error(TOAST_MESSAGES.POST.CREATE_FAILED(msg));
      throw error;
    } finally {
      previewMedia.forEach(m => URL.revokeObjectURL(m.url));
    }
  },

  updatePost: async (postId, content, media, visibility, pendingFiles, onProgress) => {
    const { posts, selectedPost } = get();
    const existing = posts.find(p => p.id === postId) || (selectedPost?.id === postId ? selectedPost : null);
    const authorId = existing?.authorId || '';

    const previewMedia = pendingFiles ? pendingFiles.map(f => ({
      url: URL.createObjectURL(f), fileName: f.name, mimeType: f.type, size: f.size, isSensitive: false,
    } as MediaObject)) : [];

    set(state => ({
      posts: state.posts.map(p => p.id === postId ? { ...p, content, media: [...media, ...previewMedia], visibility, updatedAt: Timestamp.now() } : p),
      selectedPost: state.selectedPost?.id === postId ? { ...state.selectedPost, content, media: [...media, ...previewMedia], visibility, updatedAt: Timestamp.now() } : state.selectedPost,
      uploadingStates: pendingFiles?.length ? { ...state.uploadingStates, [postId]: { progress: 0 } } : state.uploadingStates
    }));

    try {
      let finalMedia = [...media];
      if (pendingFiles?.length) {
        finalMedia = [...finalMedia, ...await postService.uploadPostMedia(pendingFiles, authorId, (progress) => {
          onProgress?.(progress);
          set(state => ({
            uploadingStates: { ...state.uploadingStates, [postId]: { ...state.uploadingStates[postId], progress } }
          }));
        })];
      }

      await postService.updatePost(postId, content, finalMedia, visibility);
      set(state => {
        const { [postId]: _, ...newStates } = state.uploadingStates;
        return {
          uploadingStates: newStates,
          posts: state.posts.map(p => p.id === postId ? { ...p, media: finalMedia } : p),
          selectedPost: state.selectedPost?.id === postId ? { ...state.selectedPost, media: finalMedia } : state.selectedPost
        };
      });
      toast.success(TOAST_MESSAGES.POST.UPDATE_SUCCESS);
    } catch (error: any) {
      console.error("Lỗi cập nhật bài viết:", error);
      const msg = error?.message || 'Lỗi tải lên';
      if (existing) {
        set(state => ({
          posts: state.posts.map(p => p.id === postId ? existing : p),
          selectedPost: state.selectedPost?.id === postId ? existing : state.selectedPost,
          uploadingStates: { ...state.uploadingStates, [postId]: { ...state.uploadingStates[postId], error: msg } }
        }));
      }
      toast.error(TOAST_MESSAGES.POST.UPDATE_FAILED(msg));
    } finally {
      previewMedia.forEach(m => URL.revokeObjectURL(m.url));
    }
  },

  deletePost: async (postId, userId) => {
    try {
      await postService.deletePost(postId, userId);
      set(state => ({ posts: state.posts.filter(p => p.id !== postId) }));
      toast.success(TOAST_MESSAGES.POST.DELETE_SUCCESS);
    } catch (error) {
      console.error("Lỗi xóa bài viết:", error);
      toast.error(TOAST_MESSAGES.POST.DELETE_FAILED);
      throw error;
    }
  },

  reactToPost: async (postId, userId, reaction) => {
    const { setOptimisticReaction, clearOptimisticReaction } = useReactionStore.getState();
    setOptimisticReaction(postId, reaction === 'REMOVE' ? null : reaction);
    try {
      await postService.reactToPost(postId, userId, reaction);
      setTimeout(() => clearOptimisticReaction(postId), 500);
    } catch (error) {
      console.error("Lỗi react bài viết:", error);
      clearOptimisticReaction(postId);
      throw error;
    }
  },

  uploadMedia: async (files, userId) => {
    try {
      return await postService.uploadPostMedia(files, userId);
    } catch (error) {
      console.error("Lỗi tải lên media:", error);
      throw error;
    }
  },

  setSelectedPost: (post) => {
    const { selectedPost, selectedPostUnsubscribe } = get();
    if (post?.id === selectedPost?.id && !!selectedPostUnsubscribe === !!post) return;

    if (selectedPostUnsubscribe) {
      try { selectedPostUnsubscribe(); } catch (e) { console.warn("[PostStore] Lỗi hủy listener:", e); }
    }

    if (post) {
      const unsubscribe = onSnapshot(doc(db, 'posts', post.id), (postDoc) => {
        if (postDoc.exists()) {
          const updated = convertDoc<Post>(postDoc);
          set(state => ({
            selectedPost: state.selectedPost?.id === post.id ? updated : state.selectedPost,
            posts: state.posts.map(p => p.id === post.id ? updated : p)
          }));
        } else {
          set({ selectedPost: null, selectedPostUnsubscribe: null });
        }
      }, (err) => {
        if (err.code !== 'permission-denied') console.error("[PostStore] Lỗi listener bài viết:", err);
        set({ selectedPost: null, selectedPostUnsubscribe: null });
      });
      set({ selectedPost: post, selectedPostUnsubscribe: unsubscribe });
    } else {
      set({ selectedPost: null, selectedPostUnsubscribe: null });
    }
  },

  fetchPostById: async (postId, currentUserId, friendIds) => {
    const { selectedPost, setSelectedPost } = get();
    if (selectedPost?.id === postId) return;

    const loadingStore = useLoadingStore.getState();
    loadingStore.setLoading('post.detail', true);
    try {
      const post = await postService.getPostById(postId, currentUserId, friendIds);
      if (!post) {
        toast.info('Bài viết này đã bị xóa hoặc không còn tồn tại');
        setSelectedPost(null);
        return;
      }
      setSelectedPost(post);
    } catch (error) {
      console.error("[PostStore] Lỗi lấy chi tiết bài viết:", error);
      toast.error('Không thể tải bài viết');
      setSelectedPost(null);
    } finally {
      loadingStore.setLoading('post.detail', false);
    }
  },

  reset: () => {
    const { abortController, selectedPostUnsubscribe } = get();
    if (abortController) abortController.abort();
    if (selectedPostUnsubscribe) selectedPostUnsubscribe();

    set({
      posts: [], hasMore: true, lastDoc: null, abortController: null,
      isError: false, selectedPost: null, uploadingStates: {},
      lastFetchTime: null, selectedPostUnsubscribe: null
    });
  },
});
