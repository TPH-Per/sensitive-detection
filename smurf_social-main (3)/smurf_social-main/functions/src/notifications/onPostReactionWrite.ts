import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/** Gửi thông báo khi có lượt thích bài viết */
export const onPostReactionWrite = onDocumentWritten(
  { document: 'posts/{postId}/reactions/{userId}', region: 'asia-southeast1' },
  async (event) => {
    const beforeData = event.data?.before?.data() as { type: string } | undefined;
    const afterData = event.data?.after?.data() as { type: string } | undefined;

    const isCreate = !beforeData && !!afterData;
    const isDelete = !!beforeData && !afterData;
    const postId = event.params.postId;
    const userId = event.params.userId;

    try {
      const batch = db.batch();
      const postRef = db.collection('posts').doc(postId);

      if (isCreate) {
        batch.update(postRef, { reactionCount: FieldValue.increment(1) });
      } else if (isDelete) {
        batch.update(postRef, { reactionCount: FieldValue.increment(-1) });
      }

      await batch.commit();

      if (!isCreate) return;

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
      console.error('[onPostReactionWrite] Lỗi:', error);
    }
  }
);
