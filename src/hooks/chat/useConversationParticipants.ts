import { useMemo } from 'react';
import { User } from '../../../shared/types';
import { useUserCache } from '../../store/userCacheStore';

/**
 * Hook để fetch participants từ participantIds
 * Sử dụng cache để optimize performance
 */
export function useConversationParticipants(participantIds: string[]): User[] {
    const { users: usersMap, fetchUsers } = useUserCache();

    // Fetch users nếu chưa có trong cache
    useMemo(() => {
        const missingIds = participantIds.filter(id => !usersMap[id]);
        if (missingIds.length > 0) {
            fetchUsers(missingIds);
        }
    }, [participantIds, usersMap, fetchUsers]);

    // Return participants từ cache
    return useMemo(() => {
        return participantIds
            .map(id => usersMap[id])
            .filter((user): user is User => !!user);
    }, [participantIds, usersMap]);
}

/**
 * Hook để lấy partner trong 1-1 conversation
 */
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
