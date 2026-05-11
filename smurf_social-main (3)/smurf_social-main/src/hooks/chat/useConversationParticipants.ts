import { useMemo, useEffect } from 'react';
import { User } from '../../../shared/types';
import { useUserCache } from '../../store/userCacheStore';

export function useConversationParticipants(participantIds: string[]): User[] {
    const { users: usersMap, fetchUsers } = useUserCache();

    useEffect(() => {
        const missingIds = participantIds.filter(id => !usersMap[id]);
        if (missingIds.length > 0) {
            fetchUsers(missingIds);
        }
    }, [participantIds, usersMap, fetchUsers]);

    return useMemo(() => {
        return participantIds
            .map(id => usersMap[id])
            .filter((user): user is User => !!user);
    }, [participantIds, usersMap]);
}

export function useConversationPartner(
    participantIds: string[],
    currentUserId: string,
    isGroup: boolean
): User | null {
    const participants = useConversationParticipants(participantIds);

    return useMemo(() => {
        if (isGroup) return null;
        return participants.find(p => p.id !== currentUserId) || null;
    }, [participants, currentUserId, isGroup]);
}
