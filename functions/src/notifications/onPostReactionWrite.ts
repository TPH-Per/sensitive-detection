import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có reaction mới trên bài viết
 */
export const onPostReactionWrite = onDocumentWritten(
  { document: 'posts/{postId}/reactions/{userId}', region: 'us-central1' },
  async (event) => {
    const beforeData = event.data?.before?.data() as { type: string } | undefined;
    const afterData = event.data?.after?.data() as { type: string } | undefined;

    const isCreate = !beforeData && !!afterData;

    if (!isCreate) return;

    const postId = event.params.postId;
    const userId = event.params.userId;

    try {
      const postSnap = await db.collection('posts').doc(postId).get();
      if (!postSnap.exists) return;

      const postOwnerId: string = postSnap.data()!.authorId;
      if (userId === postOwnerId) return;

      const senderName = await getSenderName(userId);
      const body = buildPushBody(NotificationType.REACTION, senderName);

      await createNotification({
        receiverId: postOwnerId,
        actorId: userId,
        type: NotificationType.REACTION,
        data: { postId },
      });

      await sendPushNotification({
        receiverId: postOwnerId,
        type: NotificationType.REACTION,
        body,
        data: { postId },
      });
    } catch (error) {
      console.error('[onPostReactionWrite] Lỗi thông báo:', error);
    }
  }
);
