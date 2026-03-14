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
  { onCallAccepted, onCallRejected, onCallEnded }: UseCallSignalingOptions = {},
) {
  const [incomingCall, setIncomingCall] = useState<RtdbCallSignaling | null>(null);

  const onAcceptedRef = useRef(onCallAccepted);
  const onRejectedRef = useRef(onCallRejected);
  const onEndedRef = useRef(onCallEnded);
  
  useEffect(() => { onAcceptedRef.current = onCallAccepted; }, [onCallAccepted]);
  useEffect(() => { onRejectedRef.current = onCallRejected; }, [onCallRejected]);
  useEffect(() => { onEndedRef.current = onCallEnded; }, [onCallEnded]);

  const isAcceptingRef = useRef(false);

  useEffect(() => {
    if (!currentUserId) return;

    const unsubscribe = rtdbCallService.subscribeToIncomingCall(currentUserId, (data) => {
      if (!data) {
        if (incomingCall && !isAcceptingRef.current) {
          onEndedRef.current?.();
        }
        setIncomingCall(null);
        isAcceptingRef.current = false;
        return;
      }

      if (data.callerId !== currentUserId) {
        if (data.status === 'ringing') {
          setIncomingCall(data);
        } else {
          setIncomingCall(null);
        }
      } else {
        if (data.status === 'accepted') {
          onAcceptedRef.current?.(data);
        } else if (data.status === 'rejected') {
          onRejectedRef.current?.();
        }
      }
    });

    return () => unsubscribe();
  }, [currentUserId, incomingCall]);

  const startCall = useCallback(async (
    recipientIds: string[],
    callerId: string,
    callerName: string,
    callerAvatar: string,
    callType: 'voice' | 'video',
    conversationId: string,
    isGroupCall?: boolean,
  ) => {
    return await rtdbCallService.initiateCall(
      callerId,
      recipientIds,
      conversationId,
      callType,
      '',
      callerName,
      callerAvatar,
      isGroupCall
    );
  }, []);

  const acceptCall = useCallback(async (signal: RtdbCallSignaling) => {
    isAcceptingRef.current = true;
    if (currentUserId) {
        await rtdbCallService.answerCall(
          currentUserId, 
          signal.callerId, 
          'accepted', 
          signal.isGroupCall
        );
    }
  }, [currentUserId]);

  const rejectCall = useCallback(async (signal: RtdbCallSignaling) => {
    if (currentUserId) {
        await rtdbCallService.answerCall(
          currentUserId, 
          signal.callerId, 
          'rejected', 
          signal.isGroupCall
        );
    }
  }, [currentUserId]);

  const endCall = useCallback(async (otherUserIds?: string[]) => {
    if (currentUserId) {
        await rtdbCallService.clearSignaling(currentUserId);
    }
    if (otherUserIds && otherUserIds.length > 0) {
        await rtdbCallService.clearSignalingForUsers(otherUserIds);
    }
  }, [currentUserId]);

  return { incomingCall, startCall, acceptCall, rejectCall, endCall };
}
