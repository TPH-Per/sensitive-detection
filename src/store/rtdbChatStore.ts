import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { RtdbMessage } from '../../shared/types';
import { PAGINATION } from '../constants';
import {
    createRtdbMessageSlice,
    createRtdbConversationSlice,
    createRtdbGroupSlice,
    RtdbMessageSlice,
    RtdbConversationSlice,
    RtdbGroupSlice
} from './chat';

export type RtdbChatState = RtdbMessageSlice & RtdbConversationSlice & RtdbGroupSlice & {
    reset: () => void;
};

export const useRtdbChatStore = create<RtdbChatState>()(
    persist(
        (...a) => ({
            ...createRtdbMessageSlice(...a),
            ...createRtdbConversationSlice(...a),
            ...createRtdbGroupSlice(...a),

            reset: () => {
                const [set] = a;
                set({
                    conversations: [],
                    selectedConversationId: null,
                    messages: {},
                    hasMoreMessages: {},
                    searchTerm: '',
                    isSearchFocused: false,
                    searchResults: { users: [] },
                    searchHistory: {},
                    isChatVisible: false,
                    isLoadingMore: {},
                    uploadProgress: {},
                });
            },
        }),
        {
            name: 'smurf_rtdb_chat_cache',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => {
                const cachedMessages: Record<string, Array<{ id: string; data: RtdbMessage }>> = {};
                Object.keys(state.messages).forEach(convId => {
                    cachedMessages[convId] = (state.messages[convId] || []).slice(-PAGINATION.CHAT_CACHE_LIMIT);
                });
                return {
                    conversations: state.conversations,
                    searchHistory: state.searchHistory,
                    messages: cachedMessages
                };
            },
        }
    )
);
