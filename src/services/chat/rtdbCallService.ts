import { ref, set, get, update, remove, onValue, off, onDisconnect } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { rtdb, db } from '../../firebase/config';
import { RtdbCallSignaling } from '../../../shared/types';

export const rtdbCallService = {
    initiateCall: async (
        callerId: string,
        recipientIds: string[],
        convId: string,
        callType: 'video' | 'voice',
        callerName: string,
        callerAvatar: string,
        isGroupCall = false,
        isBlocked = false,
        isBlockedByMe = false
    ): Promise<{ success: boolean; reason?: string }> => {
        if (!isGroupCall && recipientIds.length === 1) {
            const recipientId = recipientIds[0];

            if (isBlocked || isBlockedByMe) {
                return { success: false, reason: 'blocked' };
            }

            const friendDoc = await getDoc(doc(db, 'users', callerId, 'friends', recipientId));
            if (!friendDoc.exists()) {
                return { success: false, reason: 'not_friend' };
            }

            const existing = await rtdbCallService.getCallSignaling(recipientId);
            if (existing?.status === 'ringing' || existing?.status === 'accepted') {
                return { success: false, reason: 'busy' };
            }
        }

        const now = Date.now();
        const signalingData: RtdbCallSignaling = {
            callerId,
            callerName,
            callerAvatar,
            conversationId: convId,
            callType,
            status: 'ringing',
            isGroupCall,
            timestamp: now,
            createdAt: now,
            updatedAt: now,
        };

        const updates: Record<string, RtdbCallSignaling | null> = {};

        recipientIds.forEach((id) => {
            updates[`call_signaling/${id}`] = signalingData;
        });
        if (!isGroupCall) {
            updates[`call_signaling/${callerId}`] = signalingData;
        }

        await update(ref(rtdb), updates);
        return { success: true };
    },

    /**
     * Phản hồi cuộc gọi (Chấp nhận/Từ chối/Bận/Kết thúc)
     */
    answerCall: async (
        calleeId: string,
        callerId: string,
        status: 'accepted' | 'rejected' | 'ended' | 'busy',
        isGroupCall = false,
    ): Promise<void> => {
        const now = Date.now();
        const updates: Record<string, any> = {};

        updates[`call_signaling/${calleeId}`] = null;

        if (!isGroupCall && calleeId !== callerId) {
            updates[`call_signaling/${callerId}/status`] = status;
            updates[`call_signaling/${callerId}/updatedAt`] = now;
        }

        await update(ref(rtdb), updates);
    },

    subscribeToIncomingCall: (
        uid: string,
        callback: (data: RtdbCallSignaling | null) => void,
    ): (() => void) => {
        const signalingRef = ref(rtdb, `call_signaling/${uid}`);
        const handler = (snapshot: any) => {
            callback(snapshot.exists() ? (snapshot.val() as RtdbCallSignaling) : null);
        };
        onValue(signalingRef, handler);
        return () => off(signalingRef, 'value', handler);
    },

    clearSignaling: async (uid: string): Promise<void> => {
        await remove(ref(rtdb, `call_signaling/${uid}`));
    },

    clearSignalingForUsers: async (uids: string[]): Promise<void> => {
        if (uids.length === 0) return;
        const updates: Record<string, null> = {};
        uids.forEach((id) => {
            updates[`call_signaling/${id}`] = null;
        });
        await update(ref(rtdb), updates);
    },

    getCallSignaling: async (uid: string): Promise<RtdbCallSignaling | null> => {
        const snapshot = await get(ref(rtdb, `call_signaling/${uid}`));
        return snapshot.exists() ? (snapshot.val() as RtdbCallSignaling) : null;
    },

    startActiveCall: async (
        convId: string,
        callerId: string,
        callType: 'voice' | 'video',
        messageId: string,
    ): Promise<void> => {
        const activeCallRef = ref(rtdb, `conversations/${convId}/activeCall`);
        const participantRef = ref(rtdb, `conversations/${convId}/activeCall/participants/${callerId}`);
        
        await set(activeCallRef, {
            callerId,
            callType,
            messageId,
            startedAt: Date.now(),
            participants: { [callerId]: Date.now() },
        });

        // Tự động dọn dẹp khi mất kết nối
        onDisconnect(participantRef).remove();
    },

    updateCallParticipant: async (
        convId: string,
        userId: string,
        isJoining: boolean,
    ): Promise<void> => {
        const participantRef = ref(rtdb, `conversations/${convId}/activeCall/participants/${userId}`);
        if (isJoining) {
            await set(participantRef, Date.now());
            onDisconnect(participantRef).remove();
        } else {
            await remove(participantRef);
            onDisconnect(participantRef).cancel();
        }
    },

    getActiveCall: async (convId: string): Promise<{
        callerId: string;
        callType: 'voice' | 'video';
        messageId: string;
        startedAt: number;
        participants?: Record<string, number>;
    } | null> => {
        const snapshot = await get(ref(rtdb, `conversations/${convId}/activeCall`));
        return snapshot.exists() ? snapshot.val() : null;
    },

    endActiveCall: async (convId: string): Promise<void> => {
        await remove(ref(rtdb, `conversations/${convId}/activeCall`));
    },

    endCallSession: async (
        convId: string,
        updateMessageFn: (convId: string, msgId: string, payload: any) => Promise<void>,
        status: 'ended' | 'missed' | 'rejected' | 'busy' = 'ended'
    ): Promise<void> => {
        try {
            const activeCall = await rtdbCallService.getActiveCall(convId);
            if (!activeCall) return;

            if (activeCall.messageId) {
                const duration = Math.max(0, Math.floor((Date.now() - activeCall.startedAt) / 1000));
                
                await updateMessageFn(convId, activeCall.messageId, {
                    callType: activeCall.callType,
                    status: status,
                    duration: status === 'ended' ? duration : 0,
                });
            }

            await rtdbCallService.endActiveCall(convId);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi endCallSession:', error);
        }
    },
};
