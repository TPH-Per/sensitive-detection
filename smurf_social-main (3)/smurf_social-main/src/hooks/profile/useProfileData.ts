import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User, Post, MediaObject } from '../../../shared/types';
import { useFriendIds } from '../utils';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import { useUserCache } from '../../store/userCacheStore';
import { usePostStore } from '../../store';
import { getSafeMillis } from '../../utils/timestampHelpers';

interface UseProfileDataProps {
  profileUserId: string | undefined;
  currentUser: User | null;
}

/** Tải và cập nhật thông tin hồ sơ người dùng */
export const useProfileData = ({ profileUserId, currentUser }: UseProfileDataProps) => {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbPosts, setDbPosts] = useState<Post[]>([]);

  const isOwnProfile = currentUser?.id === profileUserId;
  const rawFriendIds = useFriendIds();
  const friendIds = useMemo(() => rawFriendIds, [JSON.stringify(rawFriendIds)]);

  const lastIdRef = useRef<string | undefined>(undefined);

  const allStorePosts = usePostStore(state => state.posts);

  const latestMedia = useMemo(() => {
    if (!profileUserId) return [];

    const storeMediaPosts = allStorePosts.filter(p =>
      p.authorId === profileUserId && p.media && p.media.length > 0
    );

    const combinedPosts = [...storeMediaPosts, ...dbPosts];

    const mediaMap = new Map<string, MediaObject>();
    combinedPosts.forEach(post => {
      post.media?.forEach(m => {
        if (m.url && !mediaMap.has(m.url)) {
          mediaMap.set(m.url, m);
        }
      });
    });

    return Array.from(mediaMap.values()).slice(0, 6);
  }, [allStorePosts, dbPosts, profileUserId]);

  const loadProfile = useCallback(async (isInitial = false) => {
    if (!profileUserId) return;

    const isDifferentUser = lastIdRef.current !== profileUserId;
    if (isInitial && isDifferentUser) {
      setLoading(true);
    }

    lastIdRef.current = profileUserId;
    try {
      await userService.getUserById(profileUserId).then(userData => setProfile(userData || null));
    } catch (error) {
      console.error("Lỗi load profile", error);
    } finally {
      if (isInitial && isDifferentUser) {
        setLoading(false);
      }
    }
  }, [profileUserId, currentUser?.id, rawFriendIds]);

  useEffect(() => {
    loadProfile(true);
  }, [profileUserId]);

  useEffect(() => {
    if (!profileUserId) return;

    const unsubscribeProfile = userService.subscribeToUser(profileUserId, (updatedUser) => {
      setProfile(prev => {
        if (!prev) return updatedUser;
        return { ...prev, ...updatedUser };
      });
      useUserCache.getState().setUser(updatedUser);
    });

    const unsubscribePosts = postService.subscribeToUserPosts(
      profileUserId,
      currentUser?.id || '',
      friendIds,
      (action, posts) => {
        setDbPosts(prev => {
          if (action === 'add') {
            const newPosts = posts.filter(p => !prev.some(prevP => prevP.id === p.id));
            return [...newPosts, ...prev].sort((a, b) =>
              getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt)
            ).slice(0, 20);
          }
          if (action === 'update') {
            return prev.map(p => {
              const updated = posts.find(u => u.id === p.id);
              return updated ? { ...p, ...updated } : p;
            });
          }
          if (action === 'remove') {
            const removedIds = posts.map(p => p.id);
            return prev.filter(p => !removedIds.includes(p.id));
          }
          return prev;
        });
      },
      20
    );

    return () => {
      unsubscribeProfile();
      unsubscribePosts();
    };
  }, [profileUserId, currentUser?.id, friendIds]);

  return {
    profile,
    setProfile,
    latestMedia,
    loading,
    isOwnProfile,
    loadProfile,
  };
};
