import {
  collection,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  onSnapshot,
  writeBatch,
  limit,
  arrayUnion,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';
import { db } from '../firebase/config';
import type { Notification } from '../../shared/types';
import { NotificationType } from '../../shared/types';
import { getValidatedEnvConfig } from '../utils/validateEnv';
import { convertDocs } from '../utils/firebaseUtils';

export const notificationService = {
  /** Theo dõi thông báo thời gian thực */
  subscribeToNotifications: (
    userId: string,
    callback: (notifications: Notification[]) => void,
    limitCount: number = 20,
    onError?: (error: unknown) => void
  ) => {
    const q = query(
      collection(db, 'notifications'),
      where('receiverId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        callback(convertDocs<Notification>(snapshot.docs));
      },
      (error) => {
        console.error('Lỗi subscribeToNotifications:', error);
        onError?.(error);
      }
    );
  },

  /** Đánh dấu thông báo đã đọc */
  markAsRead: async (notificationId: string): Promise<void> => {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, {
        isRead: true,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Lỗi markAsRead:', err);
    }
  },

  /** Đánh dấu tất cả đã đọc */
  markAllAsRead: async (userId: string): Promise<void> => {
    try {
      const CHUNK_SIZE = 400;
      let hasMore = true;

      while (hasMore) {
        const q = query(
          collection(db, 'notifications'),
          where('receiverId', '==', userId),
          where('isRead', '==', false),
          limit(CHUNK_SIZE)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
          batch.update(doc.ref, {
            isRead: true,
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        hasMore = snapshot.size === CHUNK_SIZE;
      }
    } catch (err) {
      console.error('Lỗi markAllAsRead:', err);
    }
  },

  /** Xóa thông báo */
  deleteNotification: async (notificationId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Lỗi deleteNotification:', error);
      throw error;
    }
  },

  /** Xóa toàn bộ thông báo */
  deleteAllNotifications: async (userId: string): Promise<void> => {
    try {
      const CHUNK_SIZE = 400;
      let hasMore = true;

      while (hasMore) {
        const q = query(
          collection(db, 'notifications'),
          where('receiverId', '==', userId),
          limit(CHUNK_SIZE)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) break;

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        hasMore = snapshot.size === CHUNK_SIZE;
      }
    } catch (error) {
      console.error('Lỗi deleteAllNotifications:', error);
      throw error;
    }
  },

  /** Đăng ký nhận thông báo đẩy */
  requestPushPermission: async (userId: string): Promise<string | null> => {
    try {
      const permission = await window.Notification.requestPermission();
      if (permission === 'granted') {
        const messaging = getMessaging();
        const { firebase: fbConfig } = getValidatedEnvConfig();
        const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(fbConfig.apiKey)}&authDomain=${encodeURIComponent(fbConfig.authDomain)}&projectId=${encodeURIComponent(fbConfig.projectId)}&storageBucket=${encodeURIComponent(fbConfig.storageBucket)}&messagingSenderId=${encodeURIComponent(fbConfig.messagingSenderId)}&appId=${encodeURIComponent(fbConfig.appId)}`;

        const registration = await navigator.serviceWorker.register(swUrl, {
          scope: '/'
        });

        await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          vapidKey: fbConfig.vapidKey,
          serviceWorkerRegistration: registration
        });

        if (token) {
          const fcmRef = doc(db, 'users', userId, 'private', 'fcm');
          const fcmSnap = await getDoc(fcmRef);
          await setDoc(
            fcmRef,
            {
              fcmTokens: arrayUnion(token),
              ...(fcmSnap.exists() ? {} : { createdAt: serverTimestamp() }),
              updatedAt: serverTimestamp()
            },
            { merge: true }
          );
          return token;
        }
      }
      return null;
    } catch (err) {
      console.error('Lỗi requestPushPermission:', err);
      return null;
    }
  },

  /** Lấy thông báo hệ thống mới nhất */
  getLatestSystemNotifications: async (userId: string): Promise<Notification[]> => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('receiverId', '==', userId),
        where('type', '==', NotificationType.REPORT),
        orderBy('createdAt', 'desc'),
        limit(5)
      );
      const snapshot = await getDocs(q);
      return convertDocs<Notification>(snapshot.docs);
    } catch (err) {
      console.error('Lỗi getLatestSystemNotifications:', err);
      return [];
    }
  },

  /** Lấy nội dung hiển thị thông báo */
  getNotificationText: (notification: Notification): string => {
    switch (notification.type) {
      case NotificationType.REACTION:
        return `đã bày tỏ cảm xúc về nội dung của bạn.`;
      case NotificationType.COMMENT:
        return notification.data.contentSnippet
          ? `đã bình luận: "${notification.data.contentSnippet}"`
          : `đã bình luận.`;
      case NotificationType.FRIEND_REQUEST:
        return `đã gửi lời mời kết bạn.`;
      case NotificationType.FRIEND_ACCEPT:
        return `đã chấp nhận lời mời kết bạn.`;
      case NotificationType.REPORT:
      case NotificationType.SYSTEM:
        return notification.data.contentSnippet || "Thông báo hệ thống mới.";
      default:
        return "Thông báo mới.";
    }
  },

};
