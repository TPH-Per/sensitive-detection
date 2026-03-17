import { useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb, auth } from '../firebase/config';
import { User } from '../../shared/types';
import { presenceService } from '../services/presenceService';

export const useSelfPresence = (user: User | null) => {
  useEffect(() => {
    if (!user) return;

    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        presenceService.setOnline(user.id).catch(() => {});
      }
    });

    return () => {
      unsubscribeConnected();
      if (auth.currentUser) {
        presenceService.setOffline(user.id).catch(() => {});
      }
    };
  }, [user]);
};
