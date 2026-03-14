import { useEffect, useState } from 'react';
import { rtdbCallService } from '../services/chat/rtdbCallService';
import { RtdbCallSignaling } from '../types';
import { useCallStore } from '../store/callStore';

/**
 * Hook to manage RTDB call signaling
 */
export const useRtdbCall = (userId: string | null) => {
    const [incomingCall, setIncomingCall] = useState<RtdbCallSignaling | null>(null);
    const { setCallPhase, setCallType, setActiveRoomId, setOtherUserIds, setIsCaller, setCallConversationId } = useCallStore();

    // Subscribe to incoming calls
    useEffect(() => {
        if (!userId) return;

        const unsubscribe = rtdbCallService.subscribeToIncomingCall(userId, (callData) => {
            if (callData && callData.status === 'ringing') {
                setIncomingCall(callData);
                setCallPhase('outgoing');
                setCallType(callData.callType);
                setOtherUserIds([callData.callerId]);
                setIsCaller(false);
                setCallConversationId(callData.conversationId);
            } else {
                setIncomingCall(null);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [userId, setCallPhase, setCallType, setOtherUserIds, setIsCaller, setCallConversationId]);

    /**
     * Initiate a call
     */
    const initiateCall = async (
        calleeId: string,
        convId: string,
        callType: 'video' | 'voice',
        zegoToken: string
    ) => {
        if (!userId) throw new Error('User not authenticated');

        try {
            await rtdbCallService.initiateCall(userId, calleeId, convId, callType, zegoToken);
            setCallPhase('outgoing');
            setCallType(callType);
            setOtherUserIds([calleeId]);
            setIsCaller(true);
            setCallConversationId(convId);
        } catch (error) {
            console.error('[useRtdbCall] Lỗi initiateCall:', error);
            throw error;
        }
    };

    /**
     * Accept incoming call
     */
    const acceptCall = async () => {
        if (!userId || !incomingCall) return;

        try {
            await rtdbCallService.answerCall(userId, 'accepted');
            setCallPhase('in-call');
            setActiveRoomId(incomingCall.conversationId);
        } catch (error) {
            console.error('[useRtdbCall] Lỗi acceptCall:', error);
            throw error;
        }
    };

    /**
     * Reject incoming call
     */
    const rejectCall = async () => {
        if (!userId || !incomingCall) return;

        try {
            await rtdbCallService.answerCall(userId, 'rejected');
            await rtdbCallService.clearSignaling(userId);
            setIncomingCall(null);
            setCallPhase('idle');
        } catch (error) {
            console.error('[useRtdbCall] Lỗi rejectCall:', error);
            throw error;
        }
    };

    /**
     * End call
     */
    const endCall = async () => {
        if (!userId) return;

        try {
            await rtdbCallService.clearSignaling(userId);

            // Clear signaling for other participants if caller
            if (incomingCall && useCallStore.getState().isCaller) {
                for (const otherUserId of useCallStore.getState().otherUserIds) {
                    await rtdbCallService.clearSignaling(otherUserId);
                }
            }

            setIncomingCall(null);
            useCallStore.getState().resetCall();
        } catch (error) {
            console.error('[useRtdbCall] Lỗi endCall:', error);
            throw error;
        }
    };

    return {
        incomingCall,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall
    };
};
