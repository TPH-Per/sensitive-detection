import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có bình luận mới
 */
export const onCommentReactionWrite = onDocumentWritten(
  { document: 'comments/{commentId}/reactions/{userId}', region: 'us-central1' },
  async (event) => {
    const beforeData = event.data?.before?.data() as { type: string } | undefined;
    const afterData = event.data?.after?.data() as { type: string } | undefined;

    const isCreate = !beforeData && !!afterData;
    const isDelete = !!beforeData && !afterData;
    const isUpdate = !!beforeData && !!afterData && beforeData.type !== afterData.type;

    if (!isCreate && !isDelete && !isUpdate) return;

    const commentId = event.params.commentId;
    const userId = event.params.userId;
    const commentRef = db.collection('comments').doc(commentId);
    const updates: Record<string, FieldValue> = {};

    if (isCreate) {
      updates[`reactions.${afterData!.type}`] = FieldValue.increment(1);
    } else if (isDelete) {
      updates[`reactions.${beforeData!.type}`] = FieldValue.increment(-1);
    } else {
      updates[`reactions.${beforeData!.type}`] = FieldValue.increment(-1);
      updates[`reactions.${afterData!.type}`] = FieldValue.increment(1);
    }

    await commentRef.update(updates);

    if (!isCreate) return;

    try {
      const commentSnap = await commentRef.get();
      if (!commentSnap.exists) return;
      const commentOwnerId: string = commentSnap.data()!.authorId;
      if (userId === commentOwnerId) return;

      const { postId } = commentSnap.data()!;
      const senderName = await getSenderName(userId);
      const body = buildPushBody(NotificationType.COMMENT, senderName);

      await createNotification({
        receiverId: commentOwnerId,
        actorId: userId,
        type: NotificationType.COMMENT,
        data: { postId, commentId },
      });

      await sendPushNotification({
        receiverId: commentOwnerId,
        type: NotificationType.COMMENT,
        body,
        data: { postId, commentId },
      });
    } catch (error) {
      console.error('[onCommentReactionWrite] Lỗi thông báo:', error);
    }
  }
);
