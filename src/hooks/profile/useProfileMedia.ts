import { useState, useCallback } from 'react';
import { User, MediaObject } from '../../../shared/types';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { useUserCache } from '../../store/userCacheStore';
import { toast } from '../../store/toastStore';
import { validateFileSize } from '../../utils';
import { TOAST_MESSAGES } from '../../constants';

interface UseProfileMediaProps {
  profile: User | null;
  setProfile: (profile: User | null | ((prev: User | null) => User | null)) => void;
  isOwnProfile: boolean;
  currentUser: User | null;
}

/**
 * Xử lý upload/delete avatar và cover image
 */
export const useProfileMedia = ({
  profile,
  setProfile,
  isOwnProfile,
  currentUser
}: UseProfileMediaProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleAvatarChange = useCallback(async (file: File, shouldShare: boolean = false) => {
    if (!profile || !isOwnProfile) return;
    if (!file.type.startsWith('image/')) {
      toast.error(TOAST_MESSAGES.MEDIA.INVALID_FILE);
      return;
    }
    const validation = validateFileSize(file, 'AVATAR');
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const newAvatarMedia = await userService.uploadAvatar(profile.id, file, shouldShare, (p) => {
        setUploadProgress(p.progress);
      });
      const updatedProfile = { ...profile, avatar: newAvatarMedia };
      setProfile(updatedProfile);
      useUserCache.getState().setUser(updatedProfile);

      if (currentUser) {
        useAuthStore.getState().updateAvatar(newAvatarMedia);
      }

      toast.success('Đã cập nhật ảnh đại diện!');
    } catch (error) {
      console.error("Lỗi upload avatar", error);
      toast.error(TOAST_MESSAGES.MEDIA.UPLOAD_AVATAR_FAILED);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [profile, isOwnProfile, currentUser, setProfile]);

  const handleCoverChange = useCallback(async (file: File, shouldShare: boolean = false) => {
    if (!profile || !isOwnProfile) return;
    if (!file.type.startsWith('image/')) {
      toast.error(TOAST_MESSAGES.MEDIA.INVALID_FILE);
      return;
    }
    const validation = validateFileSize(file, 'COVER');
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const newCoverMedia = await userService.uploadCoverImage(profile.id, file, shouldShare, (p) => {
        setUploadProgress(p.progress);
      });
      const updatedProfile = { ...profile, cover: newCoverMedia };
      setProfile(updatedProfile);
      useUserCache.getState().setUser(updatedProfile);

      toast.success('Đã cập nhật ảnh bìa!');
    } catch (error) {
      console.error("Lỗi upload cover", error);
      toast.error(TOAST_MESSAGES.MEDIA.UPLOAD_COVER_FAILED);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [profile, isOwnProfile, setProfile]);

  const handleAvatarDelete = useCallback(async () => {
    if (!profile || !isOwnProfile) return;
    setUploading(true);
    try {
      const emptyAvatar: MediaObject = { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false };
      await userService.updateProfile(profile.id, { avatar: emptyAvatar });
      const updatedProfile = { ...profile, avatar: emptyAvatar };
      setProfile(updatedProfile);
      useUserCache.getState().setUser(updatedProfile);

      if (currentUser) {
        useAuthStore.getState().updateAvatar(emptyAvatar);
      }
      toast.success(TOAST_MESSAGES.MEDIA.DELETE_AVATAR_SUCCESS);
    } catch (error) {
      toast.error(TOAST_MESSAGES.MEDIA.DELETE_AVATAR_FAILED);
    } finally {
      setUploading(false);
    }
  }, [profile, isOwnProfile, currentUser, setProfile]);

  const handleCoverDelete = useCallback(async () => {
    if (!profile || !isOwnProfile) return;
    setUploading(true);
    try {
      const emptyCover: MediaObject = { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false };
      await userService.updateProfile(profile.id, { cover: emptyCover });
      const updatedProfile = { ...profile, cover: emptyCover };
      setProfile(updatedProfile);
      useUserCache.getState().setUser(updatedProfile);
      toast.success(TOAST_MESSAGES.MEDIA.DELETE_COVER_SUCCESS);
    } catch (error) {
      toast.error(TOAST_MESSAGES.MEDIA.DELETE_COVER_FAILED);
    } finally {
      setUploading(false);
    }
  }, [profile, isOwnProfile, setProfile]);

  return {
    uploading,
    uploadProgress,
    handleAvatarChange,
    handleCoverChange,
    handleAvatarDelete,
    handleCoverDelete,
  };
};
