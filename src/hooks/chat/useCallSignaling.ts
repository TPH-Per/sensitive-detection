import { useEffect, useState, useCallback, useRef } from 'react';
import { rtdbCallService } from '../../services/chat/rtdbCallService';
import { RtdbCallSignaling } from '../../../shared/types';

interface UseCallSignalingOptions {
  onCallAccepted?: (signal: RtdbCallSignaling) => void;
  onCallRejected?: () => void;
  onCallEnded?: () => void;
}

export function useCallSignaling(
  currentUserId: string,
  options: UseCallSignalingOptions = {},
) {
  const [incomingCall, setIncomingCall] = useState<RtdbCallSignaling | null>(null);

  const onAcceptedRef = useRef(options.onCallAccepted);
  const onRejectedRef = useRef(options.onCallRejected);
  const onEndedRef = useRef(options.onCallEnded);
  useEffect(() => { onAcceptedRef.current = options.onCallAccepted; });
  useEffect(() => { onRejectedRef.current = options.onCallRejected; });
  useEffect(() => { onEndedRef.current = options.onCallEnded; });

  const isAcceptingRef = useRef(false);
  const hasIncomingRef = useRef(false);

  useEffect(() => {
    if (!currentUserId) return;

    const unsubscribe = rtdbCallService.subscribeToIncomingCall(currentUserId, (data) => {
      if (!data) {
        if (hasIncomingRef.current && !isAcceptingRef.current) {
          onEndedRef.current?.();
        }
        hasIncomingRef.current = false;
        isAcceptingRef.current = false;
        setIncomingCall(null);
        return;
      }

      if (data.callerId === currentUserId) {
        if (data.status === 'accepted') {
          onAcceptedRef.current?.(data);
        } else if (data.status === 'rejected') {
          onRejectedRef.current?.();
        }
      } else {
        if (data.status === 'ringing') {
          hasIncomingRef.current = true;
          setIncomingCall(data);
        } else {
          hasIncomingRef.current = false;
          setIncomingCall(null);
        }
      }
    });

    return () => {
      unsubscribe();
      hasIncomingRef.current = false;
      isAcceptingRef.current = false;
    };
  }, [currentUserId]);

  const startCall = useCallback(
    async (
      recipientIds: string[],
      callerId: string,
      callerName: string,
      callerAvatar: string,
      callType: 'voice' | 'video',
      conversationId: string,
      isGroupCall = false,
    ) => {
      return rtdbCallService.initiateCall(
        callerId,
        recipientIds,
        conversationId,
        callType,
        callerName,
        callerAvatar,
        isGroupCall,
      );
    },
    [],
  );

  const acceptCall = useCallback(
    async (signal: RtdbCallSignaling) => {
      isAcceptingRef.current = true;
      await rtdbCallService.answerCall(
        currentUserId,
        signal.callerId,
        'accepted',
        signal.isGroupCall,
      );
    },
    [currentUserId],
  );

  const rejectCall = useCallback(
    async (signal: RtdbCallSignaling) => {
      await rtdbCallService.answerCall(
        currentUserId,
        signal.callerId,
        'rejected',
        signal.isGroupCall,
      );
    },
    [currentUserId],
  );

    const endCall = useCallback(
    async (otherUserIds: string[] = []) => {
      await rtdbCallService.answerCall(currentUserId, currentUserId, 'ended', false);
      if (otherUserIds.length > 0) {
        for (const id of otherUserIds) {
          await rtdbCallService.answerCall(id, currentUserId, 'ended', false);
        }
      }
      setTimeout(async () => {
        await rtdbCallService.clearSignaling(currentUserId);
        if (otherUserIds.length > 0) {
          await rtdbCallService.clearSignalingForUsers(otherUserIds);
        }
      }, 1000);
    },
    [currentUserId],
  );

  return { incomingCall, startCall, acceptCall, rejectCall, endCall };
}
