import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, RtdbConversation, BlockOptions, UserStatus } from '../../../shared/types';
import { userService } from '../../services/userService';
import { useUserCache } from '../../store/userCacheStore';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { TOAST_MESSAGES } from '../../constants';
import { usePostStore } from '../../store';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';

interface UseChatBlockProps {
  partnerId: string | null;
  currentUser: User | null;
  partner: User | null;
  isGroup: boolean;
  usersMap: Record<string, User>;
  conversation?: RtdbConversation;
}

// Xử lý logic block/unblock và kiểm tra quyền trong chat
export const useChatBlock = ({
  partnerId,
  currentUser,
  partner,
  isGroup,
  usersMap,
}: UseChatBlockProps) => {
  const [partnerStatus, setPartnerStatus] = useState<UserStatus | undefined>();
  const [isMessageBlockedByPartner, setIsMessageBlockedByPartner] = useState(false);
  const [isCallBlockedByPartner, setIsCallBlockedByPartner] = useState(false);

  const myBlockedUsers = useAuthStore(state => state.blockedUsers);

  const myBlockOptions = useMemo(() =>
    partnerId ? myBlockedUsers[partnerId] : undefined,
    [partnerId, myBlockedUsers]
  );

  const isBlockedByMe = !!myBlockOptions;
  const isMessageBlockedByMe = !!myBlockOptions?.blockMessages;
  const isCallBlockedByMe = !!myBlockOptions?.blockCalls;

  const isBlocked = isMessageBlockedByMe || isMessageBlockedByPartner || partnerStatus === UserStatus.BANNED;
  const shouldShowBlockBanner = isBlockedByMe;

  useEffect(() => {
    if (!partnerId) {
      setPartnerStatus(undefined);
      return;
    }

    const unsub = userService.subscribeToUser(partnerId, (u) => {
      setPartnerStatus(u.status);
      useUserCache.getState().setUser(u);
    });
    return () => unsub();
  }, [partnerId]);

  // Lắng nghe realtime: partner có blockMessages/blockCalls cho tôi không
  useEffect(() => {
    if (!partnerId || !currentUser || isGroup) {
      setIsMessageBlockedByPartner(false);
      setIsCallBlockedByPartner(false);
      return;
    }

    const blockRef = doc(db, 'users', partnerId, 'blockedUsers', currentUser.id);
    const unsub = onSnapshot(blockRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsMessageBlockedByPartner(data.blockMessages === true);
        setIsCallBlockedByPartner(data.blockCalls === true);
      } else {
        setIsMessageBlockedByPartner(false);
        setIsCallBlockedByPartner(false);
      }
    });
    return () => unsub();
  }, [partnerId, currentUser, isGroup]);

  const getBlockedMessage = useCallback((): string | undefined => {
    if (!isGroup && partnerId) {
      const currentStatus = partnerStatus || partner?.status || usersMap[partnerId]?.status;
      if (currentStatus === UserStatus.BANNED) return 'Không thể gửi tin nhắn - Người dùng này đã bị khóa tài khoản.';
      if (isMessageBlockedByMe) return 'Bạn đã chặn liên lạc với người này. Bỏ chặn để gửi tin nhắn.';
      if (isMessageBlockedByPartner) return 'Không thể gửi tin nhắn cho người dùng này.';
    }
    return undefined;
  }, [isGroup, partnerId, partnerStatus, partner, usersMap, isMessageBlockedByMe, isMessageBlockedByPartner]);

  const blockedMessage = useMemo(() => getBlockedMessage(), [getBlockedMessage]);

  const handleUnblock = useCallback(async (targetIdOverride?: string) => {
    const finalTargetId = targetIdOverride || partnerId;
    if (!finalTargetId || !currentUser) return;
    try {
      await userService.unblockUser(currentUser.id, finalTargetId);
      useAuthStore.getState().updateBlockEntry('remove', finalTargetId);
      usePostStore.getState().refreshFeed(currentUser.id);
      toast.success(TOAST_MESSAGES.BLOCK.UNBLOCK_SUCCESS);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.UNBLOCK_FAILED);
    }
  }, [partnerId, currentUser]);

  const handleApplyBlock = useCallback(async (options: BlockOptions, targetIdOverride?: string) => {
    const finalTargetId = targetIdOverride || partnerId;
    if (!finalTargetId || !currentUser) return;

    const hasAnyOption = options.blockMessages || options.blockCalls
      || options.blockViewMyActivity || options.hideTheirActivity;

    if (!hasAnyOption) {
      return handleUnblock(finalTargetId);
    }

    try {
      await userService.blockUser(currentUser.id, finalTargetId, options);
      useAuthStore.getState().updateBlockEntry('add', finalTargetId, options);

      if (options.hideTheirActivity) {
        usePostStore.getState().filterPostsByAuthor(finalTargetId);
      }

      toast.success(TOAST_MESSAGES.BLOCK.BLOCK_SUCCESS);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.BLOCK_FAILED);
    }
  }, [partnerId, currentUser, handleUnblock]);

  return {
    isBlocked,
    isBlockedByMe,
    isMessageBlockedByMe,
    isCallBlockedByMe,
    isBlockedByPartner: isMessageBlockedByPartner,
    isCallBlockedByPartner,
    myBlockOptions,
    partnerStatus,
    getBlockedMessage,
    handleApplyBlock,
    handleUnblock,
    blockedMessage,
    shouldShowBlockBanner,
  };
};
