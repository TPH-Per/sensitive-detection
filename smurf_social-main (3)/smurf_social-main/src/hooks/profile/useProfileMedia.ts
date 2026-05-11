import { useState, useCallback } from 'react';
import { User, MediaObject, Visibility } from '../../../shared/types';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { useUserCache } from '../../store/userCacheStore';
import { toast } from '../../store/toastStore';
import { validateFile } from '../../utils';
import { TOAST_MESSAGES } from '../../constants';

interface UseProfileMediaProps {
  profile: User | null;
  setProfile: (profile: User | null | ((prev: User | null) => User | null)) => void;
  isOwnProfile: boolean;
  currentUser: User | null;
}

/** Quản lý ảnh đại diện và ảnh bìa người dùng */
export const useProfileMedia = ({
  profile,
  setProfile,
  isOwnProfile,
  currentUser
}: UseProfileMediaProps) => {
  const [uploadingType, setUploadingType] = useState<'avatar' | 'cover' | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleAvatarChange = useCallback(async (file: File, visibility: Visibility) => {
    if (!profile || !isOwnProfile) return;
    const validation = validateFile(file, 'AVATAR');
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    setUploadingType('avatar');
    setUploadProgress(0);
    try {
      const newAvatarMedia = await userService.uploadAvatar(profile.id, file, visibility, (p) => {
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
      setUploadingType(null);
      setUploadProgress(0);
    }
  }, [profile, isOwnProfile, currentUser, setProfile]);

  const handleCoverChange = useCallback(async (file: File, visibility: Visibility) => {
    if (!profile || !isOwnProfile) return;
    const validation = validateFile(file, 'COVER');
    if (!validation.isValid) {
      if (validation.error) toast.error(validation.error);
      return;
    }

    setUploadingType('cover');
    setUploadProgress(0);
    try {
      const newCoverMedia = await userService.uploadCoverImage(profile.id, file, visibility, (p) => {
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
      setUploadingType(null);
      setUploadProgress(0);
    }
  }, [profile, isOwnProfile, setProfile]);

  const handleAvatarDelete = useCallback(async () => {
    if (!profile || !isOwnProfile) return;
    setUploadingType('avatar');
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
      setUploadingType(null);
    }
  }, [profile, isOwnProfile, currentUser, setProfile]);

  const handleCoverDelete = useCallback(async () => {
    if (!profile || !isOwnProfile) return;
    setUploadingType('cover');
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
      setUploadingType(null);
    }
  }, [profile, isOwnProfile, setProfile]);

  return {
    uploadingType,
    uploadProgress,
    handleAvatarChange,
    handleCoverChange,
    handleAvatarDelete,
    handleCoverDelete,
  };
};
