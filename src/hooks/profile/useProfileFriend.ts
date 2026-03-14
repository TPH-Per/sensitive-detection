import { useState, useEffect, useCallback, useRef } from 'react';
import { User, UserStatus, FriendRequest, FriendStatus } from '../../types';
import { friendService } from '../../services/friendService';
import { toast } from '../../store/toastStore';
import { useFriendIds } from '../utils';
import { TOAST_MESSAGES } from '../../constants';

interface UseProfileFriendProps {
  currentUser: User | null;
  profile: User | null;
  profileUserId: string | undefined;
  isOwnProfile: boolean;
  loadProfile: () => Promise<void>;
}

// Xử lý friend request và friend status
export const useProfileFriend = ({
  currentUser,
  profile,
  profileUserId,
  isOwnProfile,
  loadProfile
}: UseProfileFriendProps) => {
  const [friendStatus, setFriendStatus] = useState<FriendStatus>(FriendStatus.NOT_FRIEND);
  const [pendingRequestId, setPendingRequestId] = useState<string | undefined>();
  const friendIds = useFriendIds();

  // Dùng chung cho 2 callbacks, không bị stale closure
  const sentRequestRef = useRef<FriendRequest | null>(null);
  const receivedRequestRef = useRef<FriendRequest | null>(null);

  useEffect(() => {
    if (!currentUser || !profileUserId || isOwnProfile) return;

    const updateStatus = () => {
      if (friendIds.includes(profileUserId)) {
        setFriendStatus(FriendStatus.FRIEND);
        setPendingRequestId(undefined);
        return;
      }

      if (sentRequestRef.current) {
        setFriendStatus(FriendStatus.PENDING_SENT);
        setPendingRequestId(sentRequestRef.current.id);
      } else if (receivedRequestRef.current) {
        setFriendStatus(FriendStatus.PENDING_RECEIVED);
        setPendingRequestId(receivedRequestRef.current.id);
      } else {
        setFriendStatus(FriendStatus.NOT_FRIEND);
        setPendingRequestId(undefined);
      }
    };

    const unsubscribeSent = friendService.subscribeToSentRequests(currentUser.id, (requests) => {
      sentRequestRef.current = requests.find(r => r.receiverId === profileUserId) || null;
      updateStatus();
    });

    const unsubscribeReceived = friendService.subscribeToReceivedRequests(currentUser.id, (requests) => {
      receivedRequestRef.current = requests.find(r => r.senderId === profileUserId) || null;
      updateStatus();
    });

    // Trigger update khi friendIds thay đổi
    updateStatus();

    return () => {
      unsubscribeSent();
      unsubscribeReceived();
      // Xóa data cũ khi profileUserId đổi
      sentRequestRef.current = null;
      receivedRequestRef.current = null;
    };
  }, [currentUser, profileUserId, isOwnProfile, friendIds]);

  const handleFriendAction = useCallback(async (): Promise<{ needConfirm: boolean }> => {
    if (!currentUser || !profile || isOwnProfile) return { needConfirm: false };

    if (profile.status === UserStatus.BANNED) {
      toast.error(TOAST_MESSAGES.FRIEND.BLOCKED_USER);
      return { needConfirm: false };
    }

    try {
      if (friendStatus === FriendStatus.FRIEND) {
        return { needConfirm: true };
      }

      if (friendStatus === FriendStatus.PENDING_RECEIVED && pendingRequestId) {
        const request = receivedRequestRef.current;
        if (!request) return { needConfirm: false };
        await friendService.acceptFriendRequest(pendingRequestId, request.senderId, currentUser.id);
        toast.success(TOAST_MESSAGES.FRIEND.ACCEPT_SUCCESS);
        return { needConfirm: false };
      }

      if (friendStatus === FriendStatus.PENDING_SENT && pendingRequestId) {
        await friendService.cancelFriendRequest(pendingRequestId);
        toast.success(TOAST_MESSAGES.FRIEND.CANCEL_SUCCESS);
        return { needConfirm: false };
      }

      if (friendStatus === FriendStatus.NOT_FRIEND) {
        await friendService.sendFriendRequest(currentUser.id, profile.id);
        toast.success(TOAST_MESSAGES.FRIEND.SEND_SUCCESS);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(TOAST_MESSAGES.FRIEND.ACTION_FAILED(err.message));
    }

    return { needConfirm: false };
  }, [currentUser, profile, isOwnProfile, friendStatus, pendingRequestId]);

  const confirmUnfriend = useCallback(async () => {
    if (!currentUser || !profile) return;
    try {
      await friendService.unfriend(currentUser.id, profile.id);
      toast.success(TOAST_MESSAGES.FRIEND.UNFRIEND_SUCCESS);
      await loadProfile();
    } catch (error) {
      toast.error(TOAST_MESSAGES.FRIEND.UNFRIEND_FAILED);
    }
  }, [currentUser, profile, loadProfile]);

  return {
    friendStatus,
    pendingRequestId,
    handleFriendAction,
    confirmUnfriend,
  };
};
