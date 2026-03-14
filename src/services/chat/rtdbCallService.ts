import { ref, set, get, update, remove, onValue, off } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbCallSignaling } from '../../types';

export const rtdbCallService = {
    /**
     * Bắt đầu cuộc gọi
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
     * Chấp nhận cuộc gọi
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
     * Lắng nghe cuộc gọi đến
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

        return () => {
            off(signalingRef, 'value', handler);
        };
    },

    /**
     * Xóa signaling sau khi kết thúc cuộc gọi
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
     * Lấy thông tin signaling hiện tại
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
    },

    /**
     * Bắt đầu cuộc gọi
     */
    startActiveCall: async (convId: string, callerId: string, callType: 'voice' | 'video', messageId: string): Promise<void> => {
        try {
            const activeCallRef = ref(rtdb, `conversations/${convId}/activeCall`);
            await set(activeCallRef, {
                callerId,
                callType,
                messageId,
                startedAt: Date.now(),
                participants: { [callerId]: true }
            });
        } catch (error) {
            console.error('[rtdbCallService] Lỗi startActiveCall:', error);
        }
    },

    /**
     * Cập nhật người tham gia cuộc gọi
     */
    updateCallParticipant: async (convId: string, userId: string, isJoining: boolean): Promise<void> => {
        try {
            const participantRef = ref(rtdb, `conversations/${convId}/activeCall/participants/${userId}`);
            if (isJoining) {
                await set(participantRef, true);
            } else {
                await remove(participantRef);
            }
        } catch (error) {
            console.error('[rtdbCallService] Lỗi updateCallParticipant:', error);
        }
    },

    /**
     * Lấy thông tin cuộc gọi đang diễn ra
     */
    getActiveCall: async (convId: string): Promise<any> => {
        try {
            const activeCallRef = ref(rtdb, `conversations/${convId}/activeCall`);
            const snap = await get(activeCallRef);
            return snap.val();
        } catch (error) {
            console.error('[rtdbCallService] Lỗi getActiveCall:', error);
            return null;
        }
    },

    /**
     * Kết thúc cuộc gọi
     */
    endActiveCall: async (convId: string): Promise<void> => {
        try {
            const activeCallRef = ref(rtdb, `conversations/${convId}/activeCall`);
            await remove(activeCallRef);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi endActiveCall:', error);
        }
    }
};
