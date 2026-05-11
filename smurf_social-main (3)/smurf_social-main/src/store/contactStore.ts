import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, FriendRequest, FriendRequestStatus } from '../../shared/types';
import { Timestamp } from 'firebase/firestore';
import { userService } from '../services/userService';
import { friendService } from '../services/friendService';
import { useLoadingStore } from './loadingStore';
import { useAuthStore } from './authStore';
import { usePostStore } from './posts';

interface ContactState {
  friends: User[];
  receivedRequests: FriendRequest[];
  sentRequests: FriendRequest[];
  searchResults: User[];
  suggestions: User[];

  subscribeToFriends: (userId: string) => () => void;
  subscribeToRequests: (userId: string) => () => void;
  searchUsers: (searchTerm: string, userId: string) => Promise<User[]>;
  loadSuggestions: (userId: string) => Promise<void>;
  refreshSuggestions: (limit?: number, force?: boolean) => Promise<void>;
  dismissSuggestion: (userId: string) => void;

  sendFriendRequest: (senderId: string, receiverId: string) => Promise<void>;
  acceptFriendRequest: (requestId: string, senderId: string, receiverId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  cancelFriendRequest: (requestId: string) => Promise<void>;
  unfriend: (userId: string, friendId: string) => Promise<void>;

  clearSearchResults: () => void;
  reset: () => void;
}

export const useContactStore = create<ContactState>()(
  persist(
    (set, get) => ({
      friends: [],
      receivedRequests: [],
      sentRequests: [],
      searchResults: [],
      suggestions: [],

      /** Đặt lại trạng thái danh sách liên hệ */
      reset: () => {
        set({
          friends: [],
          receivedRequests: [],
          sentRequests: [],
          searchResults: [],
          suggestions: [],
        });
      },

      /** Theo dõi danh sách bạn bè */
      subscribeToFriends: (userId: string) => {
        useLoadingStore.getState().setLoading('contacts.friends', true);
        return friendService.subscribeToFriends(userId, (friends) => {
          set({ friends });
          useLoadingStore.getState().setLoading('contacts.friends', false);
        });
      },

      /** Theo dõi lời mời kết bạn */
      subscribeToRequests: (userId: string) => {
        const unsubscribeReceived = friendService.subscribeToReceivedRequests(userId, (requests) => {
          set({ receivedRequests: requests });
        });

        const unsubscribeSent = friendService.subscribeToSentRequests(userId, (requests) => {
          set({ sentRequests: requests });
        });

        return () => {
          unsubscribeReceived();
          unsubscribeSent();
        };
      },

      /** Tìm kiếm người dùng */
      searchUsers: async (searchTerm: string, userId: string) => {
        if (!searchTerm.trim()) {
          set({ searchResults: [] });
          return [];
        }

        useLoadingStore.getState().setLoading('contacts.search', true);
        try {
          const results = await userService.searchUsers(searchTerm, userId);
          set({ searchResults: results });
          return results;
        } finally {
          useLoadingStore.getState().setLoading('contacts.search', false);
        }
      },

      /** Tải gợi ý kết bạn */
      loadSuggestions: async (userId: string) => {
        useLoadingStore.getState().setLoading('contacts.suggestions', true);
        try {
          const suggestions = await friendService.getCachedSuggestions(userId);
          const state = get();
          const excludeIds = new Set([
            ...state.friends.map(f => f.id),
            ...state.sentRequests.map(r => r.receiverId),
            ...state.receivedRequests.map(r => r.senderId),
          ]);
          set({ suggestions: suggestions.filter(u => !excludeIds.has(u.id)) });
        } finally {
          useLoadingStore.getState().setLoading('contacts.suggestions', false);
        }
      },

      /** Làm mới gợi ý kết bạn */
      refreshSuggestions: async (limit?: number, force: boolean = true) => {
        useLoadingStore.getState().setLoading('contacts.suggestions', true);
        try {
          const suggestionIds = await friendService.generateFriendSuggestions(limit, force);
          if (suggestionIds.length > 0) {
            const userId = useAuthStore.getState().user?.id;
            if (userId) {
              const suggestions = await friendService.getCachedSuggestions(userId);
              const state = get();
              const excludeIds = new Set([
                ...state.friends.map(f => f.id),
                ...state.sentRequests.map(r => r.receiverId),
                ...state.receivedRequests.map(r => r.senderId),
              ]);
              set({ suggestions: suggestions.filter(u => !excludeIds.has(u.id)) });
            }
          } else {
            set({ suggestions: [] });
          }
        } finally {
          useLoadingStore.getState().setLoading('contacts.suggestions', false);
        }
      },

      /** Bỏ qua gợi ý kết bạn */
      dismissSuggestion: (userId: string) => {
        set(state => ({
          suggestions: state.suggestions.filter(u => u.id !== userId),
        }));
      },

      /** Gửi lời mời kết bạn */
      sendFriendRequest: async (senderId: string, receiverId: string) => {
        const tempId = `temp-${Date.now()}`;
        const tempRequest: FriendRequest = {
          id: tempId,
          senderId,
          receiverId,
          status: FriendRequestStatus.PENDING,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };

        set(state => ({
          sentRequests: [tempRequest, ...state.sentRequests]
        }));

        try {
          const realRequest = await friendService.sendFriendRequest(senderId, receiverId);
          if (realRequest) {
            set(state => ({
              sentRequests: state.sentRequests.map(r => r.id === tempId ? realRequest : r)
            }));
          }
        } catch (error) {
          console.error("Lỗi gửi lời mời:", error);
          set(state => ({
            sentRequests: state.sentRequests.filter(r => r.id !== tempId)
          }));
          throw error;
        }
      },

      /** Chấp nhận lời mời kết bạn */
      acceptFriendRequest: async (requestId: string, senderId: string, receiverId: string) => {
        const previousRequests = get().receivedRequests;
        set(state => ({
          receivedRequests: state.receivedRequests.filter(r => r.id !== requestId)
        }));

        try {
          await friendService.acceptFriendRequest(requestId, senderId, receiverId);
        } catch (error) {
          set({ receivedRequests: previousRequests });
          console.error("Lỗi chấp nhận kết bạn:", error);
          throw error;
        }
      },

      /** Từ chối lời mời kết bạn */
      rejectFriendRequest: async (requestId: string) => {
        const previousRequests = get().receivedRequests;
        set(state => ({
          receivedRequests: state.receivedRequests.filter(r => r.id !== requestId)
        }));

        try {
          await friendService.rejectFriendRequest(requestId);
        } catch (error) {
          set({ receivedRequests: previousRequests });
          console.error("Lỗi từ chối kết bạn:", error);
          throw error;
        }
      },

      /** Hủy lời mời kết bạn đã gửi */
      cancelFriendRequest: async (requestId: string) => {
        const previousRequests = get().sentRequests;
        set(state => ({
          sentRequests: state.sentRequests.filter(r => r.id !== requestId)
        }));

        try {
          await friendService.cancelFriendRequest(requestId);
        } catch (error) {
          set({ sentRequests: previousRequests });
          console.error("Lỗi hủy lời mời:", error);
          throw error;
        }
      },

      /** Hủy kết bạn */
      unfriend: async (userId: string, friendId: string) => {
        const previousFriends = get().friends;
        set((state) => ({
          friends: state.friends.filter(f => f.id !== friendId)
        }));

        try {
          await friendService.unfriend(userId, friendId);
          usePostStore.getState().filterPostsByAuthor(friendId);
        } catch (error) {
          set({ friends: previousFriends });
          console.error("Lỗi hủy kết bạn:", error);
          throw error;
        }
      },

      /** Xóa kết quả tìm kiếm */
      clearSearchResults: () => set({ searchResults: [] }),
    }),
    {
      name: 'smurf_contact_cache',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        friends: state.friends,
        receivedRequests: state.receivedRequests,
        sentRequests: state.sentRequests,
        suggestions: state.suggestions,
      }),
    }
  )
);
import { registerStore } from './storeUtils';
registerStore(() => useContactStore.getState().reset());
