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
import { RtdbPresence } from '../../shared/types';

export const presenceService = {
    /**
     * Set user online và cài đặt auto-disconnect
     */
    setOnline: async (uid: string): Promise<void> => {
        try {
            const { userService } = await import('./userService');
            const settings = await userService.getUserSettings(uid);

            const userPresenceRef = presenceRef(uid);

            if (settings.showOnlineStatus) {
                await set(userPresenceRef, {
                    isOnline: true,
                    lastSeen: rtdbServerTimestamp()
                });
            } else {
                await update(userPresenceRef, {
                    isOnline: false,
                    lastSeen: rtdbServerTimestamp()
                });
            }

            const disconnectRef = onDisconnect(userPresenceRef);
            await disconnectRef.update({
                isOnline: false,
                lastSeen: rtdbServerTimestamp()
            });
        } catch (error) {
            console.error('Lỗi set online:', error);
            throw error;
        }
    },

    /**
     * Set user offline thủ công
     */
    setOffline: async (uid: string): Promise<void> => {
        try {
            const userPresenceRef = presenceRef(uid);
            await update(userPresenceRef, {
                isOnline: false,
                lastSeen: Date.now()
            });
        } catch (error) {
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

        const listener = onValue(userPresenceRef, (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val() as RtdbPresence);
            } else {
                callback(null);
            }
        }, (error) => {
            console.error('Lỗi subscribe presence:', error);
            callback(null);
        });

        return () => {
            off(userPresenceRef, 'value', listener);
        };
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

    cancelDisconnect: async (uid: string): Promise<void> => {
        try {
            const userPresenceRef = presenceRef(uid);
            await onDisconnect(userPresenceRef).cancel();
        } catch (error) {
            console.error('Lỗi cancel disconnect:', error);
        }
    }
};
