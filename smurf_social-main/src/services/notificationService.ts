import { RefObject } from 'react';
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
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { db } from '../firebase/config';
import type { Notification } from '../../shared/types';
import { NotificationType } from '../../shared/types';
import { getValidatedEnvConfig } from '../utils/validateEnv';
import { convertDocs } from '../utils/firebaseUtils';
import { useRtdbChatStore } from '../store/rtdbChatStore';
import { soundManager } from './soundManager';

export const notificationService = {
  // Theo dõi thông báo mới nhất
  subscribeToNotifications: (userId: string, callback: (notifications: Notification[]) => void, limitCount: number = 20) => {
    const q = query(
      collection(db, 'notifications'),
      where('receiverId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
      callback(convertDocs<Notification>(snapshot.docs));
    });
  },

  // Đánh dấu thông báo đã đọc
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

  // Đánh dấu tất cả là đã đọc
  markAllAsRead: async (userId: string): Promise<void> => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('receiverId', '==', userId),
        where('isRead', '==', false)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          isRead: true,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    } catch (err) {
      console.error('Lỗi markAllAsRead:', err);
    }
  },

  // Xóa thông báo
  deleteNotification: async (notificationId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Lỗi deleteNotification:', error);
      throw error;
    }
  },

  // Xóa tất cả thông báo
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

  // Đăng ký FCM Token
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

  // Lấy thông báo mới nhất
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

  // Văn bản hiển thị cho thông báo
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
      case NotificationType.REPORT:
      case NotificationType.SYSTEM:
        return notification.data.contentSnippet || "Thông báo hệ thống mới.";
      default:
        return "Thông báo mới.";
    }
  },

  // Lắng nghe tin nhắn khi đang mở app
  initForegroundMessageHandler: (userId: string, selectedConversationRef?: RefObject<string | null>) => {
    try {
      const messaging = getMessaging();

      const handlePayload = (payload: any) => {
        const data = payload.data;
        if (!data) return;

        if (data.senderId && data.senderId === userId) return;

        const isMention = data.type === NotificationType.MENTION;
        const isChat = data.type === NotificationType.CHAT;

        if (isChat || isMention) {
          const chatStore = useRtdbChatStore.getState();
          const convId = data.convId;
          const convMetadata = chatStore.conversations.find(c => c.id === convId);
          const isMuted = convMetadata?.userChat?.isMuted === true;
          if (isMuted && !isMention) return;

          const currentSelectedId = selectedConversationRef?.current;
          const isTabFocused = document.visibilityState === 'visible';

          if (currentSelectedId !== convId || !isTabFocused) {
            soundManager.play('message');
          }
        }
      };

      const unsubscribeFCM = onMessage(messaging, handlePayload);

      return () => {
        unsubscribeFCM();
      };
    } catch (err) {
      console.error('Lỗi khởi tạo Handler thông báo:', err);
      return () => { };
    }
  }
};
