import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có reaction mới trên bình luận
 */
export const onCommentReactionWrite = onDocumentWritten(
  { document: 'comments/{commentId}/reactions/{userId}', region: 'us-central1' },
  async (event) => {
    const beforeData = event.data?.before?.data() as { type: string } | undefined;
    const afterData = event.data?.after?.data() as { type: string } | undefined;

    const isCreate = !beforeData && !!afterData;
    const isDelete = !!beforeData && !afterData;
    const commentId = event.params.commentId;
    const userId = event.params.userId;

    try {
      const batch = db.batch();
      const commentRef = db.collection('comments').doc(commentId);

      if (isCreate) {
        batch.update(commentRef, { reactionCount: FieldValue.increment(1) });
      } else if (isDelete) {
        batch.update(commentRef, { reactionCount: FieldValue.increment(-1) });
      }

      await batch.commit();

      if (!isCreate) return;

      const commentSnap = await db.collection('comments').doc(commentId).get();
      if (!commentSnap.exists) return;

      const commentOwnerId: string = commentSnap.data()!.authorId;
      if (userId === commentOwnerId) return;

      const { postId } = commentSnap.data()!;
      const senderName = await getSenderName(userId);
      const body = buildPushBody(NotificationType.REACTION, senderName);

      await createNotification({
        receiverId: commentOwnerId,
        actorId: userId,
        type: NotificationType.REACTION,
        data: { postId, commentId },
      });

      await sendPushNotification({
        receiverId: commentOwnerId,
        type: NotificationType.REACTION,
        body,
        data: { postId, commentId },
      });
    } catch (error) {
      console.error('[onCommentReactionWrite] Lỗi:', error);
    }
  }
);
