import { StateCreator } from 'zustand';
import { RtdbConversation, RtdbUserChat, User } from '../../../shared/types';
import { rtdbConversationService } from '../../services/chat/rtdbConversationService';
import { userService } from '../../services/userService';
import { friendService } from '../../services/friendService';
import { useAuthStore } from '../authStore';
import { useLoadingStore } from '../loadingStore';
import type { RtdbChatState } from '../rtdbChatStore';

export interface RtdbConversationSlice {
    conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
    selectedConversationId: string | null;
    searchTerm: string;
    isSearchFocused: boolean;
    searchResults: { users: User[] };
    searchHistory: Record<string, User[]>;
    isChatVisible: boolean;
    typingUsers: Record<string, string[]>;

    subscribeToConversations: (userId: string) => () => void;
    selectConversation: (conversationId: string | null) => void;
    getOrCreateConversation: (user1Id: string, user2Id: string) => Promise<string>;
    searchConversations: (userId: string, term: string) => Promise<void>;
    togglePin: (conversationId: string, userId: string, pinned: boolean) => Promise<void>;
    toggleMute: (conversationId: string, userId: string, muted: boolean) => Promise<void>;
    toggleArchive: (conversationId: string, userId: string, archived: boolean) => Promise<void>;
    toggleMarkUnread: (conversationId: string, userId: string, markedUnread: boolean) => Promise<void>;
    deleteConversation: (conversationId: string, userId: string) => Promise<void>;
    setSearchFocused: (focused: boolean) => void;
    addToSearchHistory: (item: User, userId: string) => void;
    removeFromSearchHistory: (itemId: string, userId: string) => void;
    clearSearchHistory: (userId: string) => void;
    setSearchTerm: (term: string) => void;
    setIsChatVisible: (visible: boolean) => void;
    markAllAsRead: (userId: string) => Promise<void>;
    setTyping: (conversationId: string, userId: string, isTyping: boolean) => Promise<void>;
    subscribeToTyping: (conversationId: string) => () => void;
}

export const createRtdbConversationSlice: StateCreator<RtdbChatState, [], [], RtdbConversationSlice> = (set, get) => ({
    conversations: [],
    selectedConversationId: null,
    searchTerm: '',
    isSearchFocused: false,
    searchResults: { users: [] },
    searchHistory: {},
    isChatVisible: false,
    typingUsers: {},

    subscribeToConversations: (userId: string) => {
        const hasCache = get().conversations.length > 0;
        useLoadingStore.getState().setLoading('chat', !hasCache);

        const unsubscribe = rtdbConversationService.subscribeToUserConversations(userId, (conversations) => {
            set({ conversations });
            useLoadingStore.getState().setLoading('chat', false);
        });

        return unsubscribe;
    },

    selectConversation: (conversationId: string | null) => {
        set({ selectedConversationId: conversationId });

        // Mark as read when selecting conversation
        if (conversationId) {
            const { user } = useAuthStore.getState();
            if (user) {
                rtdbConversationService.resetUnreadCount(user.id, conversationId).catch(err => {
                    console.error("Lỗi reset unread count:", err);
                });
            }
        }
    },

    getOrCreateConversation: async (user1Id: string, user2Id: string) => {
        try {
            const conversationId = await rtdbConversationService.getOrCreateDirect(user1Id, user2Id);
            set({ selectedConversationId: conversationId });
            return conversationId;
        } catch (error) {
            console.error("Lỗi lấy hoặc tạo hội thoại:", error);
            throw error;
        }
    },

    searchConversations: async (userId: string, term: string) => {
        set({ searchTerm: term });
        useLoadingStore.getState().setLoading('contacts.search', true);

        try {
            if (!term.trim()) {
                set({ searchResults: { users: [] } });
                return;
            }

            const friendResults = await friendService.searchFriends(term, userId);
            set({ searchResults: { users: friendResults } });
        } catch (error) {
            console.error("Lỗi tìm bạn bè:", error);
        } finally {
            useLoadingStore.getState().setLoading('contacts.search', false);
        }
    },

    togglePin: async (conversationId: string, userId: string, pinned: boolean) => {
        try {
            await rtdbConversationService.togglePin(userId, conversationId, pinned);
        } catch (error) {
            console.error("Lỗi ghim hội thoại:", error);
            throw error;
        }
    },

    toggleMute: async (conversationId: string, userId: string, muted: boolean) => {
        try {
            await rtdbConversationService.toggleMute(userId, conversationId, muted);
        } catch (error) {
            console.error("Lỗi tắt thông báo:", error);
            throw error;
        }
    },

    toggleArchive: async (conversationId: string, userId: string, archived: boolean) => {
        try {
            await rtdbConversationService.toggleArchive(userId, conversationId, archived);
        } catch (error) {
            console.error("Lỗi lưu trữ hội thoại:", error);
            throw error;
        }
    },

    toggleMarkUnread: async (conversationId: string, userId: string, markedUnread: boolean) => {
        try {
            if (markedUnread) {
                await rtdbConversationService.markAsUnread(userId, conversationId);
            } else {
                await rtdbConversationService.resetUnreadCount(userId, conversationId);
            }
        } catch (error) {
            console.error("Lỗi đánh dấu chưa đọc:", error);
            throw error;
        }
    },

    deleteConversation: async (conversationId: string, userId: string) => {
        set(state => ({
            selectedConversationId: state.selectedConversationId === conversationId ? null : state.selectedConversationId
        }));

        if (get().clearMessages) {
            get().clearMessages(conversationId);
        }

        try {
            await rtdbConversationService.deleteConversation(userId, conversationId);
        } catch (error) {
            console.error("Lỗi xóa hội thoại:", error);
            throw error;
        }
    },

    setSearchFocused: (focused: boolean) => {
        set({ isSearchFocused: focused });
        if (!focused) {
            set({ searchTerm: '', searchResults: { users: [] } });
        }
    },

    addToSearchHistory: (item: User, userId: string) => {
        set((state) => {
            const userHistory = state.searchHistory[userId] || [];
            const filtered = userHistory.filter(h => h.id !== item.id);
            const newHistory = [item, ...filtered].slice(0, 10);
            return {
                searchHistory: {
                    ...state.searchHistory,
                    [userId]: newHistory
                }
            };
        });
    },

    removeFromSearchHistory: (itemId: string, userId: string) => {
        set((state) => ({
            searchHistory: {
                ...state.searchHistory,
                [userId]: (state.searchHistory[userId] || []).filter(h => h.id !== itemId)
            }
        }));
    },

    clearSearchHistory: (userId: string) => {
        set((state) => ({
            searchHistory: {
                ...state.searchHistory,
                [userId]: []
            }
        }));
    },

    setSearchTerm: (term: string) => {
        set({ searchTerm: term });
    },

    setIsChatVisible: (visible: boolean) => {
        set({ isChatVisible: visible });
    },

    markAllAsRead: async (userId: string) => {
        try {
            await rtdbConversationService.markAllAsRead(userId);
        } catch (error) {
            console.error("Lỗi đánh dấu tất cả đã đọc:", error);
        }
    },

    setTyping: async (conversationId: string, userId: string, isTyping: boolean) => {
        try {
            await rtdbConversationService.setTyping(conversationId, userId, isTyping);
        } catch (error) {
            console.error("Lỗi set typing:", error);
        }
    },

    subscribeToTyping: (conversationId: string) => {
        const unsubscribe = rtdbConversationService.subscribeToTyping(conversationId, (typingUserIds) => {
            set((state) => ({
                typingUsers: {
                    ...state.typingUsers,
                    [conversationId]: typingUserIds
                }
            }));
        });

        return unsubscribe;
    }
});
