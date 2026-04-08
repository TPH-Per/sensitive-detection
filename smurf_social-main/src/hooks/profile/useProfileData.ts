import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { User } from '../../../shared/types';
import { useFriendIds } from '../utils';
import { userService } from '../../services/userService';
import { postService } from '../../services/postService';
import { useUserCache } from '../../store/userCacheStore';
import { useBlockedUsers } from '../utils/useBlockedUsers';

interface UseProfileDataProps {
  profileUserId: string | undefined;
  currentUser: User | null;
}

/**
 * Lấy và đồng bộ dữ liệu profile
 */
export const useProfileData = ({ profileUserId, currentUser }: UseProfileDataProps) => {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestMedia, setLatestMedia] = useState<string[]>([]);

  const isOwnProfile = currentUser?.id === profileUserId;
  const rawFriendIds = useFriendIds();
  const friendIds = useMemo(() => rawFriendIds, [JSON.stringify(rawFriendIds)]);
  
  const { isActivityBlocked, isBlocked } = useBlockedUsers();
  const lastIdRef = useRef<string | undefined>(undefined);

  const loadProfile = useCallback(async (isInitial = false) => {
    if (!profileUserId) return;

    const isDifferentUser = lastIdRef.current !== profileUserId;
    if (isInitial && isDifferentUser) {
      setLoading(true);
    }
    
    lastIdRef.current = profileUserId;
    try {
      const isBlockedWith = profileUserId ? isActivityBlocked(profileUserId) || isBlocked(profileUserId) : false;
      const [userData, userPosts] = await Promise.all([
        userService.getUserById(profileUserId),
        isBlockedWith ? Promise.resolve({ posts: [], lastDoc: null }) : postService.getUserPosts(profileUserId, currentUser?.id || '', rawFriendIds, 20)
      ]);

      setProfile(userData || null);

      const media: string[] = [];
      userPosts.posts.forEach(post => {
        if (post.media) {
          post.media.forEach(m => media.push(m.url));
        }
      });
      setLatestMedia(media.slice(0, 6));

    } catch (error) {
      console.error("Lỗi load profile", error);
    } finally {
      if (isInitial && isDifferentUser) {
        setLoading(false);
      }
    }
  }, [profileUserId, currentUser?.id, rawFriendIds, isActivityBlocked, isBlocked]);

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

    return () => unsubscribeProfile();
  }, [profileUserId]);

  return {
    profile,
    setProfile,
    latestMedia,
    loading,
    isOwnProfile,
    loadProfile,
  };
};
