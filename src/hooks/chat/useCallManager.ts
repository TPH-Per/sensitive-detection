import { useEffect, useCallback, useRef } from 'react';
import { useCallStore } from '../../store/callStore';
import { useCallSounds } from './useCallSounds';
import { rtdbCallService } from '../../services/chat/rtdbCallService';
import { useRtdbChatStore } from '../../store';
import { RtdbCallSignaling } from '../../../shared/types';

export function useCallManager(currentUserId: string) {
    const { 
        phase, session, incomingSignal, 
        setPhase, setSession, setIncomingSignal, resetCall 
    } = useCallStore();

    const { playSound } = useCallSounds();
    const updateCallMessage = useRtdbChatStore((s) => s.updateCallMessage);
    
    // Refs để tránh closure stale
    const phaseRef = useRef(phase);
    const sessionRef = useRef(session);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { sessionRef.current = session; }, [session]);

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        resetCall();
    }, [resetCall]);

    // Subscribing to signaling
    useEffect(() => {
        if (!currentUserId) return;

        const unsubscribe = rtdbCallService.subscribeToIncomingCall(currentUserId, async (data) => {
            if (!data) {
                if (phaseRef.current !== 'idle') {
                    if (phaseRef.current === 'in-call') playSound('ended');
                    cleanup();
                }
                return;
            }

            // Caller side
            if (data.callerId === currentUserId) {
                if (data.status === 'accepted') {
                    if (sessionRef.current) {
                        setPhase('in-call');
                        setSession({
                            ...sessionRef.current,
                            startTime: Date.now(),
                        });
                        playSound('connected');
                    }
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                } 
                else if (data.status === 'rejected' || data.status === 'busy') {
                    if (sessionRef.current?.conversationId) {
                        await rtdbCallService.endCallSession(
                            sessionRef.current.conversationId, 
                            updateCallMessage, 
                            data.status
                        );
                    }
                    playSound('busy');
                    cleanup();
                }
            } 
            // Callee side
            else {
                if (data.status === 'ringing') {
                    if (phaseRef.current !== 'idle') {
                        await rtdbCallService.answerCall(currentUserId, data.callerId, 'busy', data.isGroupCall);
                        return;
                    }
                    setIncomingSignal(data);
                    setPhase('incoming');
                } else {
                    cleanup();
                }
            }
        });

        return () => {
            unsubscribe();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [currentUserId, setPhase, setSession, setIncomingSignal, playSound, cleanup, updateCallMessage]);

    const startCall = useCallback(async (
        recipientIds: string[],
        callerName: string,
        callerAvatar: string,
        callType: 'voice' | 'video',
        conversationId: string,
        isGroupCall = false,
        calleeName?: string,
        calleeAvatar?: string
    ) => {
        // 1. Tạo tin nhắn khởi tạo
        const sendCallMessage = useRtdbChatStore.getState().sendCallMessage;
        const msgId = await sendCallMessage(conversationId, currentUserId, {
            callType,
            status: 'started',
        });

        // 2. Kích hoạt Active Node
        await rtdbCallService.startActiveCall(conversationId, currentUserId, callType, msgId);

        // 3. Gửi signaling
        const result = await rtdbCallService.initiateCall(
            currentUserId, recipientIds, conversationId, callType, callerName, callerAvatar, isGroupCall
        );

        if (result.success) {
            setPhase('outgoing');
            setSession({
                conversationId,
                callType,
                isGroupCall,
                participants: recipientIds,
                isCaller: true,
                roomId: conversationId,
                calleeName,
                calleeAvatar
            });

            timeoutRef.current = setTimeout(async () => {
                await rtdbCallService.clearSignalingForUsers([currentUserId, ...recipientIds]);
                await rtdbCallService.endCallSession(conversationId, updateCallMessage, 'missed');
                cleanup();
            }, 30000);
        } else {
            await rtdbCallService.endActiveCall(conversationId);
        }

        return result;
    }, [currentUserId, setPhase, setSession, updateCallMessage, cleanup]);

    const acceptCall = useCallback(async () => {
        if (!incomingSignal) return;
        
        await rtdbCallService.answerCall(
            currentUserId, incomingSignal.callerId, 'accepted', incomingSignal.isGroupCall
        );

        setPhase('in-call');
        setSession({
            conversationId: incomingSignal.conversationId,
            callType: incomingSignal.callType,
            isGroupCall: !!incomingSignal.isGroupCall,
            participants: [incomingSignal.callerId],
            startTime: Date.now(),
            isCaller: false,
            roomId: incomingSignal.conversationId
        });
        playSound('connected');
    }, [currentUserId, incomingSignal, setPhase, setSession, playSound]);

    const rejectCall = useCallback(async () => {
        if (!incomingSignal) return;
        
        await rtdbCallService.answerCall(
            currentUserId, incomingSignal.callerId, 'rejected', incomingSignal.isGroupCall
        );
        cleanup();
    }, [currentUserId, incomingSignal, cleanup]);

    const endCall = useCallback(async (status: 'ended' | 'missed' | 'rejected' | 'busy' = 'ended') => {
        const currentSession = sessionRef.current;
        if (!currentSession) {
            cleanup();
            return;
        }

        const allIds = [currentUserId, ...currentSession.participants];
        await rtdbCallService.clearSignalingForUsers(allIds);

        if (currentSession.participants.length === 1) {
            await rtdbCallService.answerCall(currentUserId, currentSession.participants[0], 'ended');
        }

        await rtdbCallService.endCallSession(currentSession.conversationId, updateCallMessage, status);
        
        if (phaseRef.current === 'in-call') playSound('ended');
        cleanup();
    }, [currentUserId, updateCallMessage, cleanup, playSound]);

    return {
        phase,
        session,
        incomingSignal,
        startCall,
        acceptCall,
        rejectCall,
        endCall
    };
}
