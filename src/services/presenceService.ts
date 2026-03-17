import {
    set,
    update,
    onValue,
    onDisconnect,
    serverTimestamp as rtdbServerTimestamp,
    off,
    get
} from 'firebase/database';
import { presenceRef, presencesRef } from '../firebase/rtdb';
import { auth } from '../firebase/config';
import { RtdbPresence } from '../../shared/types';
import { userService } from './userService';

export const presenceService = {
    setOnline: async (uid: string): Promise<void> => {
        try {
            if (auth.currentUser?.uid !== uid) return;

            const settings = await userService.getUserSettings(uid);
            const userPresenceRef = presenceRef(uid);
            const isOnlineStatus = settings.showOnlineStatus;
            
            const now = rtdbServerTimestamp();
            
            const updateData: any = {
                isOnline: isOnlineStatus,
                updatedAt: now
            };

            if (isOnlineStatus) {
                updateData.lastSeen = now;
            } else {
                updateData.lastSeen = null; 
            }

            await update(userPresenceRef, updateData);
            const disconnectRef = onDisconnect(userPresenceRef);
            const disconnectData: any = {
                isOnline: false,
                updatedAt: rtdbServerTimestamp()
            };

            if (isOnlineStatus) {
                disconnectData.lastSeen = rtdbServerTimestamp();
            }

            await disconnectRef.update(disconnectData);
        } catch (error: any) {
            if (error.message?.includes('PERMISSION_DENIED')) return;
            console.error('Lỗi set online:', error);
            throw error;
        }
    },

    /**
     * Set user offline thủ công
     */
    setOffline: async (uid: string): Promise<void> => {
        try {
            if (!auth.currentUser || auth.currentUser.uid !== uid) return;

            const userPresenceRef = presenceRef(uid);
            await update(userPresenceRef, {
                isOnline: false,
                lastSeen: Date.now(),
                updatedAt: rtdbServerTimestamp()
            });
        } catch (error: any) {
            if (error.message?.includes('PERMISSION_DENIED')) return;
            console.error('Lỗi set offline:', error);
            throw error;
        }
    },

    /**
     * Lấy presence của một user
     */
    getPresence: async (uid: string): Promise<RtdbPresence | null> => {
        try {
            const snapshot = await get(presenceRef(uid));
            if (snapshot.exists()) {
                return snapshot.val() as RtdbPresence;
            }
            return null;
        } catch (error) {
            console.error('Lỗi get presence:', error);
            return null;
        }
    },

    /**
     * Subscribe presence của một user
     */
    subscribeToPresence: (uid: string, callback: (presence: RtdbPresence | null) => void): (() => void) => {
        const userPresenceRef = presenceRef(uid);

        return onValue(userPresenceRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as RtdbPresence);
            } else {
                callback(null);
            }
        }, (error) => {
            if (error.message.includes('permission_denied')) return;
            console.error('Lỗi subscribe presence:', error);
            callback(null);
        });
    },

    /**
     * Subscribe presence của nhiều users
     */
    subscribeToMultiplePresences: (
        uids: string[],
        callback: (presences: Record<string, RtdbPresence>) => void
    ): (() => void) => {
        const presences: Record<string, RtdbPresence> = {};
        const unsubscribers: (() => void)[] = [];

        uids.forEach(uid => {
            const unsubscribe = presenceService.subscribeToPresence(uid, (presence) => {
                if (presence) {
                    presences[uid] = presence;
                } else {
                    delete presences[uid];
                }
                callback({ ...presences });
            });
            unsubscribers.push(unsubscribe);
        });

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    },

    /**
     * Batch get presences của nhiều users
     */
    batchGetPresences: async (uids: string[]): Promise<Record<string, RtdbPresence>> => {
        try {
            const presences: Record<string, RtdbPresence> = {};

            const promises = uids.map(async (uid) => {
                const presence = await presenceService.getPresence(uid);
                if (presence) {
                    presences[uid] = presence;
                }
            });

            await Promise.all(promises);
            return presences;
        } catch (error) {
            console.error('Lỗi batch get presences:', error);
            return {};
        }
    },

    /**
     * Hủy disconnect
     */
    cancelDisconnect: async (uid: string): Promise<void> => {
        try {
            const userPresenceRef = presenceRef(uid);
            await onDisconnect(userPresenceRef).cancel();
        } catch (error) {
            console.error('Lỗi cancel disconnect:', error);
        }
    }
};
