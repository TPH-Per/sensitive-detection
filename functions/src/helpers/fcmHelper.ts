import { messaging, db } from '../app';
import { NotificationType } from '../types';

// Titles cho từng loại notification
const NOTIFICATION_TITLES: Partial<Record<NotificationType, string>> = {
  [NotificationType.REACTION]: 'Cảm xúc mới',
  [NotificationType.COMMENT]: 'Bình luận mới',
  [NotificationType.FRIEND_REQUEST]: 'Lời mời kết bạn',
  [NotificationType.SYSTEM]: 'Thông báo hệ thống',
  [NotificationType.REPORT]: 'Báo cáo vi phạm',
};

async function getUserFcmTokens(userId: string): Promise<string[]> {
  try {
    const fcmDoc = await db.collection('users').doc(userId)
      .collection('private').doc('fcm').get();
    if (!fcmDoc.exists) return [];
    return fcmDoc.data()?.tokens || [];
  } catch {
    return [];
  }
}

// Tự dọn token khi FCM báo invalid
async function removeInvalidToken(userId: string, token: string): Promise<void> {
  try {
    const { FieldValue } = await import('firebase-admin/firestore');
    await db.collection('users').doc(userId)
      .collection('private').doc('fcm')
      .update({ tokens: FieldValue.arrayRemove(token) });
  } catch {
    // Bỏ qua
  }
}

interface SendPushOptions {
  receiverId: string;
  type: NotificationType;
  body: string;
  data?: Record<string, string>;
}

// Gửi FCM đến tất cả thiết bị của user
export async function sendPushNotification(opts: SendPushOptions): Promise<void> {
  const { receiverId, type, body, data = {} } = opts;

  const tokens = await getUserFcmTokens(receiverId);
  if (tokens.length === 0) return;

  const title = NOTIFICATION_TITLES[type] || 'Thông báo mới';

  const message = {
    notification: { title, body },
    data: { type, ...data },
    tokens,
  };

  try {
    const response = await messaging.sendEachForMulticast(message);

    // Dọn token lỗi để tránh spam gửi lại
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          failedTokens.push(tokens[idx]);
        }
      }
    });

    if (failedTokens.length > 0) {
      await Promise.all(failedTokens.map((token) => removeInvalidToken(receiverId, token)));
    }
  } catch (error) {
    console.error('[FCM] Lỗi gửi push notification:', error);
  }
}
