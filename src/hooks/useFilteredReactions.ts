import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ReactionType } from '../types';
import { useAuthStore } from '../store/authStore';
import { useFriendIds } from './utils/useFriendIds';

export const useFilteredReactions = (
  sourceId: string,
  sourceType: 'post' | 'comment',
  authorId: string
) => {
  const currentUser = useAuthStore(state => state.user);
  const friendIds = useFriendIds();
  
  const [reactionsMap, setReactionsMap] = useState<Record<string, string | ReactionType>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const isOwner = currentUser?.id === authorId;

  useEffect(() => {
    if (!sourceId || !currentUser) return;
    const colPath = sourceType === 'post' ? `posts/${sourceId}/reactions` : `comments/${sourceId}/reactions`;
    
    setIsLoaded(false);
    setReactionsMap({});

    const unsubscribe = onSnapshot(collection(db, colPath), (snap) => {
      const map: Record<string, string> = {};
      snap.forEach(d => {
        const reactorId = d.id;
        if (isOwner || reactorId === currentUser.id || reactorId === authorId || friendIds.includes(reactorId)) {
           map[reactorId] = d.data().type;
        }
      });
      setReactionsMap(map);
      setIsLoaded(true);
    }, (error) => {
      console.error("useFilteredReactions error:", error);
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, [sourceId, sourceType, currentUser, authorId, friendIds, isOwner]);

  const { filteredSummary, filteredCount } = useMemo(() => {
    const summary: Partial<Record<ReactionType, number>> = {};
    let count = 0;
    
    Object.values(reactionsMap).forEach(type => {
      summary[type as ReactionType] = (summary[type as ReactionType] || 0) + 1;
      count++;
    });

    return { filteredSummary: summary, filteredCount: count };
  }, [reactionsMap]);

  return { filteredSummary, filteredCount, reactionsMap, isLoaded };
};
