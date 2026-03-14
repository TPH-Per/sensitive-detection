import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, RtdbConversation, BlockOptions } from '../../types';
import { userService } from '../../services/userService';
import { useUserCache } from '../../store/userCacheStore';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import { TOAST_MESSAGES } from '../../constants';
import { usePostStore } from '../../store/postStore';
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
  conversation,
}: UseChatBlockProps) => {
  const [partnerStatus, setPartnerStatus] = useState<'active' | 'banned' | undefined>();
  const [isBlockedByPartner, setIsBlockedByPartner] = useState(false);
  const [isCallBlockedByPartner, setIsCallBlockedByPartner] = useState(false);

  const myBlockedUsers = useAuthStore(state => state.blockedUsers);

  const myBlockOptions = useMemo(() =>
    partnerId ? myBlockedUsers[partnerId] : undefined,
    [partnerId, myBlockedUsers]
  );

  const isBlockedByMe = !!myBlockOptions;
  const isMessageBlockedByMe = !!myBlockOptions?.blockMessages;
  const isCallBlockedByMe = !!myBlockOptions?.blockCalls;

  // Bị partner chặn tin nhắn
  const isBlocked = isMessageBlockedByMe || isBlockedByPartner;

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

  // Subscribe realtime để biết bị partner chặn tin nhắn
  useEffect(() => {
    if (!partnerId || !currentUser || isGroup) {
      setIsBlockedByPartner(false);
      return;
    }

    const blockRef = doc(db, 'users', partnerId, 'blockedUsers', currentUser.id);
    const unsub = onSnapshot(blockRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsBlockedByPartner(data.blockMessages === true);
        setIsCallBlockedByPartner(data.blockCalls === true);
      } else {
        setIsBlockedByPartner(false);
        setIsCallBlockedByPartner(false);
      }
    });
    return () => unsub();
  }, [partnerId, currentUser, isGroup]);

  const getBlockedMessage = useCallback((): string | undefined => {
    if (!isGroup && partnerId) {
      const currentStatus = partnerStatus || partner?.status || usersMap[partnerId]?.status;
      if (currentStatus === 'banned') return 'Không thể gửi tin nhắn - Người dùng này đã bị khóa tài khoản.';
      if (isMessageBlockedByMe) return 'Bạn đã chặn tin nhắn từ người này. Bỏ chặn để gửi tin nhắn.';
      if (isBlockedByPartner) return 'Không thể gửi tin nhắn cho người dùng này.';
    }
    return undefined;
  }, [isGroup, partnerId, partnerStatus, partner, usersMap, isMessageBlockedByMe, isBlockedByPartner]);

  const blockedMessage = useMemo(() => getBlockedMessage(), [getBlockedMessage]);

  const handleUnblock = useCallback(async () => {
    if (!partnerId || !currentUser) return;
    try {
      await userService.unblockUser(currentUser.id, partnerId);
      useAuthStore.getState().updateBlockEntry('remove', partnerId);
      
      usePostStore.getState().refreshFeed(currentUser.id);
      
      toast.success(TOAST_MESSAGES.BLOCK.UNBLOCK_SUCCESS);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.UNBLOCK_FAILED);
    }
  }, [partnerId, currentUser]);

  const handleApplyBlock = useCallback(async (options: BlockOptions) => {
    if (!partnerId || !currentUser) return;
    
    const hasAnyOption = options.blockMessages || 
                        options.blockCalls || 
                        options.blockViewMyActivity || 
                        options.hideTheirActivity;
    
    if (!hasAnyOption) {
      return handleUnblock();
    }

    try {
      await userService.blockUser(currentUser.id, partnerId, options);
      useAuthStore.getState().updateBlockEntry('add', partnerId, options);
      
      if (options.hideTheirActivity) {
        usePostStore.getState().filterPostsByAuthor(partnerId);
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
    isBlockedByPartner,
    isCallBlockedByPartner,
    myBlockOptions,
    partnerStatus,
    getBlockedMessage,
    handleApplyBlock,
    handleUnblock,
    blockedMessage,
  };
};
