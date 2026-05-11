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
  /** Tạo bài viết mới */
  createPost: async (userId: string, content: string, media: MediaObject[], visibility: Visibility = Visibility.FRIENDS, pendingFiles?: File[]) => {
    const postId = postService.generatePostId();
    const previewMedia = pendingFiles?.map((f: File) => ({
      url: URL.createObjectURL(f),
      fileName: f.name,
      mimeType: f.type,
      size: f.size,
      isSensitive: false,
    } as MediaObject)) || [];

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
    } finally {
      previewMedia.forEach((m: MediaObject) => URL.revokeObjectURL(m.url));
    }
  },

  /** Cập nhật bài viết */
  updatePost: async (postId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => {
    const { posts, selectedPost } = get();
    const existing = posts.find(p => p.id === postId) || (selectedPost?.id === postId ? selectedPost : null);
    const authorId = existing?.authorId || '';

    const previewMedia = pendingFiles ? pendingFiles.map((f: File) => ({
      url: URL.createObjectURL(f), fileName: f.name, mimeType: f.type, size: f.size, isSensitive: false,
    } as MediaObject)) : [];

    set(state => ({
      posts: state.posts.map(p => p.id === postId ? { ...p, content, media: [...media, ...previewMedia], visibility, updatedAt: Timestamp.now() } : p),
      selectedPost: state.selectedPost && state.selectedPost.id === postId
        ? { ...state.selectedPost, content, media: [...media, ...previewMedia], visibility, updatedAt: Timestamp.now() }
        : state.selectedPost,
      uploadingStates: pendingFiles?.length ? { ...state.uploadingStates, [postId]: { progress: 0 } } : state.uploadingStates
    }));

    try {
      let finalMedia = [...media];
      if (pendingFiles?.length) {
        finalMedia = [...finalMedia, ...await postService.uploadPostMedia(pendingFiles, authorId, (progress) => {
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
          selectedPost: state.selectedPost && state.selectedPost.id === postId
            ? { ...state.selectedPost, media: finalMedia }
            : state.selectedPost
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
      previewMedia.forEach((m: MediaObject) => URL.revokeObjectURL(m.url));
    }
  },

  /** Xóa bài viết */
  deletePost: async (postId: string, userId: string) => {
    const { posts, selectedPost } = get();
    const snapshot = posts.find(p => p.id === postId) ?? null;

    set(state => ({
      posts: state.posts.filter(p => p.id !== postId),
      selectedPost: state.selectedPost?.id === postId ? null : state.selectedPost
    }));

    try {
      await postService.deletePost(postId, userId);
      toast.success(TOAST_MESSAGES.POST.DELETE_SUCCESS);
    } catch (error) {
      if (snapshot) {
        set(state => ({
          posts: [snapshot, ...state.posts],
          selectedPost: selectedPost?.id === postId ? selectedPost : state.selectedPost
        }));
      }
      console.error("Lỗi xóa bài viết:", error);
      toast.error(TOAST_MESSAGES.POST.DELETE_FAILED);
      throw error;
    }
  },

  /** Tương tác cảm xúc */
  reactToPost: async (postId: string, userId: string, reaction: ReactionType | 'REMOVE') => {
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

  /** Tải lên phương tiện */
  uploadMedia: async (files: File[], userId: string) => {
    try {
      return await postService.uploadPostMedia(files, userId);
    } catch (error) {
      console.error("Lỗi tải lên media:", error);
      throw error;
    }
  },

  /** Thiết lập bài viết đang chọn */
  setSelectedPost: (post: Post | null) => {
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

  /** Lấy bài viết theo ID */
  fetchPostById: async (postId: string, currentUserId: string, friendIds: string[]) => {
    const { selectedPost, setSelectedPost } = get();
    if (selectedPost?.id === postId) return;

    const loadingStore = useLoadingStore.getState();
    loadingStore.setLoading('post.detail', true);
    try {
      const post = await postService.getPostById(postId, currentUserId, friendIds);
      if (!post) {
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

  /** Đặt lại trạng thái bài viết */
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
