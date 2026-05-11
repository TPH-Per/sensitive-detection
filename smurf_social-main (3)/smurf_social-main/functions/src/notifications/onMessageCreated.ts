import { onValueCreated } from 'firebase-functions/v2/database';
import { rtdb } from '../app';
import { NotificationType } from '../types';
import { getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';
import { isBlockingMessages } from '../helpers/blockHelper';

/** Gửi thông báo khi có tin nhắn mới */
export const onMessageCreated = onValueCreated(
  {
    ref: '/messages/{convId}/{msgId}',
    region: 'asia-southeast1'
  },
  async (event) => {
    const message = event.data.val();
    if (!message || message.isRecalled) return;

    const { convId } = event.params;
    const { senderId, content, type, mentions = [] } = message;
    const safeContent = typeof content === 'string' ? content : '';
    if (type === 'system') return;

    try {
      const convRef = rtdb.ref(`conversations/${convId}`);
      const convSnap = await convRef.get();
      
      if (!convSnap.exists()) {
        console.log(`[onMessageCreated] Hội thoại ${convId} không tồn tại trong RTDB.`);
        return;
      }

      const conversation = convSnap.val();
      const members = conversation.members || {};
      const isGroup = !!conversation.isGroup;
      
      const memberIds = Object.keys(members).filter(id => id !== senderId);

      const senderName = await getSenderName(senderId);

      let contentSnippet = '';
      switch (type) {
        case 'image': 
          contentSnippet = safeContent 
            ? `đã gửi một hình ảnh: ${safeContent.replace(/@\[[^:]+:([^\]]+)\]/g, '@$1').substring(0, 80)}` 
            : 'đã gửi một hình ảnh'; 
          break;
        case 'video': contentSnippet = 'đã gửi một video'; break;
        case 'gif': contentSnippet = 'đã gửi một GIF'; break;
        case 'file': contentSnippet = 'đã gửi một tệp tin'; break;
        case 'voice': contentSnippet = 'đã gửi một tin nhắn thoại'; break;
        case 'call': {
          try {
            const parsed = JSON.parse(safeContent) as { callType?: string; status?: string };
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
        case 'share_post': {
          try {
            const parsed = JSON.parse(safeContent) as { snippet?: string };
            const shortSnippet = (parsed.snippet || '').trim().slice(0, 80);
            contentSnippet = shortSnippet
              ? `đã chia sẻ một bài viết: ${shortSnippet}`
              : 'đã chia sẻ một bài viết';
          } catch {
            contentSnippet = 'đã chia sẻ một bài viết';
          }
          break;
        }
        case 'text':
          contentSnippet = safeContent.replace(/@\[[^:]+:([^\]]+)\]/g, '@$1').substring(0, 100);
          break;
        default:
          contentSnippet = safeContent.replace(/@\[[^:]+:([^\]]+)\]/g, '@$1').substring(0, 100);
      }

      for (const receiverId of memberIds) {
        if (!isGroup && await isBlockingMessages(receiverId, senderId, conversation)) {
          continue;
        }

        const isMentioned = isGroup && mentions.includes(receiverId);
        const notificationType = isMentioned ? NotificationType.MENTION : NotificationType.CHAT;

        const userChatRef = rtdb.ref(`user_chats/${receiverId}/${convId}`);
        const userChatSnap = await userChatRef.get();
        const isMuted = userChatSnap.exists() && userChatSnap.val().isMuted === true;

        if (isMuted && !isMentioned) {
          continue;
        }

        const body = buildPushBody(notificationType, senderName, { contentSnippet });

        await sendPushNotification({
          receiverId,
          type: notificationType,
          body,
          data: { 
            convId,
            senderId,
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
