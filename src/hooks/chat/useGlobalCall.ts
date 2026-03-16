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

    /**
     * Caller nhận được tín hiệu accepted từ callee (chỉ 1-1)
     */
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

    /**
     * Caller nhận được tín hiệu rejected từ callee (chỉ 1-1)
     */
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

    /**
     * Caller hủy hoặc callee bị mất kết nối (chỉ 1-1)
     */
    const handleCallEnded = useCallback(async () => {
        try {
            if (callConversationId && callPhase === 'in-call') {
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
                    
                    if (isCaller || !activeCall.participants || Object.keys(activeCall.participants).length <= 1) {
                        await rtdbCallService.endActiveCall(callConversationId);
                    }
                }
            }
        } catch (error) {
            console.error('[useGlobalCall] Lỗi khi kết thúc cuộc gọi:', error);
        } finally {
            if (callPhase === 'in-call') playSound('ended');
            resetCall();
        }
    }, [isCaller, callConversationId, callPhase, isGroupCall, callStartTime, callType, updateCallMessage, playSound, resetCall]);

    const { incomingCall, startCall, acceptCall, rejectCall, endCall } = useCallSignaling(userId, {
        onCallAccepted: handleCallAccepted,
        onCallRejected: handleCallRejected,
        onCallEnded: handleCallEnded,
    });

    const syncActions = useCallback(() => {
        setSignalingActions({ startCall, acceptCall, rejectCall, endCall });
    }, [setSignalingActions, startCall, acceptCall, rejectCall, endCall]);

    /**
     * Callee chấp nhận cuộc gọi đến
     */
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
        playSound('connected');
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
        playSound,
    ]);

    /**
     * Callee từ chối cuộc gọi đến
     */
    const handleRejectIncoming = useCallback(async () => {
        if (!incomingCall) return;
        await rejectCall(incomingCall);
        resetCall();
    }, [incomingCall, rejectCall, resetCall]);

    return {
        incomingCall,
        endCall,
        syncActions,
        handleAcceptIncoming,
        handleRejectIncoming,
    };
}
