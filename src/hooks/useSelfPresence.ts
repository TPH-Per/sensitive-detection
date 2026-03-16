import { useEffect } from 'react';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { rtdb } from '../firebase/config';
import { User } from '../../shared/types';
import { presenceService } from '../services/presenceService';

export const useSelfPresence = (user: User | null) => {
  useEffect(() => {
    if (!user) return;

    const connectedRef = ref(rtdb, '.info/connected');

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        presenceService.setOnline(user.id).catch(err => 
          console.error('Lỗi set online từ useSelfPresence:', err)
        );
      }
    });

    return () => {
      unsubscribeConnected();
      presenceService.setOffline(user.id).catch(err => 
        console.error('Lỗi set offline từ useSelfPresence:', err)
      );
    };
  }, [user]);
};
