import * as admin from 'firebase-admin';
import { db } from '../app';
import { NotificationType, NotificationData } from '../types';

export async function createNotification(data: NotificationData): Promise<string> {
  const { FieldValue } = admin.firestore;
  const docRef = await db.collection('notifications').add({
    ...data,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function getSenderName(senderId: string): Promise<string> {
  try {
    const userDoc = await db.collection('users').doc(senderId).get();
    return userDoc.data()?.fullName || 'Ai đó';
  } catch {
    return 'Ai đó';
  }
}

export function buildPushBody(
  type: NotificationType,
  senderName: string,
  extra?: { contentSnippet?: string }
): string {
  switch (type) {
    case NotificationType.REACTION:
      return `${senderName} đã bày tỏ cảm xúc về nội dung của bạn.`;
    case NotificationType.COMMENT:
      return extra?.contentSnippet
        ? `${senderName} đã bình luận: "${extra.contentSnippet}"`
        : `${senderName} đã bình luận.`;
    case NotificationType.FRIEND_REQUEST:
      return `${senderName} đã gửi lời mời kết bạn.`;
    case NotificationType.SYSTEM:
      return extra?.contentSnippet || 'Bạn có thông báo hệ thống mới.';
    default:
      return 'Bạn có thông báo mới.';
  }
}
