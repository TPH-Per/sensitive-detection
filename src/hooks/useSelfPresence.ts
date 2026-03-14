import { useEffect } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase/config';
import { User } from '../types';

export const useSelfPresence = (user: User | null) => {
  useEffect(() => {
    if (!user) return;

    const presenceRef = ref(rtdb, `/presence/${user.id}`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(presenceRef).set({
          isOnline: false,
          lastSeen: serverTimestamp()
        }).then(() => {
          set(presenceRef, {
            isOnline: true,
            lastSeen: serverTimestamp()
          });
        });
      }
    });

    return () => {
      unsubscribeConnected();
      set(presenceRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    };
  }, [user]);
};
