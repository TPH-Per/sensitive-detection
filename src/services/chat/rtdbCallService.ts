import { ref, set, get, update, remove, onValue, off } from 'firebase/database';
import { rtdb } from '../../firebase/config';
import { RtdbCallSignaling } from '../../../shared/types';

export const rtdbCallService = {
    /**
     * Khởi tạo cuộc gọi (Hỗ trợ 1-1 và Group)
     */
    initiateCall: async (
        callerId: string,
        recipientIds: string[],
        convId: string,
        callType: 'video' | 'voice',
        zegoToken: string,
        callerName: string,
        callerAvatar: string,
        isGroupCall?: boolean
    ): Promise<{ success: boolean; reason?: string }> => {
        try {
            if (!isGroupCall && recipientIds.length === 1) {
                const recipientId = recipientIds[0];
                const recipientSignal = await rtdbCallService.getCallSignaling(recipientId);
                if (recipientSignal && (recipientSignal.status === 'ringing' || recipientSignal.status === 'accepted')) {
                    return { success: false, reason: 'busy' };
                }
            }

            const updates: Record<string, any> = {};
            const signalingData: RtdbCallSignaling = {
                callerId,
                callerName,
                callerAvatar,
                conversationId: convId,
                callType,
                status: 'ringing',
                zegoToken,
                timestamp: Date.now(),
                isGroupCall
            };

            recipientIds.forEach(id => {
                updates[`call_signaling/${id}`] = signalingData;
            });

            if (!isGroupCall) {
                updates[`call_signaling/${callerId}`] = signalingData;
            }
            
            await update(ref(rtdb), updates);
            return { success: true };
        } catch (error) {
            console.error('[rtdbCallService] Lỗi initiateCall:', error);
            throw error;
        }
    },

    /**
     * Phản hồi cuộc gọi (Chấp nhận/Từ chối)
     */
    answerCall: async (
        calleeId: string, 
        callerId: string, 
        status: 'accepted' | 'rejected',
        isGroupCall?: boolean
    ): Promise<void> => {
        try {
            const updates: Record<string, any> = {};

            if (!isGroupCall) {
                updates[`call_signaling/${callerId}/status`] = status;
            }
            updates[`call_signaling/${calleeId}`] = null;

            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi answerCall:', error);
            throw error;
        }
    },

    /**
     * Lắng nghe tín hiệu cuộc gọi đến
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
     * Xóa tín hiệu gọi cho một người dùng (khi kết thúc/hủy)
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
     * Xóa tín hiệu cho nhiều người dùng (dùng cho caller khi hủy cuộc gọi group)
     */
    clearSignalingForUsers: async (uids: string[]): Promise<void> => {
        try {
            const updates: Record<string, null> = {};
            uids.forEach(id => {
                updates[`call_signaling/${id}`] = null;
            });
            await update(ref(rtdb), updates);
        } catch (error) {
            console.error('[rtdbCallService] Lỗi clearSignalingForUsers:', error);
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
     * Đánh dấu cuộc gọi đang diễn ra trong hội thoại
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
     * Cập nhật người tham gia cuộc gọi đang diễn ra
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
     * Kết thúc cuộc gọi đang diễn ra
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
