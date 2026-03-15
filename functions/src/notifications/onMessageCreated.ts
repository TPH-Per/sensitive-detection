import { onValueCreated } from 'firebase-functions/v2/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Trigger khi có tin nhắn mới trong RTDB
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

    const db = getFirestore();
    const messaging = getMessaging();

    try {
      // 1. Lấy thông tin cuộc hội thoại và thành viên
      const convSnap = await db.collection('conversations').doc(convId).get();
      if (!convSnap.exists) return;

      const conversation = convSnap.data();
      const members = conversation?.members || {};
      const memberIds = Object.keys(members).filter(id => id !== senderId);

      // 2. Lấy tên người gửi
      const senderSnap = await db.collection('users').doc(senderId).get();
      const senderName = senderSnap.data()?.fullName || 'Ai đó';

      // 3. Chuẩn bị nội dung thông báo
      let body = '';
      switch (type) {
        case 'image': body = 'đã gửi một hình ảnh'; break;
        case 'video': body = 'đã gửi một video'; break;
        case 'file': body = 'đã gửi một tệp tin'; break;
        case 'voice': body = 'đã gửi một tin nhắn thoại'; break;
        default:
          // Loại bỏ định dạng @[id:name] để hiển thị nội dung thông báo sạch hơn
          body = content.replace(/@\[[^:]+:([^\]]+)\]/g, '@$1').substring(0, 100);
      }

      // 4. Gửi thông báo đến từng thành viên
      for (const receiverId of memberIds) {
        const isMentioned = mentions.includes(receiverId);
        const notificationTitle = isMentioned ? 'Bạn đã được nhắc tên' : senderName;
        const notificationBody = isMentioned ? `${senderName} đã nhắc tên bạn: ${body}` : body;

        // Tạo thông báo trong Firestore (để hiển thị trong app)
        await db.collection('notifications').add({
          receiverId,
          actorId: senderId,
          type: isMentioned ? 'mention' : 'chat',
          isRead: false,
          data: {
            convId,
            contentSnippet: body,
            senderName
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Lấy FCM Tokens
        const fcmSnap = await db.collection('users').doc(receiverId).collection('private').doc('fcm').get();
        const tokens = fcmSnap.data()?.fcmTokens || [];

        if (tokens.length > 0) {
          await messaging.sendEachForMulticast({
            tokens,
            notification: {
              title: notificationTitle,
              body: notificationBody,
            },
            data: {
              convId,
              type: 'chat'
            }
          });
        }
      }
    } catch (error) {
      console.error('[onMessageCreated] Lỗi:', error);
    }
  }
);
