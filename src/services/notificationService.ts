import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
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
import { NotificationType, ReportReason } from '../../shared/types';
import { REPORT_CONFIG } from '../constants/appConfig';
import { getValidatedEnvConfig } from '../utils/validateEnv';
import { convertDocs } from '../utils/firebaseUtils';

export const notificationService = {
  // Theo dõi thông báo mới nhất.
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

  // Đánh dấu thông báo là đã đọc
  markAsRead: async (notificationId: string): Promise<void> => {
    try {
      const docRef = doc(db, 'notifications', notificationId);
      await updateDoc(docRef, { isRead: true });
    } catch (error) {
      console.error("Lỗi đánh dấu đã đọc:", error);
    }
  },

  // Đánh dấu tất cả thông báo là đã đọc
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
        batch.update(doc.ref, { isRead: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Lỗi đánh dấu tất cả đã đọc:", error);
    }
  },

  // Xóa một thông báo
  deleteNotification: async (notificationId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error("Lỗi xóa thông báo:", error);
      throw error;
    }
  },

  // Xóa tất cả thông báo của người dùng
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
      console.error("Lỗi xóa tất cả thông báo:", error);
      throw error;
    }
  },

  // Yêu cầu quyền FCM và lưu Token
  requestPushPermission: async (userId: string): Promise<string | null> => {
    try {
      const messaging = getMessaging();
      const permission = await window.Notification.requestPermission();

      if (permission === 'granted') {
        const { firebase } = getValidatedEnvConfig();
        const token = await getToken(messaging, {
          vapidKey: firebase.vapidKey
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
    } catch (error) {
      console.error("Lỗi đăng ký Push:", error);
      return null;
    }
  },

  // Helper để lấy text hiển thị ngắn gọn cho thông báo
  getNotificationText: (notification: Notification, senderName: string): string => {
    const isInteraction = [
      NotificationType.REACTION,
      NotificationType.COMMENT,
      NotificationType.FRIEND_REQUEST
    ].includes(notification.type);

    const prefix = (senderName && isInteraction) ? `${senderName} ` : '';

    switch (notification.type) {
      case NotificationType.REACTION:
        return `${prefix}đã bày tỏ cảm xúc về nội dung của bạn.`;
      case NotificationType.COMMENT:
        return notification.data.contentSnippet
          ? `${prefix}đã bình luận: "${notification.data.contentSnippet}"`
          : `${prefix}đã bình luận.`;
      case NotificationType.FRIEND_REQUEST:
        return `${prefix}đã gửi lời mời kết bạn.`;
      case NotificationType.REPORT:
        return notification.data.contentSnippet || 'Cập nhật về báo cáo vi phạm.';
      case NotificationType.SYSTEM:
        return notification.data.contentSnippet || 'Bạn có thông báo hệ thống mới.';
      default:
        return "Thông báo mới.";
    }
  }
};


