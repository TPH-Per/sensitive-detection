import { useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb, auth } from '../firebase/config';
import { User } from '../../shared/types';
import { presenceService } from '../services/presenceService';

export const useSelfPresence = (user: User | null, isAdminRoute: boolean = false) => {
  useEffect(() => {
    if (!user) return;

    if (isAdminRoute) {
      if (auth.currentUser) {
        presenceService.setOffline(user.id).catch(() => {});
      }
      return;
    }

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
  }, [user, isAdminRoute]);
};
