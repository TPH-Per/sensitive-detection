import { useCallback } from 'react';
import { useCallStore } from '../../store/callStore';
import { useCallSignaling } from './useCallSignaling';
import { useCallSounds } from './useCallSounds';
import { rtdbCallService } from '../../services/chat/rtdbCallService';
import { useRtdbChatStore } from '../../store';
import { RtdbCallSignaling } from '../../../shared/types';

export function useGlobalCall(userId: string) {
    const {
        callPhase,
        callType,
        isGroupCall,
        isCaller,
        callStartTime,
        callConversationId,
        otherUserIds,
        setCallPhase,
        setCallType,
        setActiveRoomId,
        setOtherUserIds,
        setIsGroupCall,
        setIsCaller,
        setCallStartTime,
        setSignalingActions,
        resetCall,
    } = useCallStore();

    const { playSound } = useCallSounds();
    const updateCallMessage = useRtdbChatStore((s) => s.updateCallMessage);

    const handleCallAccepted = useCallback(
        async (signal: RtdbCallSignaling) => {
            if (signal.isGroupCall) return;
            setActiveRoomId(signal.conversationId);
            setCallType(signal.callType);
            setCallPhase('in-call');
            setCallStartTime(Date.now());
            playSound('connected');
        },
        [setActiveRoomId, setCallType, setCallPhase, setCallStartTime, playSound],
    );

    const handleCallRejected = useCallback(async () => {
        if (isCaller && callConversationId) {
            const activeCall = await rtdbCallService.getActiveCall(callConversationId);
            if (activeCall?.messageId) {
                await updateCallMessage(callConversationId, activeCall.messageId, {
                    callType,
                    status: 'rejected',
                });
                await rtdbCallService.endActiveCall(callConversationId);
            }
        }
        playSound('busy');
        resetCall();
    }, [isCaller, callConversationId, callType, updateCallMessage, playSound, resetCall]);

    const handleCallEnded = useCallback(async () => {
        if (isCaller && callConversationId && callPhase === 'in-call' && !isGroupCall) {
            const activeCall = await rtdbCallService.getActiveCall(callConversationId);
            if (activeCall?.messageId) {
                const duration = callStartTime
                    ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000))
                    : 0;
                await updateCallMessage(callConversationId, activeCall.messageId, {
                    callType,
                    status: 'ended',
                    duration,
                });
                await rtdbCallService.endActiveCall(callConversationId);
            }
        }
        if (callPhase === 'in-call') playSound('ended');
        resetCall();
    }, [
        isCaller,
        callConversationId,
        callPhase,
        isGroupCall,
        callStartTime,
        callType,
        updateCallMessage,
        playSound,
        resetCall,
    ]);

    const { incomingCall, startCall, acceptCall, rejectCall, endCall } = useCallSignaling(userId, {
        onCallAccepted: handleCallAccepted,
        onCallRejected: handleCallRejected,
        onCallEnded: handleCallEnded,
    });

    // Sync signaling actions into the store so ChatPage can call them
    const syncActions = useCallback(() => {
        setSignalingActions({ startCall, acceptCall, rejectCall, endCall });
    }, [setSignalingActions, startCall, acceptCall, rejectCall, endCall]);

    const handleAcceptIncoming = useCallback(async () => {
        if (!incomingCall) return;
        await acceptCall(incomingCall);
        setCallType(incomingCall.callType);
        setActiveRoomId(incomingCall.conversationId);
        setOtherUserIds([incomingCall.callerId]);
        setIsGroupCall(incomingCall.isGroupCall ?? false);
        setIsCaller(false);
        setCallPhase('in-call');
        setCallStartTime(Date.now());
    }, [
        incomingCall,
        acceptCall,
        setCallType,
        setActiveRoomId,
        setOtherUserIds,
        setIsGroupCall,
        setIsCaller,
        setCallPhase,
        setCallStartTime,
    ]);

    const handleRejectIncoming = useCallback(async () => {
        if (!incomingCall) return;
        await rejectCall(incomingCall);
        resetCall();
    }, [incomingCall, rejectCall, resetCall]);

    return {
        incomingCall,
        endCall,
        otherUserIds,
        syncActions,
        handleAcceptIncoming,
        handleRejectIncoming,
    };
}
