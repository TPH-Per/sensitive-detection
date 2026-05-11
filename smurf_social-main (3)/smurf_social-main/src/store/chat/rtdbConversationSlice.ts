import { StateCreator } from 'zustand';
import { RtdbConversation, RtdbUserChat, User } from '../../../shared/types';
import { rtdbConversationService } from '../../services/chat/rtdbConversationService';
import { friendService } from '../../services/friendService';
import { useAuthStore } from '../authStore';
import { useLoadingStore } from '../loadingStore';
import { useUserCache } from '../userCacheStore';
import { getDirectConversationId } from '../../utils/chatUtils';
import type { RtdbChatState } from '../rtdbChatStore';

export interface RtdbConversationSlice {
    conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
    selectedConversationId: string | null;
    searchTerm: string;
    isSearchFocused: boolean;
    searchResults: { 
        conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
        users: User[] 
    };
    searchHistory: Record<string, Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat } | User>>;
    isChatVisible: boolean;
    typingUsers: Record<string, string[]>;
    userChats: Record<string, RtdbUserChat>;

    subscribeToConversations: (userId: string) => () => void;
    selectConversation: (conversationId: string | null) => void;
    getOrCreateConversation: (user1Id: string, user2Id: string) => string;
    searchConversations: (userId: string, term: string) => Promise<void>;
    togglePin: (conversationId: string, userId: string, pinned: boolean) => Promise<void>;
    toggleMute: (conversationId: string, userId: string, muted: boolean) => Promise<void>;
    toggleArchive: (conversationId: string, userId: string, archived: boolean) => Promise<void>;
    toggleMarkUnread: (conversationId: string, userId: string, markedUnread: boolean) => Promise<void>;
    deleteConversation: (conversationId: string, userId: string) => Promise<void>;
    setSearchFocused: (focused: boolean) => void;
    addToSearchHistory: (item: User | { id: string; data: RtdbConversation; userChat: RtdbUserChat }, userId: string) => void;
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
    searchResults: { conversations: [], users: [] },
    searchHistory: {},
    isChatVisible: false,
    typingUsers: {},
    userChats: {},

    /** Theo dõi danh sách hội thoại */
    subscribeToConversations: (userId: string) => {
        const hasCache = get().conversations.length > 0;
        useLoadingStore.getState().setLoading('chat', !hasCache);

        const unsubscribe = rtdbConversationService.subscribeToUserConversations(userId, (conversations, allUserChats) => {
            const currentSelectedId = get().selectedConversationId;
            
            conversations.forEach(conv => {
                if (conv.id !== currentSelectedId && (conv.userChat?.unreadCount || 0) > 0) {
                    get().markAsDelivered(conv.id, userId).catch(() => {});
                }
            });

            const prevConversations = get().conversations;

            const prevIds = new Set(prevConversations.map(c => c.id));
            const newIds = new Set(conversations.map(c => c.id));

            for (const id of prevIds) {
                if (!newIds.has(id) && get().clearMessages) {
                    get().clearMessages(id);
                }
            }

            set(state => {
                const shouldReset = state.selectedConversationId &&
                    prevIds.has(state.selectedConversationId) &&
                    !newIds.has(state.selectedConversationId);

                const nextSelectedId = shouldReset ? null : state.selectedConversationId;

                return {
                    conversations,
                    selectedConversationId: nextSelectedId,
                    userChats: allUserChats
                };
            });
            useLoadingStore.getState().setLoading('chat', false);
        });

        return unsubscribe;
    },

    /** Lựa chọn hội thoại */
    selectConversation: (conversationId: string | null) => {
        set({ selectedConversationId: conversationId });

        if (conversationId && get().conversations.some(c => c.id === conversationId)) {
            const { user } = useAuthStore.getState();
            if (user) {
                rtdbConversationService.resetUnreadCount(user.id, conversationId).catch(err => {
                    console.error("Lỗi reset unread count:", err);
                });
            }
        }
    },

    /** Lấy hoặc tạo hội thoại cá nhân */
    getOrCreateConversation: (user1Id: string, user2Id: string) => {
        const conversationId = getDirectConversationId(user1Id, user2Id);
        set({ selectedConversationId: conversationId });
        return conversationId;
    },

    /** Tìm kiếm hội thoại */
    searchConversations: async (userId: string, term: string) => {
        set({ searchTerm: term });
        useLoadingStore.getState().setLoading('contacts.search', true);

        try {
            if (!term.trim()) {
                set({ searchResults: { conversations: [], users: [] } });
                return;
            }

            const termLower = term.toLowerCase();
            const { users: usersMap } = useUserCache.getState();
            const allConversations = get().conversations;

            const matchedConversations = allConversations.filter(conv => {
                if (conv.data.isGroup) {
                    return conv.data.name?.toLowerCase().includes(termLower);
                }
                
                const partnerId = Object.keys(conv.data.members).find(id => id !== userId);
                const partner = partnerId ? usersMap[partnerId] : null;
                return partner?.fullName?.toLowerCase().includes(termLower);
            });

            const friendResults = await friendService.searchFriends(term, userId);
            
            const matchedPartnerIds = new Set(
                matchedConversations
                    .filter(c => !c.data.isGroup)
                    .map(c => Object.keys(c.data.members).find(id => id !== userId))
                    .filter(Boolean)
            );

            const filteredFriends = friendResults.filter(u => !matchedPartnerIds.has(u.id));
            
            set({ 
                searchResults: { 
                    conversations: matchedConversations,
                    users: filteredFriends 
                } 
            });
        } catch (error) {
            console.error("Lỗi tìm kiếm:", error);
        } finally {
            useLoadingStore.getState().setLoading('contacts.search', false);
        }
    },

    /** Ghim hội thoại */
    togglePin: async (conversationId: string, userId: string, pinned: boolean) => {
        set(state => ({
            conversations: state.conversations.map(c =>
                c.id === conversationId
                    ? { ...c, userChat: { ...c.userChat, isPinned: pinned } }
                    : c
            ),
            userChats: {
                ...state.userChats,
                [conversationId]: { ...state.userChats[conversationId], isPinned: pinned }
            }
        }));

        try {
            await rtdbConversationService.togglePin(userId, conversationId, pinned);
        } catch (error) {
            set(state => ({
                conversations: state.conversations.map(c =>
                    c.id === conversationId
                        ? { ...c, userChat: { ...c.userChat, isPinned: !pinned } }
                        : c
                ),
                userChats: {
                    ...state.userChats,
                    [conversationId]: { ...state.userChats[conversationId], isPinned: !pinned }
                }
            }));
            console.error("Lỗi ghim hội thoại:", error);
            throw error;
        }
    },

    /** Tắt thông báo hội thoại */
    toggleMute: async (conversationId: string, userId: string, muted: boolean) => {
        set(state => ({
            conversations: state.conversations.map(c =>
                c.id === conversationId
                    ? { ...c, userChat: { ...c.userChat, isMuted: muted } }
                    : c
            ),
            userChats: {
                ...state.userChats,
                [conversationId]: { ...state.userChats[conversationId], isMuted: muted }
            }
        }));

        try {
            await rtdbConversationService.toggleMute(userId, conversationId, muted);
        } catch (error) {
            set(state => ({
                conversations: state.conversations.map(c =>
                    c.id === conversationId
                        ? { ...c, userChat: { ...c.userChat, isMuted: !muted } }
                        : c
                ),
                userChats: {
                    ...state.userChats,
                    [conversationId]: { ...state.userChats[conversationId], isMuted: !muted }
                }
            }));
            console.error("Lỗi tắt thông báo:", error);
            throw error;
        }
    },

    /** Lưu trữ hội thoại */
    toggleArchive: async (conversationId: string, userId: string, archived: boolean) => {
        set(state => ({
            conversations: state.conversations.map(c =>
                c.id === conversationId
                    ? { ...c, userChat: { ...c.userChat, isArchived: archived } }
                    : c
            ),
            userChats: {
                ...state.userChats,
                [conversationId]: { ...state.userChats[conversationId], isArchived: archived }
            }
        }));

        try {
            await rtdbConversationService.toggleArchive(userId, conversationId, archived);
        } catch (error) {
            set(state => ({
                conversations: state.conversations.map(c =>
                    c.id === conversationId
                        ? { ...c, userChat: { ...c.userChat, isArchived: !archived } }
                        : c
                ),
                userChats: {
                    ...state.userChats,
                    [conversationId]: { ...state.userChats[conversationId], isArchived: !archived }
                }
            }));
            console.error("Lỗi lưu trữ hội thoại:", error);
            throw error;
        }
    },

    /** Đánh dấu chưa đọc */
    toggleMarkUnread: async (conversationId: string, userId: string, markedUnread: boolean) => {
        const prevUnread = get().userChats[conversationId]?.unreadCount ?? 0;
        const nextUnread = markedUnread ? Math.max(prevUnread, 1) : 0;

        set(state => ({
            conversations: state.conversations.map(c =>
                c.id === conversationId
                    ? { ...c, userChat: { ...c.userChat, unreadCount: nextUnread } }
                    : c
            ),
            userChats: {
                ...state.userChats,
                [conversationId]: { ...state.userChats[conversationId], unreadCount: nextUnread }
            }
        }));

        try {
            if (markedUnread) {
                await rtdbConversationService.markAsUnread(userId, conversationId);
            } else {
                await rtdbConversationService.resetUnreadCount(userId, conversationId);
            }
        } catch (error) {
            set(state => ({
                conversations: state.conversations.map(c =>
                    c.id === conversationId
                        ? { ...c, userChat: { ...c.userChat, unreadCount: prevUnread } }
                        : c
                ),
                userChats: {
                    ...state.userChats,
                    [conversationId]: { ...state.userChats[conversationId], unreadCount: prevUnread }
                }
            }));
            console.error("Đánh dấu chưa đọc thất bại:", error);
            throw error;
        }
    },

    /** Xóa hội thoại */
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

    /** Trạng thái tập trung tìm kiếm */
    setSearchFocused: (focused: boolean) => {
        set({ isSearchFocused: focused });
        if (!focused) {
            set({ searchTerm: '', searchResults: { conversations: [], users: [] } });
        }
    },

    /** Thêm vào lịch sử tìm kiếm */
    addToSearchHistory: (item: User | { id: string; data: RtdbConversation; userChat: RtdbUserChat }, userId: string) => {
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

    /** Xóa khỏi lịch sử tìm kiếm */
    removeFromSearchHistory: (itemId: string, userId: string) => {
        set((state) => ({
            searchHistory: {
                ...state.searchHistory,
                [userId]: (state.searchHistory[userId] || []).filter(h => h.id !== itemId)
            }
        }));
    },

    /** Xóa toàn bộ lịch sử tìm kiếm */
    clearSearchHistory: (userId: string) => {
        set((state) => ({
            searchHistory: {
                ...state.searchHistory,
                [userId]: []
            }
        }));
    },

    /** Cập nhật từ khóa tìm kiếm */
    setSearchTerm: (term: string) => {
        set({ searchTerm: term });
    },

    /** Trạng thái hiển thị khung chat */
    setIsChatVisible: (visible: boolean) => {
        set({ isChatVisible: visible });
    },

    /** Đánh dấu tất cả đã đọc */
    markAllAsRead: async (userId: string) => {
        try {
            await rtdbConversationService.markAllAsRead(userId);
        } catch (error) {
            console.error("Lỗi đánh dấu tất cả đã đọc:", error);
        }
    },

    /** Cập nhật trạng thái đang nhập */
    setTyping: async (conversationId: string, userId: string, isTyping: boolean) => {
        try {
            await rtdbConversationService.setTyping(conversationId, userId, isTyping);
        } catch (error) {
            console.error("Lỗi set typing:", error);
        }
    },

    /** Theo dõi trạng thái đang nhập */
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
