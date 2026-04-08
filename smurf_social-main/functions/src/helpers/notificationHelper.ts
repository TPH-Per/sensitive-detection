import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';
import { NotificationType, NotificationData } from '../types';


/**
 * Tạo thông báo
 */
export async function createNotification(data: NotificationData): Promise<string> {

  const docRef = await db.collection('notifications').add({
    ...data,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Lấy tên người gửi
 */
export async function getSenderName(senderId: string): Promise<string> {
  if (senderId === 'system') return 'Hệ thống';
  try {
    const userDoc = await db.collection('users').doc(senderId).get();
    return userDoc.data()?.fullName || 'Ai đó';
  } catch {
    return 'Ai đó';
  }
}

/**
 * Xây dựng nội dung push notification
 */
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
    case NotificationType.CHAT:
      return extra?.contentSnippet || 'Bạn có tin nhắn mới.';
    case NotificationType.MENTION:
      return `${senderName} đã nhắc tên bạn trong một cuộc trò chuyện.`;
    case NotificationType.REPORT:
      return extra?.contentSnippet || 'Cập nhật về báo cáo vi phạm.';
    case NotificationType.SYSTEM:
      return extra?.contentSnippet || 'Bạn có thông báo hệ thống mới.';
    default:
      return 'Bạn có thông báo mới.';
  }
}
