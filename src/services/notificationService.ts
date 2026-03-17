import {
  collection,
  getDocs,
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
import NotificationSound from '../assets/sounds/message-notification.mp3';
import type { Notification } from '../../shared/types';
import { NotificationType } from '../../shared/types';
import { getValidatedEnvConfig } from '../utils/validateEnv';
import { convertDocs } from '../utils/firebaseUtils';
import { useRtdbChatStore } from '../store/rtdbChatStore';

const NOTIFICATION_SOUND_URL = NotificationSound;
let notificationAudio: HTMLAudioElement | null = null;

export const notificationService = {
  unlockAudio: () => {
    if (notificationAudio) return;
    notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
    notificationAudio.load();
    notificationAudio.play().then(() => {
      notificationAudio!.pause();
      notificationAudio!.currentTime = 0;
    }).catch(() => {
    });
  },

  // Phát âm báo
  playSound: (lastPlayedTimestamp: number): number => {
    const now = Date.now();
    if (now - lastPlayedTimestamp < 1500) return lastPlayedTimestamp;

    try {
      if (!notificationAudio) {
        notificationAudio = new Audio(NOTIFICATION_SOUND_URL);
      }
      notificationAudio.currentTime = 0;
      notificationAudio.volume = 1.0;
      notificationAudio.play().catch(err => console.debug('Audio play blocked:', err));
      return now;
    } catch (err) {
      console.error('Lỗi khi phát âm thanh:', err);
      return lastPlayedTimestamp;
    }
  },

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
      const q = query(
        collection(db, 'notifications'),
        where('receiverId', '==', userId)
      );
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
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

        const token = await getToken(messaging, {
          vapidKey: fbConfig.vapidKey,
          serviceWorkerRegistration: registration
        });

        if (token) {
          await setDoc(
            doc(db, 'users', userId, 'private', 'fcm'),
            { fcmTokens: arrayUnion(token), updatedAt: serverTimestamp() },
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

  // Lấy thông báo hệ thống mới nhất
  getLatestSystemNotifications: async (userId: string): Promise<Notification[]> => {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('receiverId', '==', userId),
        where('type', '==', NotificationType.SYSTEM),
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
        return notification.data.contentSnippet || 'Cập nhật về báo cáo vi phạm.';
      case NotificationType.SYSTEM:
        return notification.data.contentSnippet || 'Bạn có thông báo hệ thống mới.';
      default:
        return "Thông báo mới.";
    }
  },

  // Lắng nghe tin nhắn khi đang mở app
  initForegroundMessageHandler: (userId: string, selectedConversationId?: string | null) => {
    try {
      const messaging = getMessaging();
      let lastPlayedTimestamp = 0;

      const handlePayload = (payload: any) => {
        const data = payload.data;
        if (!data || data.senderId === userId) return;

        const chatStore = useRtdbChatStore.getState();
        const convMetadata = chatStore.conversations.find(c => c.id === data.convId);
        const isMuted = convMetadata?.userChat?.isMuted === true;
        const isMention = data.type === NotificationType.MENTION;

        if (isMuted && !isMention) return;

        const isBackground = document.visibilityState !== 'visible';
        const isDifferentConversation = selectedConversationId !== data.convId;

        if (isBackground || isDifferentConversation) {
          lastPlayedTimestamp = notificationService.playSound(lastPlayedTimestamp);
        }
      };

      const unsubscribeFCM = onMessage(messaging, handlePayload);

      const bc = new BroadcastChannel('fcm_notifications');
      bc.onmessage = (event) => handlePayload(event.data);

      return () => {
        unsubscribeFCM();
        bc.close();
      };
    } catch (err) {
      console.error('Lỗi khởi tạo Handler thông báo:', err);
      return () => {};
    }
  }
};
