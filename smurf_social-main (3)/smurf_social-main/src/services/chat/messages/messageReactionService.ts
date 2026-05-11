import { ref, set, get } from 'firebase/database';
import { rtdb } from '../../../firebase/config';

export const messageReactionService = {
    toggleReaction: async (convId: string, msgId: string, uid: string, emoji: string | 'REMOVE'): Promise<void> => {
        try {
            const reactionRef = ref(rtdb, `messages/${convId}/${msgId}/reactions/${uid}`);
            const reactionSnap = await get(reactionRef);
            const currentEmoji = reactionSnap.val();

            if (emoji === 'REMOVE' || currentEmoji === emoji) {
                await set(reactionRef, null);
            } else {
                await set(reactionRef, emoji);
            }
        } catch (error) {
            console.error('[rtdbMessageService] Lỗi toggleReaction:', error);
            throw error;
        }
    }
};
