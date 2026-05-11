import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, rtdb } from '../app';

/** Khởi tạo cuộc trò chuyện 1-1 */
export const startDirectConversation = onCall(
  {
    region: 'asia-southeast1',
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập để thực hiện hành động này.');
    }

    const { targetUserId } = request.data as { targetUserId: string };
    const currentUserId = request.auth.uid;

    if (!targetUserId || targetUserId === currentUserId) {
      throw new HttpsError('invalid-argument', 'ID người nhận không hợp lệ.');
    }

    try {
      const sortedIds = [currentUserId, targetUserId].sort();
      const convId = `direct_${sortedIds[0]}_${sortedIds[1]}`;
      const now = Date.now();

      const convRef = rtdb.ref(`conversations/${convId}`);
      const convSnap = await convRef.get();
      const conversationData = convSnap.exists() ? convSnap.val() : null;

      const friendSnap = await db
        .collection('users')
        .doc(currentUserId)
        .collection('friends')
        .doc(targetUserId)
        .get();

      const isFriend = friendSnap.exists;

      if (!isFriend) {
        const settingsSnap = await db
          .collection('users')
          .doc(targetUserId)
          .collection('private')
          .doc('settings')
          .get();

        const settings = settingsSnap.data();
        const allowStrangers = settings?.allowMessagesFromStrangers ?? true;

        if (!allowStrangers) {
          let canBypass = false;
          if (conversationData && conversationData.lastMessageAt && conversationData.lastMessageAt[targetUserId]) {
            const lastTime = conversationData.lastMessageAt[targetUserId];
            if (now - lastTime < 24 * 60 * 60 * 1000) {
              canBypass = true;
            }
          }

          if (!canBypass) {
            throw new HttpsError(
              'failed-precondition',
              'Người dùng này đã tắt tính năng nhận tin nhắn từ người lạ.'
            );
          }
        }
      }

      const [block1, block2] = await Promise.all([
        db.collection('users').doc(currentUserId).collection('blockedUsers').doc(targetUserId).get(),
        db.collection('users').doc(targetUserId).collection('blockedUsers').doc(currentUserId).get()
      ]);

      if (block1.data()?.blockMessages || block2.data()?.blockMessages) {
        throw new HttpsError('permission-denied', 'Không thể bắt đầu trò chuyện với người dùng này.');
      }

      if (!conversationData) {
        const updates: Record<string, any> = {};
        
        updates[`conversations/${convId}`] = {
          isGroup: false,
          creatorId: currentUserId,
          members: {
            [currentUserId]: 'admin',
            [targetUserId]: 'member'
          },
          createdAt: now,
          updatedAt: now,
          lastMessage: null,
          lastMessageAt: {}
        };

        [currentUserId, targetUserId].forEach(uid => {
          updates[`user_chats/${uid}/${convId}`] = {
            isPinned: false,
            isMuted: false,
            isArchived: false,
            unreadCount: 0,
            lastReadMsgId: null,
            lastMsgTimestamp: now,
            clearedAt: 0,
            createdAt: now,
            updatedAt: now
          };
        });

        await rtdb.ref().update(updates);
      }

      return { convId };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      
      console.error('[startDirectConversation] Lỗi:', error);
      throw new HttpsError('internal', 'Đã có lỗi xảy ra khi khởi tạo cuộc trò chuyện.');
    }
  }
);
