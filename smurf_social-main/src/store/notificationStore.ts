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

      setNotifications: (notifications) => {
        const unreadCount = notifications.filter(n => !n.isRead).length;
        set({ notifications, unreadCount });
      },

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

      markAllAsRead: async (userId) => {
        await notificationService.markAllAsRead(userId);
        set((state) => ({
          notifications: state.notifications.map(n => ({ ...n, isRead: true })),
          unreadCount: 0
        }));
      },

      deleteNotification: async (id) => {
        const notification = get().notifications.find(n => n.id === id);
        if (!notification) return;

        await notificationService.deleteNotification(id);
        set((state) => ({
          notifications: state.notifications.filter(n => n.id !== id),
          unreadCount: notification.isRead ? state.unreadCount : Math.max(0, state.unreadCount - 1)
        }));
      },

      clearAllNotifications: async (userId) => {
        await notificationService.deleteAllNotifications(userId);
        set({ notifications: [], unreadCount: 0 });
      },

      initialize: (userId, limit = PAGINATION.NOTIFICATIONS) => {
        const { _unsubscribe } = get();
        if (_unsubscribe) _unsubscribe();

        useLoadingStore.getState().setLoading('notifications', true);
        set({ currentLimit: limit });

        const unsubscribe = notificationService.subscribeToNotifications(userId, (notifications) => {
          get().setNotifications(notifications);
          useLoadingStore.getState().setLoading('notifications', false);
        }, limit);

        set({ _unsubscribe: unsubscribe });

        notificationService.requestPushPermission(userId).catch(err => {
          console.warn("Lỗi push permission:", err);
        });

        return unsubscribe;
      },

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
