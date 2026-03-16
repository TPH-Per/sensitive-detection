import { Post, Visibility, PostStatus, ReactionType, MediaObject, PostType } from '../../shared/types';
import { postService } from '../services/postService';
import { DocumentSnapshot, Timestamp, onSnapshot, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { toast } from './toastStore';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TOAST_MESSAGES, PAGINATION } from '../constants';
import { getSafeMillis } from '../utils/timestampHelpers';
import { convertDoc } from '../utils/firebaseUtils';
import { useLoadingStore } from './loadingStore';

// Xóa convertDocToPost cũ vì đã có convertDoc từ utils

interface PostState {
  posts: Post[];
  myPostReactions: Record<string, string>;
  hasMore: boolean;
  lastDoc: DocumentSnapshot | null;
  abortController: AbortController | null;
  uploadingStates: Record<string, { progress: number; error?: string }>;
  isError: boolean;
  lastFetchTime: number | null;
  selectedPostUnsubscribe: (() => void) | null;

  fetchPosts: (currentUserId: string, loadMore?: boolean, force?: boolean) => Promise<void>;
  subscribeToPosts: (currentUserId: string) => () => void;
  refreshFeed: (currentUserId: string) => Promise<void>;
  createPost: (userId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => Promise<void>;
  updatePost: (postId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => Promise<void>;
  deletePost: (postId: string, userId: string, images?: string[], videos?: string[]) => Promise<void>;
  reactToPost: (postId: string, userId: string, reaction: ReactionType | 'REMOVE') => Promise<void>;
  uploadMedia: (files: File[], userId: string) => Promise<MediaObject[]>;

  clearPosts: () => void;
  filterPostsByAuthor: (authorId: string) => void;

  selectedPost: Post | null;
  setSelectedPost: (post: Post | null) => void;
  fetchPostById: (postId: string, currentUserId: string, friendIds: string[]) => Promise<void>;
  reset: () => void;
}

export const usePostStore = create<PostState>()(
  persist(
    (set, get) => ({
      posts: [],
      myPostReactions: {},
      hasMore: true,
      lastDoc: null,
      abortController: null,
      isError: false,
      uploadingStates: {},
      selectedPost: null,
      lastFetchTime: null,
      selectedPostUnsubscribe: null,

      reset: () => {
        const { abortController, selectedPostUnsubscribe } = get();
        if (abortController) abortController.abort();
        if (selectedPostUnsubscribe) selectedPostUnsubscribe();

        set({
          posts: [],
          myPostReactions: {},
          hasMore: true,
          lastDoc: null,
          abortController: null,
          isError: false,
          selectedPost: null,
          uploadingStates: {},
          lastFetchTime: null,
          selectedPostUnsubscribe: null
        });
      },

      fetchPosts: async (currentUserId: string, loadMore = false, force = false) => {
        const { abortController: currentController, posts, lastFetchTime } = get();
        const loadingStore = useLoadingStore.getState();

        if (loadingStore.isLoading('feed.posts') || loadingStore.isLoading('feed.loadMore')) return;

        const CACHE_DURATION = 5 * 60 * 1000;
        const now = Date.now();
        const isCacheValid = lastFetchTime && (now - lastFetchTime) < CACHE_DURATION;

        if (!force && !loadMore && posts.length > 0 && isCacheValid) {
          return;
        }

        if (currentController) {
          currentController.abort();
        }

        const newController = new AbortController();

        set({
          abortController: newController,
          isError: false
        });

        loadingStore.setLoading(loadMore ? 'feed.loadMore' : 'feed.posts', true);

        const { lastDoc } = get();

        try {
          const result = await postService.getFeedFromFanout(
            currentUserId,
            PAGINATION.FEED_POSTS,
            loadMore ? lastDoc || undefined : undefined
          );

          if (newController.signal.aborted) return;

          const postIds = result.posts.map(p => p.id);
          const myReactions = await postService.batchLoadMyReactions(postIds, currentUserId);

          const mergedPosts = loadMore ? [...posts, ...result.posts] : result.posts;
          const seenIds = new Set<string>();
          const dedupedPosts = mergedPosts.filter(p => {
            if (seenIds.has(p.id)) return false;
            seenIds.add(p.id);
            return true;
          });

          set({
            posts: dedupedPosts,
            myPostReactions: loadMore ? { ...get().myPostReactions, ...myReactions } : myReactions,
            lastDoc: result.lastDoc,
            hasMore: result.hasMore,
            abortController: null,
            isError: false,
            lastFetchTime: loadMore ? lastFetchTime : now
          });
        } catch (error: unknown) {
          const err = error as { name?: string };
          if (err.name === 'AbortError') return;
          console.error("Lỗi tải bài viết:", error);
          set({
            abortController: null,
            isError: true
          });
        } finally {
          loadingStore.setLoading(loadMore ? 'feed.loadMore' : 'feed.posts', false);
        }
      },

      subscribeToPosts: (currentUserId: string) => {
        const currentCount = Math.max(get().posts.length, PAGINATION.FEED_POSTS);

        const unsubscribe = postService.subscribeToFeedFanout(
          currentUserId,
          (action, changedPosts) => {
            set((state) => {
              if (action === 'add') {
                const existingIds = new Set(state.posts.map(p => p.id));
                const newPosts = changedPosts.filter(p => !existingIds.has(p.id));

                if (newPosts.length === 0) return {};

                const allPosts = [...newPosts, ...state.posts]
                  .sort((a, b) => {
                    const timeA = getSafeMillis(a.createdAt);
                    const timeB = getSafeMillis(b.createdAt);
                    return timeB - timeA;
                  });

                // Dedup lần cuối để chắc chắn
                const seen = new Set<string>();
                const deduped = allPosts.filter(p => seen.has(p.id) ? false : seen.add(p.id));

                return { posts: deduped };
              }

              if (action === 'update') {
                const updatedPosts = state.posts.map(p => {
                  const updated = changedPosts.find(cp => cp.id === p.id);
                  return updated || p;
                });

                return {
                  posts: updatedPosts,
                  selectedPost: state.selectedPost?.id === changedPosts[0]?.id ? changedPosts[0] : state.selectedPost
                };
              }

              if (action === 'remove') {
                const removedIds = new Set(changedPosts.map(p => p.id));
                return {
                  posts: state.posts.filter(p => !removedIds.has(p.id)),
                  selectedPost: removedIds.has(state.selectedPost?.id || '') ? null : state.selectedPost
                };
              }

              return {};
            });
          },
          currentCount
        );

        return unsubscribe;
      },

      refreshFeed: async (currentUserId: string) => {
        set({
          posts: [],
          lastDoc: null,
          hasMore: true,
          lastFetchTime: null
        });
        await get().fetchPosts(currentUserId, false, true);
      },

      createPost: async (userId: string, content: string, media: MediaObject[], visibility: Visibility = Visibility.PUBLIC, pendingFiles?: File[]) => {
        const postId = postService.generatePostId();
        const previewMedia = pendingFiles ? pendingFiles.map(f => ({
          url: URL.createObjectURL(f),
          fileName: f.name,
          mimeType: f.type,
          size: f.size,
          isSensitive: false,
        } as MediaObject)) : [];

        const tempPost: Post = {
          id: postId,
          authorId: userId,
          type: PostType.REGULAR,
          content,
          media: [...media, ...previewMedia],
          visibility,
          commentCount: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          status: PostStatus.ACTIVE,
        };

        set(state => ({
          posts: [tempPost, ...state.posts],
          uploadingStates: { ...state.uploadingStates, [postId]: { progress: 0 } }
        }));

        try {
          let finalMedia = [...media];

          if (pendingFiles && pendingFiles.length > 0) {
            const uploadedMedia = await postService.uploadPostMedia(pendingFiles, userId, (progress) => {
              set(state => ({
                uploadingStates: {
                  ...state.uploadingStates,
                  [postId]: { ...state.uploadingStates[postId], progress }
                }
              }));
            });
            finalMedia = [...finalMedia, ...uploadedMedia];
          }

          await postService.createPost({
            authorId: userId,
            type: PostType.REGULAR,
            content,
            media: finalMedia,
            visibility,
            updatedAt: serverTimestamp() as any
          }, postId);

          set(state => {
            const newStates = { ...state.uploadingStates };
            delete newStates[postId];
            return {
              uploadingStates: newStates,
              posts: state.posts.map(p => p.id === postId ? { ...p, media: finalMedia } : p)
            };
          });

          toast.success(TOAST_MESSAGES.POST.CREATE_SUCCESS);
        } catch (error) {
          console.error("[postStore] Lỗi đăng bài:", error);
          const message = (error as any)?.message || 'Lỗi không xác định';
          
          set(state => ({
            posts: state.posts.filter(p => p.id !== postId),
            uploadingStates: {
              ...state.uploadingStates,
              [postId]: { ...state.uploadingStates[postId], error: message }
            }
          }));
          toast.error(TOAST_MESSAGES.POST.CREATE_FAILED(message));
          throw error;
        } finally {
          previewMedia.forEach(m => URL.revokeObjectURL(m.url));
        }
      },

      updatePost: async (postId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => {
        const { posts } = get();
        const post = posts.find(p => p.id === postId);
        if (!post) return;

        const previewMedia = pendingFiles ? pendingFiles.map(f => ({
          url: URL.createObjectURL(f),
          fileName: f.name,
          mimeType: f.type,
          size: f.size,
          isSensitive: false,
        } as MediaObject)) : [];

        set(state => ({
          posts: state.posts.map(p =>
            p.id === postId
              ? {
                ...p,
                content,
                media: [...media, ...previewMedia],
                visibility,
                updatedAt: Timestamp.now()
              }
              : p
          ),
          uploadingStates: pendingFiles && pendingFiles.length > 0
            ? { ...state.uploadingStates, [postId]: { progress: 0 } }
            : state.uploadingStates
        }));

        const processUpdate = async () => {
          try {
            let finalMedia = [...media];

            if (pendingFiles && pendingFiles.length > 0) {
              const uploadedMedia = await postService.uploadPostMedia(pendingFiles, post.authorId, (progress) => {
                set(state => ({
                  uploadingStates: {
                    ...state.uploadingStates,
                    [postId]: { ...state.uploadingStates[postId], progress }
                  }
                }));
              });
              finalMedia = [...finalMedia, ...uploadedMedia];
            }

            await postService.updatePost(postId, content, finalMedia, visibility);

            set(state => {
              const newUploadingStates = { ...state.uploadingStates };
              delete newUploadingStates[postId];
              return {
                uploadingStates: newUploadingStates,
                posts: state.posts.map(p =>
                  p.id === postId
                    ? { ...p, media: finalMedia }
                    : p
                )
              };
            });

            toast.success(TOAST_MESSAGES.POST.UPDATE_SUCCESS);
          } catch (error) {
            console.error("Lỗi cập nhật bài viết:", error);
            const errorMessage = (error as any)?.message || 'Lỗi tải lên';
            set(state => ({
              uploadingStates: {
                ...state.uploadingStates,
                [postId]: { ...state.uploadingStates[postId], error: errorMessage }
              }
            }));
            toast.error(TOAST_MESSAGES.POST.UPDATE_FAILED(errorMessage));
          } finally {
            previewMedia.forEach(m => URL.revokeObjectURL(m.url));
          }
        };

        processUpdate();
      },

      deletePost: async (postId: string, userId: string, _images?: string[], _videos?: string[]) => {
        try {
          await postService.deletePost(postId, userId);
          set((state) => ({
            posts: state.posts.filter(p => p.id !== postId)
          }));
          toast.success(TOAST_MESSAGES.POST.DELETE_SUCCESS);
        } catch (error) {
          console.error("Lỗi xóa bài viết:", error);
          toast.error(TOAST_MESSAGES.POST.DELETE_FAILED);
          throw error;
        }
      },

      reactToPost: async (postId: string, userId: string, reaction: ReactionType | 'REMOVE') => {
        const post = get().posts.find(p => p.id === postId) ?? get().selectedPost;
        if (!post) return;

        const prevMyReaction = get().myPostReactions[postId];
        const isRemove = prevMyReaction === reaction || reaction === 'REMOVE';

        const newMyReactions = { ...get().myPostReactions };
        if (isRemove) {
          delete newMyReactions[postId];
        } else {
          newMyReactions[postId] = reaction;
        }

        set((state) => ({
          myPostReactions: newMyReactions,
        }));

        try {
          await postService.reactToPost(postId, userId, reaction);
        } catch (error) {
          console.error("Lỗi react bài viết:", error);
          set((state) => ({
            myPostReactions: { ...state.myPostReactions, [postId]: prevMyReaction },
          }));
        }
      },

      uploadMedia: async (files: File[], userId: string) => {
        try {
          return await postService.uploadPostMedia(files, userId);
        } catch (error) {
          console.error("Lỗi tải lên media:", error);
          throw error;
        }
      },

      clearPosts: () => set({ posts: [], lastDoc: null, hasMore: true }),

      filterPostsByAuthor: (authorId: string) => {
        set((state) => ({
          posts: state.posts.filter(p => p.authorId !== authorId),
          selectedPost: state.selectedPost?.authorId === authorId ? null : state.selectedPost
        }));
      },

      setSelectedPost: (post: Post | null) => {
        const { selectedPostUnsubscribe } = get();
        if (selectedPostUnsubscribe) {
          selectedPostUnsubscribe();
        }

        if (post) {
          const unsubscribe = onSnapshot(doc(db, 'posts', post.id), (postDoc) => {
            if (postDoc.exists()) {
              const updatedPost = convertDoc<Post>(postDoc);
              set(state => ({
                selectedPost: state.selectedPost?.id === post.id ? updatedPost : state.selectedPost,
                posts: state.posts.map(p => p.id === post.id ? updatedPost : p)
              }));
            }
          });

          set({ selectedPost: post, selectedPostUnsubscribe: unsubscribe });
        } else {
          set({ selectedPost: null, selectedPostUnsubscribe: null });
        }
      },

      fetchPostById: async (postId: string, currentUserId: string, friendIds: string[]) => {
        useLoadingStore.getState().setLoading('post.detail', true);
        try {
          const post = await postService.getPostById(postId, currentUserId, friendIds);

          if (!post) {
            toast.info('Bài viết này đã bị xóa hoặc không còn tồn tại');
            set({ selectedPost: null });
            return;
          }

          const myReaction = await postService.getMyReactionForPost(postId, currentUserId);

          set({
            selectedPost: post,
            myPostReactions: { ...get().myPostReactions, [postId]: myReaction || '' }
          });
        } catch (error) {
          console.error("Lỗi lấy chi tiết bài viết:", error);
          toast.error('Không thể tải bài viết');
        } finally {
          useLoadingStore.getState().setLoading('post.detail', false);
        }
      },
    }),
    {
      name: 'smurf_feed_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        posts: state.posts.slice(0, PAGINATION.FEED_CACHE_LIMIT),
        lastFetchTime: state.lastFetchTime,
        myPostReactions: state.myPostReactions
      }),
    }
  )
);

