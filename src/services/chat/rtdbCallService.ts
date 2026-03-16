import { ref, set, get, update, remove, onValue, off } from 'firebase/database';
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
    ): Promise<{ success: boolean; reason?: string }> => {
        if (!isGroupCall && recipientIds.length === 1) {
            const recipientId = recipientIds[0];

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

    answerCall: async (
        calleeId: string,
        callerId: string,
        status: 'accepted' | 'rejected' | 'ended',
        isGroupCall = false,
    ): Promise<void> => {
        const updates: Record<string, any> = {
            [`call_signaling/${calleeId}`]: null,
        };

        if (!isGroupCall) {
            updates[`call_signaling/${callerId}/status`] = status;
            updates[`call_signaling/${callerId}/updatedAt`] = Date.now();
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
        await set(ref(rtdb, `conversations/${convId}/activeCall`), {
            callerId,
            callType,
            messageId,
            startedAt: Date.now(),
            participants: { [callerId]: true },
        });
    },

    updateCallParticipant: async (
        convId: string,
        userId: string,
        isJoining: boolean,
    ): Promise<void> => {
        const participantRef = ref(rtdb, `conversations/${convId}/activeCall/participants/${userId}`);
        if (isJoining) {
            await set(participantRef, true);
        } else {
            await remove(participantRef);
        }
    },

    getActiveCall: async (convId: string): Promise<{
        callerId: string;
        callType: 'voice' | 'video';
        messageId: string;
        startedAt: number;
        participants?: Record<string, boolean>;
    } | null> => {
        const snapshot = await get(ref(rtdb, `conversations/${convId}/activeCall`));
        return snapshot.exists() ? snapshot.val() : null;
    },

    endActiveCall: async (convId: string): Promise<void> => {
        await remove(ref(rtdb, `conversations/${convId}/activeCall`));
    },
};
