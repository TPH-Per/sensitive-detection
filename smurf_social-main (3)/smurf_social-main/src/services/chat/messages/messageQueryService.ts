import { ref, get, query, orderByChild, limitToLast, endBefore, onChildAdded, onChildChanged, onChildRemoved, off } from 'firebase/database';
import { rtdb } from '../../../firebase/config';
import { RtdbMessage } from '../../../../shared/types';

export const messageQueryService = {
    subscribeToMessages: (
        convId: string,
        limitCount: number,
        callback: (messages: Array<{ id: string; data: RtdbMessage }>) => void,
        sinceTimestamp: number = 0
    ) => {
        const messagesRef = ref(rtdb, `messages/${convId}`);
        const messagesQuery = query(messagesRef, orderByChild('createdAt'), limitToLast(limitCount));

        const messages: Array<{ id: string; data: RtdbMessage }> = [];

        const childAddedHandler = (snapshot: any) => {
            const msgId = snapshot.key;
            const msgData = snapshot.val() as RtdbMessage;

            if (msgData.createdAt <= sinceTimestamp) return;

            const existingIndex = messages.findIndex(m => m.id === msgId);
            if (existingIndex === -1) {
                messages.push({ id: msgId, data: msgData });
                messages.sort((a, b) => a.data.createdAt - b.data.createdAt);
                callback([...messages]);
            }
        };

        const childChangedHandler = (snapshot: any) => {
            const msgId = snapshot.key;
            const msgData = snapshot.val() as RtdbMessage;

            if (msgData.createdAt <= sinceTimestamp) return;

            const existingIndex = messages.findIndex(m => m.id === msgId);
            if (existingIndex !== -1) {
                messages[existingIndex] = { id: msgId, data: msgData };
            } else {
                messages.push({ id: msgId, data: msgData });
                messages.sort((a, b) => a.data.createdAt - b.data.createdAt);
            }
            callback([...messages]);
        };

        const childRemovedHandler = (snapshot: any) => {
            const msgId = snapshot.key;
            const idx = messages.findIndex(m => m.id === msgId);
            if (idx !== -1) {
                messages.splice(idx, 1);
                callback([...messages]);
            }
        };

        onChildAdded(messagesQuery, childAddedHandler);
        onChildChanged(messagesQuery, childChangedHandler);
        onChildRemoved(messagesQuery, childRemovedHandler);

        return () => {
            off(messagesQuery, 'child_added', childAddedHandler);
            off(messagesQuery, 'child_changed', childChangedHandler);
            off(messagesQuery, 'child_removed', childRemovedHandler);
        };
    },

    loadMoreMessages: async (
        convId: string,
        beforeTimestamp: number,
        limitCount: number,
        sinceTimestamp: number = 0
    ): Promise<Array<{ id: string; data: RtdbMessage }>> => {
        try {
            if (beforeTimestamp <= sinceTimestamp) return [];

            const messagesRef = ref(rtdb, `messages/${convId}`);
            const messagesQuery = query(
                messagesRef,
                orderByChild('createdAt'),
                endBefore(beforeTimestamp),
                limitToLast(limitCount)
            );

            const snapshot = await get(messagesQuery);
            const messages: Array<{ id: string; data: RtdbMessage }> = [];

            if (snapshot.exists()) {
                snapshot.forEach((childSnap) => {
                    const data = childSnap.val() as RtdbMessage;
                    if (data.createdAt > sinceTimestamp) {
                        messages.push({
                            id: childSnap.key!,
                            data
                        });
                    }
                });
            }

            return messages.sort((a, b) => a.data.createdAt - b.data.createdAt);
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi loadMoreMessages:', error);
            throw error;
        }
    }
};
