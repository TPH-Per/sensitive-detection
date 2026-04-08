import { useEffect, useCallback, RefObject } from 'react';
import { Post, User, Visibility, ReactionType } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { usePostStore } from '../store';
import { useUserCache } from '../store/userCacheStore';
import { useIntersectionObserver } from './utils/useIntersectionObserver';
import { useLoadingStore } from '../store/loadingStore';
import { useFriendIds } from './utils';
import { useBlockedUsers } from './utils';

interface UseFeedReturn {
  posts: Post[];
  isLoading: boolean;
  hasMore: boolean;
  usersMap: Record<string, User>;
  handleLoadMore: () => void;
  handleRefresh: () => Promise<void>;
  handleReact: (postId: string, reaction: ReactionType | 'REMOVE') => Promise<void>;
  handleUpdate: (postId: string, content: string, media: any[], visibility: Visibility, pendingFiles?: File[], onProgress?: (progress: number) => void) => Promise<void>;
  handleDelete: (postId: string, media?: any[]) => Promise<void>;
  observerRef: RefObject<HTMLDivElement | null>;
}

export const useFeed = (): UseFeedReturn => {
  const { user: currentUser } = useAuthStore();
  const friendIds = useFriendIds();
  const { blockedUserIds } = useBlockedUsers();
  const {
    posts,
    hasMore,
    fetchPosts,
    subscribeToPosts,
    refreshFeed,
    reactToPost,
    updatePost,
    deletePost,
  } = usePostStore();
  const { users: usersMap, fetchUsers } = useUserCache();
  const feedPostsLoading = useLoadingStore(state => state.loadingStates['feed.posts'] ?? false);
  const feedLoadMoreLoading = useLoadingStore(state => state.loadingStates['feed.loadMore'] ?? false);

  const handleLoadMore = useCallback(() => {
    if (!currentUser || feedPostsLoading || feedLoadMoreLoading || !hasMore) return;
    fetchPosts(currentUser.id, true);
  }, [currentUser, hasMore, fetchPosts, feedPostsLoading, feedLoadMoreLoading]);

  const observerRef = useIntersectionObserver(handleLoadMore, {
    enabled: hasMore && !feedPostsLoading && !feedLoadMoreLoading && !!currentUser
  });

  const handleSubscribeToPosts = useCallback(() => {
    if (!currentUser) return;
    return subscribeToPosts(currentUser.id);
  }, [currentUser, subscribeToPosts]);

  useEffect(() => {
    if (!currentUser) return;

    fetchPosts(currentUser.id, false, false);

    const unsubscribe = handleSubscribeToPosts();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (posts.length > 0) {
      const userIds = [...new Set(posts.map(p => p.authorId))];
      fetchUsers(userIds);
    }
  }, [posts, fetchUsers]);



  const handleRefresh = useCallback(async () => {
    if (!currentUser) return;
    await refreshFeed(currentUser.id);
  }, [currentUser, refreshFeed]);

  const handleReact = useCallback(async (postId: string, reaction: ReactionType | 'REMOVE') => {
    if (!currentUser) return;
    await reactToPost(postId, currentUser.id, reaction as ReactionType | 'REMOVE');
  }, [currentUser, reactToPost]);

  const handleUpdate = useCallback(async (
    postId: string,
    content: string,
    media: any[],
    visibility: Visibility,
    pendingFiles?: File[],
    onProgress?: (progress: number) => void
  ) => {
    await updatePost(postId, content, media, visibility, pendingFiles, onProgress);
  }, [updatePost]);

  const handleDelete = useCallback(async (
    postId: string,
    media?: any[]
  ) => {
    if (!currentUser) return;
    await deletePost(postId, currentUser.id);
  }, [deletePost, currentUser]);

  return {
    posts,
    isLoading: feedPostsLoading,
    hasMore,
    usersMap,
    handleLoadMore,
    handleRefresh,
    handleReact,
    handleUpdate,
    handleDelete,
    observerRef,
  };
};
