import { StateCreator } from 'zustand';
import { PostStoreState } from './types';
import { postService } from '../../services/postService';
import { PAGINATION } from '../../constants';
import { useLoadingStore } from '../loadingStore';
import { getSafeMillis } from '../../utils/timestampHelpers';
import { Visibility, Post } from '../../../shared/types';

export const createFetchSlice: StateCreator<PostStoreState, [], [], any> = (set, get) => ({
  posts: [],
  hasMore: true,
  lastDoc: null,
  abortController: null,
  isError: false,
  lastFetchTime: null,
  uploadingStates: {},
  selectedPost: null,
  selectedPostUnsubscribe: null,

  /** Tải danh sách bài viết */
  fetchPosts: async (currentUserId: string, loadMore = false, force = false) => {
    const { abortController: currentController, posts, lastFetchTime, lastDoc } = get();
    const loadingStore = useLoadingStore.getState();

    if (loadingStore.isLoading('feed.posts') || loadingStore.isLoading('feed.loadMore')) return;

    const CACHE_DURATION = 5 * 60 * 1000;
    const now = Date.now();
    const isCacheValid = lastFetchTime && (now - lastFetchTime) < CACHE_DURATION;

    if (!force && !loadMore && posts.length > 0 && isCacheValid) return;

    if (currentController) currentController.abort();
    const newController = new AbortController();

    set({ abortController: newController, isError: false });
    loadingStore.setLoading(loadMore ? 'feed.loadMore' : 'feed.posts', true);

    try {
      const result = await postService.getFeedFromFanout(
        currentUserId,
        PAGINATION.FEED_POSTS,
        loadMore ? lastDoc || undefined : undefined
      );

      if (newController.signal.aborted) return;

      const mergedPosts = loadMore ? [...posts, ...result.posts] : result.posts;
      const seenIds = new Set<string>();
      const dedupedPosts = mergedPosts.filter(p => !seenIds.has(p.id) && seenIds.add(p.id));

      set({
        posts: dedupedPosts,
        lastDoc: result.lastDoc,
        hasMore: result.hasMore,
        abortController: null,
        isError: false,
        lastFetchTime: loadMore ? lastFetchTime : now
      });
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Lỗi tải bài viết:", error);
      set({ abortController: null, isError: true });
    } finally {
      loadingStore.setLoading(loadMore ? 'feed.loadMore' : 'feed.posts', false);
    }
  },

  /** Theo dõi bài viết mới */
  subscribeToPosts: (currentUserId: string) => {
    const currentCount = Math.max(get().posts.length, PAGINATION.FEED_POSTS);

    return postService.subscribeToFeedFanout(
      currentUserId,
      (action, changedPosts) => {
        set((state) => {
          if (action === 'add') {
            const existingIds = new Set(state.posts.map(p => p.id));
            const newPosts = changedPosts.filter(p => !existingIds.has(p.id));

            if (newPosts.length === 0) return {};

            const allPosts = [...newPosts, ...state.posts].sort((a, b) => 
              getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt)
            );

            const seen = new Set<string>();
            return { posts: allPosts.filter(p => !seen.has(p.id) && seen.add(p.id)) };
          }

          if (action === 'update') {
            const updatedPosts = state.posts.map(p => {
              const updated = changedPosts.find(cp => cp.id === p.id);
              if (updated) {
                const isOwner = updated.authorId === currentUserId;
                return (updated.visibility === Visibility.PRIVATE && !isOwner) ? null : updated;
              }
              return p;
            }).filter((p): p is Post => p !== null);

            const updatedPost = changedPosts[0];
            let newSelectedPost = state.selectedPost;
            if (updatedPost && state.selectedPost?.id === updatedPost.id) {
              const isOwner = updatedPost.authorId === currentUserId;
              newSelectedPost = (updatedPost.visibility === Visibility.PRIVATE && !isOwner) ? null : updatedPost;
            }

            return { posts: updatedPosts, selectedPost: newSelectedPost };
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
  },

  /** Làm mới bảng tin */
  refreshFeed: async (currentUserId: string) => {
    set({ posts: [], lastDoc: null, hasMore: true, lastFetchTime: null });
    await get().fetchPosts(currentUserId, false, true);
  },

  /** Xóa danh sách bài viết */
  clearPosts: () => set({ posts: [], lastDoc: null, hasMore: true }),

  /** Lọc bài viết theo tác giả */
  filterPostsByAuthor: (authorId: string) => {
    set((state) => ({
      posts: state.posts.filter(p => p.authorId !== authorId),
      selectedPost: state.selectedPost?.authorId === authorId ? null : state.selectedPost
    }));
  },
});
