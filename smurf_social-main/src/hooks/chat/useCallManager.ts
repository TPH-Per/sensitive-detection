import { useEffect, useCallback, useRef } from 'react';
import { useCallStore } from '../../store/callStore';
import { useCallSounds } from './useCallSounds';
import { rtdbCallService } from '../../services/chat/rtdbCallService';
import { useRtdbChatStore } from '../../store';

export function useCallManager(currentUserId: string) {
    const {
        phase, session, incomingSignal,
        setPhase, setSession, setIncomingSignal, setCallEndReason, resetCall
    } = useCallStore();

    const { playSound } = useCallSounds();
    const updateCallMessage = useRtdbChatStore((s) => s.updateCallMessage);

    const phaseRef = useRef(phase);
    const sessionRef = useRef(session);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { sessionRef.current = session; }, [session]);

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isBusyRespondingRef = useRef(false);
    const participantUnsubRef = useRef<(() => void) | null>(null);

    const cleanup = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (participantUnsubRef.current) {
            participantUnsubRef.current();
            participantUnsubRef.current = null;
        }
        resetCall();
    }, [resetCall]);

    const subscribeGroupParticipants = useCallback((conversationId: string) => {
        if (participantUnsubRef.current) {
            participantUnsubRef.current();
        }
        let hasReachedMultiple = false;

        participantUnsubRef.current = rtdbCallService.subscribeToParticipantCount(
            conversationId,
            async (count) => {
                if (count >= 2) {
                    hasReachedMultiple = true;
                }

                if (hasReachedMultiple && count <= 1 && phaseRef.current === 'in-call') {
                    const currentSession = sessionRef.current;
                    if (!currentSession?.isGroupCall) return;

                    if (participantUnsubRef.current) {
                        participantUnsubRef.current();
                        participantUnsubRef.current = null;
                    }

                    await rtdbCallService.endCallSession(
                        conversationId,
                        updateCallMessage,
                        'ended',
                    );
                    playSound('ended');
                    cleanup();
                }
            }
        );
    }, [updateCallMessage, playSound, cleanup]);

    useEffect(() => {
        if (!currentUserId) return;

        const unsubscribe = rtdbCallService.subscribeToIncomingCall(currentUserId, async (data) => {
            if (!data) {
                if (isBusyRespondingRef.current) {
                    isBusyRespondingRef.current = false;
                    return;
                }
                if (phaseRef.current !== 'idle') {
                    if (sessionRef.current?.isGroupCall && phaseRef.current === 'in-call') {
                        return;
                    }
                    if (phaseRef.current === 'in-call') playSound('ended');
                    cleanup();
                }
                return;
            }

            // Bên caller
            if (data.callerId === currentUserId) {
                if (data.status === 'accepted') {
                    if (sessionRef.current) {
                        setPhase('in-call');
                        setSession({
                            ...sessionRef.current,
                            startTime: Date.now(),
                        });
                        playSound('connected');
                        if (sessionRef.current.isGroupCall) {
                            subscribeGroupParticipants(sessionRef.current.conversationId);
                        } else {
                            const recipientIds = sessionRef.current.participants || [];
                            await rtdbCallService.clearSignalingForUsers(recipientIds);
                        }
                    }
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                }
                else if (data.status === 'rejected' || data.status === 'busy') {
                    if (data.isGroupCall) return;

                    setCallEndReason(data.status === 'busy' ? 'busy' : 'rejected');

                    if (sessionRef.current?.conversationId) {
                        await rtdbCallService.endCallSession(
                            sessionRef.current.conversationId,
                            updateCallMessage,
                            'missed'
                        );
                    }
                }
            }
            else {
                if (data.status === 'ringing') {
                    if (phaseRef.current !== 'idle') {
                        isBusyRespondingRef.current = true;
                        await rtdbCallService.answerCall(currentUserId, data.callerId, 'busy', data.isGroupCall);
                        return;
                    }

                    if (data.isGroupCall) {
                        const signalAge = Date.now() - (data.createdAt || 0);
                        if (signalAge > 30000) {
                            const activeCall = await rtdbCallService.getActiveCall(data.conversationId);
                            if (!activeCall) {
                                await rtdbCallService.clearSignaling(currentUserId);
                                return;
                            }
                        }
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
    }, [currentUserId, setPhase, setSession, setIncomingSignal, setCallEndReason, playSound, cleanup, updateCallMessage, subscribeGroupParticipants]);

    const startCall = useCallback(async (
        recipientIds: string[],
        callerName: string,
        callerAvatar: string,
        callType: 'voice' | 'video',
        conversationId: string,
        isGroupCall = false,
        calleeName?: string,
        calleeAvatar?: string,
        isBlocked = false,
        isBlockedByMe = false
    ) => {
        if (phaseRef.current !== 'idle') {
            return { success: false, reason: 'already_in_call' };
        }

        const preCheck = await rtdbCallService.initiateCall(
            currentUserId, recipientIds, conversationId, callType, callerName, callerAvatar,
            isGroupCall, isBlocked, isBlockedByMe
        );

        if (!preCheck.success) {
            return preCheck;
        }

        const sendCallMessage = useRtdbChatStore.getState().sendCallMessage;
        const msgId = await sendCallMessage(conversationId, currentUserId, {
            callType,
            status: 'started',
        });

        await rtdbCallService.startActiveCall(conversationId, currentUserId, callType, msgId);

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

        return { success: true };
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

        await rtdbCallService.updateCallParticipant(
            incomingSignal.conversationId, currentUserId, true
        );

        await rtdbCallService.markCallConnected(incomingSignal.conversationId);

        if (incomingSignal.isGroupCall) {
            subscribeGroupParticipants(incomingSignal.conversationId);
        }

        playSound('connected');
    }, [currentUserId, incomingSignal, setPhase, setSession, playSound, subscribeGroupParticipants]);

    const rejectCall = useCallback(async () => {
        if (!incomingSignal) return;

        await rtdbCallService.answerCall(
            currentUserId, incomingSignal.callerId, 'rejected', incomingSignal.isGroupCall
        );
        cleanup();
    }, [currentUserId, incomingSignal, cleanup]);

    const endCall = useCallback(async (status: 'ended' | 'missed' | 'rejected' = 'ended') => {
        const currentSession = sessionRef.current;
        if (!currentSession) {
            cleanup();
            return;
        }

        const allIds = [...new Set([currentUserId, ...currentSession.participants])];
        await rtdbCallService.clearSignalingForUsers(allIds);

        await rtdbCallService.endCallSession(
            currentSession.conversationId,
            updateCallMessage,
            status,
            currentSession.isGroupCall ? currentUserId : undefined
        );

        if (phaseRef.current === 'in-call') playSound('ended');
        cleanup();
    }, [currentUserId, updateCallMessage, cleanup, playSound]);

    const dismissEndedCall = useCallback(async () => {
        await rtdbCallService.clearSignaling(currentUserId);
        cleanup();
    }, [currentUserId, cleanup]);

    const joinActiveCall = useCallback((
        conversationId: string,
        callType: 'voice' | 'video',
    ) => {
        setPhase('in-call');
        setSession({
            conversationId,
            callType,
            isGroupCall: true,
            participants: [],
            startTime: Date.now(),
            isCaller: false,
            roomId: conversationId
        });

        rtdbCallService.updateCallParticipant(conversationId, currentUserId, true);
        subscribeGroupParticipants(conversationId);
        playSound('connected');
    }, [currentUserId, setPhase, setSession, playSound, subscribeGroupParticipants]);

    return {
        phase,
        session,
        incomingSignal,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        dismissEndedCall,
        joinActiveCall
    };
}
