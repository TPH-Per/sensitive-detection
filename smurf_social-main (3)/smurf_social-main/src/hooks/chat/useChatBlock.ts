import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, RtdbConversation, BlockOptions, UserStatus, UserSettings } from '../../../shared/types';
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
  isFriend?: boolean;
}

export const useChatBlock = ({
  partnerId,
  currentUser,
  partner,
  isGroup,
  usersMap,
  conversation,
  isFriend = true,
}: UseChatBlockProps) => {
  const [partnerStatus, setPartnerStatus] = useState<UserStatus | undefined>();
  const [isMessageBlockedByPartner, setIsMessageBlockedByPartner] = useState(false);
  const [isCallBlockedByPartner, setIsCallBlockedByPartner] = useState(false);
  const [isPartnerBlockingStrangers, setIsPartnerBlockingStrangers] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const { settings, blockedUsers: myBlockedUsers } = useAuthStore();

  const myBlockOptions = useMemo(() =>
    partnerId ? myBlockedUsers[partnerId] : undefined,
    [partnerId, myBlockedUsers]
  );

  const isBlockedByMe = !!myBlockOptions?.blockMessages;
  const isMessageBlockedByMe = !!myBlockOptions?.blockMessages;
  const isCallBlockedByMe = !!myBlockOptions?.blockCalls;
  const isFullyBlockedByMe = !!myBlockOptions && 
    myBlockOptions.blockMessages && 
    myBlockOptions.blockCalls && 
    myBlockOptions.blockViewMyActivity && 
    myBlockOptions.hideTheirActivity;

  const isBlocked = isMessageBlockedByMe || isMessageBlockedByPartner || partnerStatus === UserStatus.BANNED;
  const shouldShowBlockBanner = !!myBlockOptions;

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

  useEffect(() => {
    if (!partnerId || !currentUser || isGroup) {
      setIsMessageBlockedByPartner(false);
      setIsCallBlockedByPartner(false);
      setIsLoadingSettings(false);
      return;
    }

    setIsLoadingSettings(true);
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

  useEffect(() => {
    if (!partnerId || isGroup || isFriend || !currentUser) {
      setIsPartnerBlockingStrangers(false);
      setIsLoadingSettings(false);
      return;
    }

    const settingsRef = doc(db, 'users', partnerId, 'private', 'settings');
    const unsub = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserSettings;
        setIsPartnerBlockingStrangers(data.allowMessagesFromStrangers === false);
      } else {
        setIsPartnerBlockingStrangers(false);
      }
      setIsLoadingSettings(false);
    }, () => {
      setIsPartnerBlockingStrangers(false);
      setIsLoadingSettings(false);
    });

    return () => unsub();
  }, [partnerId, isGroup, isFriend, currentUser]);

  const { blockedMessage } = useMemo(() => {
    if (!isGroup && partnerId) {
      const currentStatus = partnerStatus || partner?.status || usersMap[partnerId]?.status;
      if (currentStatus === UserStatus.BANNED) return { blockedMessage: 'Không thể gửi tin nhắn - Người dùng này đã bị khóa tài khoản.' };
      if (isMessageBlockedByMe) return { blockedMessage: 'Bạn đã chặn liên lạc với người này. Bỏ chặn để gửi tin nhắn.' };
      if (isMessageBlockedByPartner) return { blockedMessage: 'Không thể gửi tin nhắn cho người dùng này.' };
      
      if (!isFriend) {
        if (isPartnerBlockingStrangers) {
          let canBypass = false;
          let hasTalked = false;
          
          if (conversation && conversation.lastMessageAt && partnerId && conversation.lastMessageAt[partnerId]) {
            hasTalked = true;
            const lastTimePartnerSent = conversation.lastMessageAt[partnerId];
            if (Date.now() - lastTimePartnerSent < 24 * 60 * 60 * 1000) {
              canBypass = true;
            }
          }
          
          if (!canBypass) {
            return {
              blockedMessage: hasTalked 
                ? 'Cuộc trò chuyện đã quá 24h. Người này không nhận tin nhắn từ người lạ.'
                : 'Người dùng này không nhận tin nhắn từ người lạ.',
            };
          }
        }
      }
    }
    return { blockedMessage: undefined };
  }, [isGroup, partnerId, partnerStatus, partner, usersMap, isMessageBlockedByMe, isMessageBlockedByPartner, isFriend, isPartnerBlockingStrangers, conversation, currentUser]);

  const handleUnblock = useCallback(async (targetIdOverride?: string) => {
    const finalTargetId = targetIdOverride || partnerId;
    if (!finalTargetId || !currentUser) return;
    try {
      await useAuthStore.getState().updateBlockEntry('remove', finalTargetId);
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
      await useAuthStore.getState().updateBlockEntry('add', finalTargetId, options);

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
    handleApplyBlock,
    handleUnblock,
    blockedMessage,
    shouldShowBlockBanner,
    isLoadingSettings,
  };
};
