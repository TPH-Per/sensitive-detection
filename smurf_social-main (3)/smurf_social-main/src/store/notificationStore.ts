import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Notification } from '../../shared/types';
import { notificationService } from '../services/notificationService';
import { PAGINATION } from '../constants/appConfig';
import { useLoadingStore } from './loadingStore';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  currentLimit: number;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: (userId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: (userId: string) => Promise<void>;
  initialize: (userId: string, limit?: number) => () => void;
  loadMore: (userId: string) => void;
  reset: () => void;
  _unsubscribe: (() => void) | null;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,
      currentLimit: PAGINATION.NOTIFICATIONS,
      _unsubscribe: null as (() => void) | null,

      /** Đặt lại trạng thái thông báo */
      reset: () => {
        const { _unsubscribe } = get();
        if (_unsubscribe) _unsubscribe();

        set({
          notifications: [],
          unreadCount: 0,
          currentLimit: PAGINATION.NOTIFICATIONS,
          _unsubscribe: null,
        });
      },

      /** Cập nhật danh sách thông báo */
      setNotifications: (notifications) => {
        const unreadCount = notifications.filter(n => !n.isRead).length;
        set({ notifications, unreadCount });
      },

      /** Thêm thông báo mới */
      addNotification: (notification) => {
        set((state) => {
          const exists = state.notifications.find(n => n.id === notification.id);
          if (exists) return state;

          const newNotifications = [notification, ...state.notifications];
          return {
            notifications: newNotifications,
            unreadCount: state.unreadCount + (notification.isRead ? 0 : 1)
          };
        });
      },

      /** Đánh dấu đã đọc thông báo */
      markAsRead: async (id) => {
        const notification = get().notifications.find(n => n.id === id);
        const wasUnread = notification && !notification.isRead;

        set((state) => ({
          notifications: state.notifications.map(n =>
            n.id === id ? { ...n, isRead: true } : n
          ),
          unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
        }));

        try {
          await notificationService.markAsRead(id);
        } catch (error) {
          console.error("Lỗi đánh dấu đã đọc:", error);
          set((state) => ({
            notifications: state.notifications.map(n =>
              n.id === id ? { ...n, isRead: false } : n
            ),
            unreadCount: wasUnread ? state.unreadCount + 1 : state.unreadCount
          }));
        }
      },

      /** Đánh dấu tất cả đã đọc */
      markAllAsRead: async (userId) => {
        const previousNotifications = [...get().notifications];
        const previousUnreadCount = get().unreadCount;

        set((state) => ({
          notifications: state.notifications.map(n => ({ ...n, isRead: true })),
          unreadCount: 0
        }));

        try {
          await notificationService.markAllAsRead(userId);
        } catch (error) {
          console.error("Lỗi đánh dấu tất cả đã đọc:", error);
          set({ notifications: previousNotifications, unreadCount: previousUnreadCount });
        }
      },

      /** Xóa thông báo */
      deleteNotification: async (id) => {
        const previousNotifications = [...get().notifications];
        const previousUnreadCount = get().unreadCount;
        const notification = previousNotifications.find(n => n.id === id);
        
        if (!notification) return;

        set((state) => ({
          notifications: state.notifications.filter(n => n.id !== id),
          unreadCount: notification.isRead ? state.unreadCount : Math.max(0, state.unreadCount - 1)
        }));

        try {
          await notificationService.deleteNotification(id);
        } catch (error) {
          console.error("Lỗi xóa thông báo:", error);
          set({ notifications: previousNotifications, unreadCount: previousUnreadCount });
        }
      },

      /** Xóa tất cả thông báo */
      clearAllNotifications: async (userId) => {
        await notificationService.deleteAllNotifications(userId);
        set({ notifications: [], unreadCount: 0 });
      },

      /** Khởi tạo và theo dõi thông báo */
      initialize: (userId, limit = PAGINATION.NOTIFICATIONS) => {
        const { _unsubscribe, currentLimit } = get();
        
        if (_unsubscribe && currentLimit === limit) return _unsubscribe;
        if (_unsubscribe) _unsubscribe();

        useLoadingStore.getState().setLoading('notifications', true);
        set({ currentLimit: limit });

        const unsubscribe = notificationService.subscribeToNotifications(
          userId,
          (notifications) => {
            get().setNotifications(notifications);
            useLoadingStore.getState().setLoading('notifications', false);
          },
          limit,
          () => {
            useLoadingStore.getState().setLoading('notifications', false);
          }
        );

        const wrappedUnsubscribe = () => {
          unsubscribe();
          if (get()._unsubscribe === wrappedUnsubscribe) {
            set({ _unsubscribe: null });
          }
        };

        set({ _unsubscribe: wrappedUnsubscribe });

        if (window.Notification?.permission === 'default') {
          notificationService.requestPushPermission(userId).catch(err => {
            console.warn("Lỗi push permission:", err);
          });
        }

        return wrappedUnsubscribe;
      },

      /** Tải thêm thông báo */
      loadMore: (userId) => {
        const newLimit = get().currentLimit + PAGINATION.NOTIFICATIONS;
        get().initialize(userId, newLimit);
      }
    }), {
    name: 'smurf_notify_cache',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      notifications: state.notifications.slice(0, PAGINATION.NOTIFY_CACHE_LIMIT),
      unreadCount: state.unreadCount
    }),
  }));
import { registerStore } from './storeUtils';
registerStore(() => useNotificationStore.getState().reset());
