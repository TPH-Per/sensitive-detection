import { ref, set, get, update, remove, onValue, off } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbCallSignaling } from '../../types';

export const rtdbCallService = {
    /**
     * Initiate a call (write to callee's signaling node)
     */
    initiateCall: async (
        callerId: string,
        calleeId: string,
        convId: string,
        callType: 'video' | 'voice',
        zegoToken: string
    ): Promise<void> => {
        try {
            const signalingRef = ref(rtdb, `call_signaling/${calleeId}`);

            const signalingData: RtdbCallSignaling = {
                callerId,
                conversationId: convId,
                callType,
                status: 'ringing',
                zegoToken,
                timestamp: Date.now()
            };

            await set(signalingRef, signalingData);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi initiateCall:', error);
            throw error;
        }
    },

    /**
     * Answer call (update status)
     */
    answerCall: async (calleeId: string, status: 'accepted' | 'rejected'): Promise<void> => {
        try {
            const signalingRef = ref(rtdb, `call_signaling/${calleeId}`);
            await update(signalingRef, { status });
        } catch (error) {
            console.error('[rtdbCallService] Lỗi answerCall:', error);
            throw error;
        }
    },

    /**
     * Subscribe to incoming calls
     */
    subscribeToIncomingCall: (
        uid: string,
        callback: (callData: RtdbCallSignaling | null) => void
    ) => {
        const signalingRef = ref(rtdb, `call_signaling/${uid}`);

        const handler = (snapshot: any) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as RtdbCallSignaling);
            } else {
                callback(null);
            }
        };

        onValue(signalingRef, handler);

        // Return unsubscribe function
        return () => {
            off(signalingRef, 'value', handler);
        };
    },

    /**
     * Clear signaling after call ends
     */
    clearSignaling: async (uid: string): Promise<void> => {
        try {
            const signalingRef = ref(rtdb, `call_signaling/${uid}`);
            await remove(signalingRef);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi clearSignaling:', error);
            throw error;
        }
    },

    /**
     * Get current call signaling data
     */
    getCallSignaling: async (uid: string): Promise<RtdbCallSignaling | null> => {
        try {
            const signalingRef = ref(rtdb, `call_signaling/${uid}`);
            const snapshot = await get(signalingRef);

            if (snapshot.exists()) {
                return snapshot.val() as RtdbCallSignaling;
            }

            return null;
        } catch (error) {
            console.error('[rtdbCallService] Lỗi getCallSignaling:', error);
            throw error;
        }
    }
};
