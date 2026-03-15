import { onValueCreated } from 'firebase-functions/v2/database';
import { db } from '../app';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có tin nhắn mới trong RTDB
 */
export const onMessageCreated = onValueCreated(
  {
    ref: '/messages/{convId}/{msgId}',
    region: 'us-central1'
  },
  async (event) => {
    const message = event.data.val();
    if (!message || message.isRecalled) return;

    const { convId } = event.params;
    const { senderId, content, type, mentions = [] } = message;

    try {
      const convSnap = await db.collection('conversations').doc(convId).get();
      if (!convSnap.exists) return;

      const conversation = convSnap.data()!;
      const members = conversation.members || {};
      const isGroup = !!conversation.isGroup;
      const memberIds = Object.keys(members).filter(id => id !== senderId);

      const senderName = await getSenderName(senderId);

      let contentSnippet = '';
      switch (type) {
        case 'image': contentSnippet = 'đã gửi một hình ảnh'; break;
        case 'video': contentSnippet = 'đã gửi một video'; break;
        case 'file': contentSnippet = 'đã gửi một tệp tin'; break;
        case 'voice': contentSnippet = 'đã gửi một tin nhắn thoại'; break;
        default:
          contentSnippet = content.replace(/@\[[^:]+:([^\]]+)\]/g, '@$1').substring(0, 100);
      }

      for (const receiverId of memberIds) {
        const isMentioned = isGroup && mentions.includes(receiverId);
        const notificationType = isMentioned ? NotificationType.MENTION : NotificationType.CHAT;
        
        const body = buildPushBody(notificationType, senderName, { contentSnippet });

        if (isMentioned) {
          await createNotification({
            receiverId,
            actorId: senderId,
            type: notificationType,
            data: { 
              convId, 
              contentSnippet,
              senderName 
            },
          });
        }

        await sendPushNotification({
          receiverId,
          type: notificationType,
          body,
          data: { convId },
        });
      }
    } catch (error) {
      console.error('[onMessageCreated] Lỗi:', error);
    }
  }
);
