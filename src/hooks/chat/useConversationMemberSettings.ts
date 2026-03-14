import { useRtdbChatStore } from '../../store';
import { RtdbUserChat } from '../../types';

export const useConversationMemberSettings = (conversationId: string, _userId: string): RtdbUserChat | null => {
    const conversations = useRtdbChatStore(state => state.conversations);
    const conv = conversations.find(c => c.id === conversationId);
    return conv?.userChat ?? null;
};
