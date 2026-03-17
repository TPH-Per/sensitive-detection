import { onValueCreated } from 'firebase-functions/v2/database';
import { rtdb } from '../app';
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
    if (type === 'system') return;

    try {
      // Lấy thông tin hội thoại từ Realtime Database thay vì Firestore
      const convRef = rtdb.ref(`conversations/${convId}`);
      const convSnap = await convRef.get();
      
      if (!convSnap.exists()) {
        console.log(`[onMessageCreated] Hội thoại ${convId} không tồn tại trong RTDB.`);
        return;
      }

      const conversation = convSnap.val();
      const members = conversation.members || {};
      const isGroup = !!conversation.isGroup;
      
      // Tìm danh sách người nhận (tất cả mọi người trừ người gửi)
      const memberIds = Object.keys(members).filter(id => id !== senderId);

      const senderName = await getSenderName(senderId);

      let contentSnippet = '';
      switch (type) {
        case 'image': contentSnippet = 'đã gửi một hình ảnh'; break;
        case 'video': contentSnippet = 'đã gửi một video'; break;
        case 'file': contentSnippet = 'đã gửi một tệp tin'; break;
        case 'voice': contentSnippet = 'đã gửi một tin nhắn thoại'; break;
        case 'call': {
          try {
            const parsed = JSON.parse(content) as { callType?: string; status?: string };
            if (parsed.status === 'started') {
              contentSnippet = parsed.callType === 'video'
                ? 'đang gọi video cho bạn'
                : 'đang gọi thoại cho bạn';
            } else {
              return;
            }
          } catch {
            return;
          }
          break;
        }
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
          data: { 
            convId,
            senderName,
            contentSnippet
          },
        });
      }
    } catch (error) {
      console.error('[onMessageCreated] Lỗi:', error);
    }
  }
);
