import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Post, User, ReactionType, Visibility } from '../../shared/types';
import { postService } from '../services/postService';
import { userService } from '../services/userService';
import { useFriendIds } from './utils';
import { useUserCache } from '../store/userCacheStore';
import { usePostStore } from '../store';
import { useReactionStore } from '../store/reactionStore';
import { DocumentSnapshot, Timestamp } from 'firebase/firestore';
import { getSafeMillis } from '../utils/timestampHelpers';

interface UseUserPostsReturn {
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  users: Record<string, User>;
  handleLoadMore: () => void;
  handleReact: (postId: string, reaction: ReactionType | 'REMOVE') => Promise<void>;
  handleDelete: (postId: string, media?: any[]) => Promise<void>;
  handleUpdate: (postId: string, content: string, media: any[], visibility: Visibility, pendingFiles?: File[]) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useUserPosts = (userId: string, currentUser: User): UseUserPostsReturn => {
  const [dbPosts, setDbPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const lastDocRef = useRef<DocumentSnapshot | null>(null);
  const hasMoreRef = useRef(true);

  const { users, fetchUsers } = useUserCache();
  const { posts: allStorePosts, deletePost: deleteStorePost } = usePostStore();
  const friendIds = useFriendIds();

  const posts = useMemo(() => {
    const storePostMap = new Map(allStorePosts.map(p => [p.id, p]));

    const mergedPosts = dbPosts.map(p => {
      const storePost = storePostMap.get(p.id);
      if (storePost && userId === currentUser.id) {
        return storePost;
      }
      return p;
    });

    if (userId !== currentUser.id) return mergedPosts;

    const dbPostIds = new Set(mergedPosts.map(p => p.id));
    const uploadingPosts = allStorePosts.filter(p =>
      p.authorId === userId && !dbPostIds.has(p.id)
    );

    return [...uploadingPosts, ...mergedPosts];
  }, [dbPosts, allStorePosts, userId, currentUser.id]);

  const loadPosts = useCallback(async (isFirstPage: boolean = false) => {
    if (!isFirstPage && !hasMoreRef.current) return;

    if (isFirstPage) {
      setLoading(true);
      lastDocRef.current = null;
      hasMoreRef.current = true;
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await postService.getUserPosts(
        userId,
        currentUser.id,
        friendIds,
        10,
        isFirstPage ? undefined : (lastDocRef.current || undefined)
      );

      const newPosts = result.posts;
      lastDocRef.current = result.lastDoc;
      hasMoreRef.current = result.posts.length === 10;
      setHasMore(hasMoreRef.current);

      if (isFirstPage) {
        setDbPosts(newPosts);
      } else {
        setDbPosts(prev => [...prev, ...newPosts]);
      }

      const userIds = [...new Set(newPosts.map(p => p.authorId))];
      fetchUsers(userIds);

    } catch (error) {
      console.error("Lỗi load posts", error);
    } finally {
      if (isFirstPage) setLoading(false);
      setLoadingMore(false);
    }
  }, [userId, currentUser.id, friendIds, fetchUsers]);

  useEffect(() => {
    loadPosts(true);

    const unsubscribe = postService.subscribeToUserPosts(
      userId,
      currentUser.id,
      friendIds,
      (action, changedPosts) => {
        if (action === 'remove') {
          if (changedPosts.length === 0) {
            setDbPosts([]);
            return;
          }

          const removedIds = new Set(changedPosts.map(post => post.id));
          setDbPosts(prev => prev.filter(post => !removedIds.has(post.id)));
          return;
        }

        setDbPosts(prev => {
          const updatedPosts = [...prev];
          changedPosts.forEach(npm => {
            const index = updatedPosts.findIndex(p => p.id === npm.id);
            if (index !== -1) {
              updatedPosts[index] = npm;
            } else {
              const firstPostTime = updatedPosts[0] ? getSafeMillis(updatedPosts[0].createdAt) : 0;
              if (getSafeMillis(npm.createdAt) >= firstPostTime) {
                updatedPosts.unshift(npm);
              } else {
                updatedPosts.push(npm);
              }
            }
          });
          return updatedPosts;
        });

        fetchUsers(changedPosts.map(post => post.authorId));
      }
    );

    return () => unsubscribe();
  }, [userId, currentUser.id, friendIds, loadPosts, fetchUsers]);

  const handleLoadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      loadPosts(false);
    }
  }, [loading, loadingMore, hasMore, loadPosts]);

  const handleReact = useCallback(async (postId: string, reaction: ReactionType | 'REMOVE') => {
    const { setOptimisticReaction, clearOptimisticReaction } = useReactionStore.getState();

    const isRemove = reaction === 'REMOVE';
    setOptimisticReaction(postId, isRemove ? null : reaction);

    try {
      await postService.reactToPost(postId, currentUser.id, reaction);

      setTimeout(() => {
        clearOptimisticReaction(postId);
      }, 500);
    } catch (error) {
      console.error("Lỗi react bài viết:", error);
      clearOptimisticReaction(postId);
      throw error;
    }
  }, [currentUser.id]);

  const handleDelete = useCallback(async (postId: string, media?: any[]) => {
    try {
      await deleteStorePost(postId, currentUser.id);
      setDbPosts(prev => prev.filter(p => p.id !== postId));
    } catch (error) {
      console.error("Lỗi khi xóa bài viết trong hook:", error);
      throw error;
    }
  }, [deleteStorePost, currentUser.id]);

  const handleUpdate = useCallback(async (
    postId: string,
    content: string,
    media: any[],
    visibility: Visibility,
    pendingFiles?: File[]
  ) => {
    const { updatePost } = usePostStore.getState();

    setDbPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, content, media, visibility, updatedAt: Timestamp.now() }
        : p
    ));

    await updatePost(postId, content, media, visibility, pendingFiles);
  }, []);

  const refresh = useCallback(async () => {
    await loadPosts(true);
  }, [loadPosts]);

  return {
    posts,
    loading,
    loadingMore,
    hasMore,
    users,
    handleLoadMore,
    handleReact,
    handleDelete,
    handleUpdate,
    refresh
  };
};
