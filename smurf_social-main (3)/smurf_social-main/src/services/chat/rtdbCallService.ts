import { ref, set, get, update, remove, onValue, off, onDisconnect } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { rtdb, db } from '../../firebase/config';
import { RtdbCallSignaling } from '../../../shared/types';
import { getServerSyncedNow } from './chatTime';

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
        }

        const now = getServerSyncedNow();
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
        updates[`call_signaling/${callerId}`] = signalingData;

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
        const now = getServerSyncedNow();
        const updates: Record<string, any> = {};

        updates[`call_signaling/${calleeId}`] = null;

        if (calleeId !== callerId) {
            if (!isGroupCall || status === 'accepted') {
                updates[`call_signaling/${callerId}/status`] = status;
                updates[`call_signaling/${callerId}/updatedAt`] = now;
            }
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

    subscribeToMultipleSignaling: (
        uids: string[],
        callback: (statuses: Record<string, boolean>) => void,
    ): (() => void) => {
        const unsubs: (() => void)[] = [];
        const statuses: Record<string, boolean> = {};
        uids.forEach(uid => statuses[uid] = true);

        uids.forEach((uid) => {
            const signalingRef = ref(rtdb, `call_signaling/${uid}`);
            const handler = (snapshot: any) => {
                statuses[uid] = snapshot.exists();
                callback({ ...statuses });
            };
            onValue(signalingRef, handler);
            unsubs.push(() => off(signalingRef, 'value', handler));
        });

        return () => unsubs.forEach(unsub => unsub());
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
            startedAt: getServerSyncedNow(),
            participants: { [callerId]: getServerSyncedNow() },
        });

        onDisconnect(participantRef).remove();
    },

    markCallConnected: async (convId: string): Promise<void> => {
        await update(ref(rtdb, `conversations/${convId}/activeCall`), {
            startedAt: getServerSyncedNow(),
        });
    },

    updateCallParticipant: async (
        convId: string,
        userId: string,
        isJoining: boolean,
    ): Promise<number> => {
        const participantRef = ref(rtdb, `conversations/${convId}/activeCall/participants/${userId}`);
        if (isJoining) {
            await set(participantRef, getServerSyncedNow());
            onDisconnect(participantRef).remove();

            const snapshot = await get(ref(rtdb, `conversations/${convId}/activeCall/participants`));
            const data = snapshot.val();
            return data ? Object.keys(data).length : 0;
        } else {
            await remove(participantRef);
            onDisconnect(participantRef).cancel();

            const snapshot = await get(ref(rtdb, `conversations/${convId}/activeCall/participants`));
            const data = snapshot.val();
            const count = data ? Object.keys(data).length : 0;

            return count;
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

    subscribeToParticipantCount: (
        convId: string,
        callback: (count: number) => void,
    ): (() => void) => {
        const participantsRef = ref(rtdb, `conversations/${convId}/activeCall/participants`);
        const handler = (snapshot: any) => {
            const data = snapshot.val();
            callback(data ? Object.keys(data).length : 0);
        };
        onValue(participantsRef, handler);
        return () => off(participantsRef, 'value', handler);
    },

    endCallSession: async (
        convId: string,
        updateMessageFn: (convId: string, msgId: string, payload: any) => Promise<void>,
        status: 'ended' | 'missed' | 'rejected' = 'ended',
        userId?: string
    ): Promise<void> => {
        try {
            const activeCall = await rtdbCallService.getActiveCall(convId);
            if (!activeCall) return;

            if (userId) {
                const remainingCount = await rtdbCallService.updateCallParticipant(convId, userId, false);
                if (remainingCount > 1) {
                    return;
                }
            }

            if (activeCall.messageId) {
                const duration = Math.max(0, Math.floor((getServerSyncedNow() - activeCall.startedAt) / 1000));

                await updateMessageFn(convId, activeCall.messageId, {
                    callType: activeCall.callType,
                    status: status,
                    duration: status === 'ended' ? duration : 0,
                });
            }

            await rtdbCallService.endActiveCall(convId);

            try {
                const convSnap = await get(ref(rtdb, `conversations/${convId}/members`));
                if (convSnap.exists()) {
                    const allMemberIds = Object.keys(convSnap.val());
                    await rtdbCallService.clearSignalingForUsers(allMemberIds);
                }
            } catch {
            }
        } catch (error) {
            console.error('[rtdbCallService] Lỗi endCallSession:', error);
        }
    },
};
