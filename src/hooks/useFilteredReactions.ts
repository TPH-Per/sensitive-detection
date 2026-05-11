import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ReactionType } from '../../shared/types';
import { useAuthStore } from '../store/authStore';
import { useReactionStore } from '../store/reactionStore';

export const useFilteredReactions = (
  sourceId: string,
  sourceType: 'post' | 'comment',
  authorId: string,
  initialCount?: number
) => {
  const currentUser = useAuthStore(state => state.user);
  const [reactionsMap, setReactionsMap] = useState<Record<string, ReactionType>>({});
  const [isLoading, setIsLoading] = useState(true);

  const optimisticReaction = useReactionStore(state => state.optimisticReactions[sourceId]);
  const clearOptimisticReaction = useReactionStore(state => state.clearOptimisticReaction);

  const prevOptimisticRef = useRef<ReactionType | null | undefined>(undefined);

  useEffect(() => {
    if (!sourceId || !currentUser) return;

    const colPath = sourceType === 'post'
      ? `posts/${sourceId}/reactions`
      : `comments/${sourceId}/reactions`;

    const q = query(collection(db, colPath), orderBy('createdAt', 'desc'));

    setIsLoading(true);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map: Record<string, ReactionType> = {};
      snapshot.forEach(doc => {
        map[doc.id] = doc.data().type as ReactionType;
      });
      setReactionsMap(map);
      setIsLoading(false);

      if (optimisticReaction !== undefined && currentUser?.id) {
        const firestoreReaction = map[currentUser.id];
        const prevOptimistic = prevOptimisticRef.current;

        const isSynced =
          (optimisticReaction === null && !firestoreReaction) ||
          (optimisticReaction && firestoreReaction === optimisticReaction);

        if (isSynced && prevOptimistic === optimisticReaction) {
          setTimeout(() => {
            clearOptimisticReaction(sourceId);
          }, 150);
        }
      }

      prevOptimisticRef.current = optimisticReaction;
    }, (error) => {
      if (error.code !== 'permission-denied') {
        console.error(`Error subscribing to reactions for ${sourceId}:`, error);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [sourceId, sourceType, currentUser?.id, optimisticReaction, clearOptimisticReaction]);

  const { filteredSummary, filteredCount, isReacted, currentUserReaction } = useMemo(() => {
    const summary: Partial<Record<ReactionType, number>> = {};
    let count = 0;

    const firestoreReaction = reactionsMap[currentUser?.id || ''];
    const hasOptimistic = optimisticReaction !== undefined;
    const effectiveUserReaction = hasOptimistic ? optimisticReaction : firestoreReaction || null;

    const tempMap = { ...reactionsMap };

    if (hasOptimistic) {
      if (optimisticReaction) {
        tempMap[currentUser?.id || ''] = optimisticReaction;
      } else {
        delete tempMap[currentUser?.id || ''];
      }
    }

    Object.values(tempMap).forEach(type => {
      summary[type] = (summary[type] || 0) + 1;
      count++;
    });

    const isReacted = !!effectiveUserReaction;
    let finalCount = initialCount !== undefined ? Math.max(initialCount, count) : count;

    return {
      filteredSummary: summary,
      filteredCount: finalCount,
      isReacted,
      currentUserReaction: effectiveUserReaction
    };
  }, [reactionsMap, initialCount, currentUser?.id, optimisticReaction]);

  return { filteredSummary, filteredCount, reactionsMap, isLoaded: !isLoading, isReacted, currentUserReaction };
};
