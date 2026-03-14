import { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { toast } from '../../store/toastStore';
import { BlockOptions } from '../../types';
import { TOAST_MESSAGES } from '../../constants';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface UseProfileBlockProps {
  currentUser: User | null;
  profile: User | null;
  profileUserId: string | undefined;
  isOwnProfile: boolean;
}

// Xử lý block/unblock và mở modal options
export const useProfileBlock = ({
  currentUser,
  profile,
  profileUserId,
  isOwnProfile,
}: UseProfileBlockProps) => {
  const blockedUsers = useAuthStore(state => state.blockedUsers);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isActivityBlockedByPartner, setIsActivityBlockedByPartner] = useState(false);

  const isBlockedByMe = useMemo(() =>
    !!blockedUsers[profileUserId || ''],
    [blockedUsers, profileUserId]
  );

  const currentBlockOptions = useMemo(() =>
    profileUserId ? blockedUsers[profileUserId] : undefined,
    [blockedUsers, profileUserId]
  );

  // Mở modal chọn options
  const handleOpenBlockModal = useCallback(() => {
    if (!currentUser || !profile || isOwnProfile) return;
    setIsBlockModalOpen(true);
  }, [currentUser, profile, isOwnProfile]);

  // Lắng nghe xem đối phương có chặn mình xem hoạt động không
  useEffect(() => {
    if (!currentUser || !profileUserId || isOwnProfile) {
      setIsActivityBlockedByPartner(false);
      return;
    }
    const blockRef = doc(db, 'users', profileUserId, 'blockedUsers', currentUser.id);
    const unsub = onSnapshot(blockRef, (snap) => {
      if (snap.exists()) {
        setIsActivityBlockedByPartner(snap.data()?.blockViewMyActivity === true);
      } else {
        setIsActivityBlockedByPartner(false);
      }
    });
    return () => unsub();
  }, [currentUser, profileUserId, isOwnProfile]);

  // Thực hiện chặn với options đã chọn
  const handleApplyBlock = useCallback(async (options: BlockOptions) => {
    if (!currentUser || !profile || isOwnProfile) return;
    try {
      await userService.blockUser(currentUser.id, profile.id, options);
      useAuthStore.getState().updateBlockEntry('add', profile.id, options);
      toast.success(TOAST_MESSAGES.BLOCK.BLOCK_SUCCESS);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.BLOCK_FAILED);
      throw new Error('block failed');
    }
  }, [currentUser, profile, isOwnProfile]);

  const handleUnblockUser = useCallback(async () => {
    if (!currentUser || !profile || isOwnProfile) return;
    try {
      await userService.unblockUser(currentUser.id, profile.id);
      useAuthStore.getState().updateBlockEntry('remove', profile.id);
      toast.success(TOAST_MESSAGES.BLOCK.UNBLOCK_SUCCESS);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.UNBLOCK_FAILED);
    }
  }, [currentUser, profile, isOwnProfile]);

  return {
    isBlockedByMe,
    isActivityBlockedByPartner,
    currentBlockOptions,
    isBlockModalOpen,
    handleOpenBlockModal,
    handleApplyBlock,
    handleUnblockUser,
    closeBlockModal: () => setIsBlockModalOpen(false),
  };
};
