import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { userService } from '../services/userService';
import { rtdbConversationService } from '../services/chat/rtdbConversationService';
import { toast } from '../store/toastStore';
import { useUserCache } from '../store/userCacheStore';
import { TOAST_MESSAGES } from '../constants';
import { useProfileData } from './profile/useProfileData';
import { useProfileFriend } from './profile/useProfileFriend';
import { useProfileMedia } from './profile/useProfileMedia';
import { useProfileBlock } from './profile/useProfileBlock';

type TabType = 'posts' | 'media';

export const useProfile = () => {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const profileUserId = userId || currentUser?.id;
  const [activeTab, setActiveTab] = useState<TabType>('posts');

  const data = useProfileData({ profileUserId, currentUser: currentUser ?? null });
  const { profile, setProfile, isOwnProfile, loadProfile } = data;

  const friend = useProfileFriend({
    currentUser: currentUser ?? null,
    profile,
    profileUserId,
    isOwnProfile,
    loadProfile,
  });

  const media = useProfileMedia({
    profile,
    setProfile,
    isOwnProfile,
    currentUser: currentUser ?? null,
  });

  const block = useProfileBlock({
    currentUser: currentUser ?? null,
    profile,
    profileUserId,
    isOwnProfile,
  });

  const isBannedProfile = profile?.status === 'banned';

  const canViewContent = !block.isBlockedByMe && !block.isActivityBlockedByPartner;

  const handleMessage = useCallback(async () => {
    if (!currentUser || !profile) return;
    if (profile.status === 'banned') {
      toast.error(TOAST_MESSAGES.CHAT.BLOCKED_USER);
      return;
    }
    try {
      const conversationId = await rtdbConversationService.getOrCreateDirect(currentUser.id, profile.id);
      navigate(`/?conv=${conversationId}`);
    } catch {
      toast.error(TOAST_MESSAGES.CHAT.OPEN_FAILED);
    }
  }, [currentUser, profile, navigate]);

  const handleSaveProfile = useCallback(async (data: Partial<User>) => {
    if (!profile) return;
    try {
      const updated = await userService.updateProfile(profile.id, data);
      setProfile(updated);
      useUserCache.getState().setUser(updated);
      if (isOwnProfile && currentUser) {
        useAuthStore.getState().updateUserProfile(data);
      }
    } catch (error) {
      console.error("Lỗi cập nhật profile", error);
      throw error;
    }
  }, [profile, isOwnProfile, currentUser, setProfile]);

  return {
    currentUser,
    profile: data.profile,
    latestMedia: data.latestMedia,
    loading: data.loading,
    profileUserId,
    isOwnProfile,
    isBannedProfile,
    canViewContent,
    activeTab,
    setActiveTab,
    loadProfile,
    handleMessage,
    handleSaveProfile,

    // Friend
    friendStatus: friend.friendStatus,
    pendingRequestId: friend.pendingRequestId,
    handleFriendAction: friend.handleFriendAction,
    confirmUnfriend: friend.confirmUnfriend,

    // Media
    uploading: media.uploading,
    uploadProgress: media.uploadProgress,
    handleAvatarChange: media.handleAvatarChange,
    handleCoverChange: media.handleCoverChange,
    handleAvatarDelete: media.handleAvatarDelete,
    handleCoverDelete: media.handleCoverDelete,

    // Block
    isBlockedByMe: block.isBlockedByMe,
    isActivityBlockedByPartner: block.isActivityBlockedByPartner,
    currentBlockOptions: block.currentBlockOptions,
    isBlockModalOpen: block.isBlockModalOpen,
    handleOpenBlockModal: block.handleOpenBlockModal,
    handleApplyBlock: block.handleApplyBlock,
    handleUnblockUser: block.handleUnblockUser,
    closeBlockModal: block.closeBlockModal,
  };
};
