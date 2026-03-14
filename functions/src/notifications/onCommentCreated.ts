import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có bình luận mới
 */
export const onCommentCreated = onDocumentCreated(
  { document: 'comments/{commentId}', region: 'us-central1' },
  async (event) => {
    const comment = event.data?.data();
    if (!comment) return;

    const commentId = event.params.commentId;
    const { postId, authorId: senderId, parentId, content } = comment;
    const contentSnippet: string = (content || '').substring(0, 50);

    const batch = db.batch();
    batch.update(db.collection('posts').doc(postId), { commentCount: FieldValue.increment(1) });
    if (parentId) {
      batch.update(db.collection('comments').doc(parentId), { replyCount: FieldValue.increment(1) });
    }
    await batch.commit();

    try {
      const senderName = await getSenderName(senderId);

      if (parentId) {
        const parentCommentSnap = await db.collection('comments').doc(parentId).get();
        if (!parentCommentSnap.exists) return;

        const parentAuthorId: string = parentCommentSnap.data()!.authorId;
        if (parentAuthorId === senderId) return;

        const body = buildPushBody(NotificationType.COMMENT, senderName, { contentSnippet });

        await createNotification({
          receiverId: parentAuthorId,
          actorId: senderId,
          type: NotificationType.COMMENT,
          data: { postId, commentId, contentSnippet },
        });

        await sendPushNotification({
          receiverId: parentAuthorId,
          type: NotificationType.COMMENT,
          body,
          data: { postId, commentId },
        });
      } else {
        const postSnap = await db.collection('posts').doc(postId).get();
        if (!postSnap.exists) return;

        const postOwnerId: string = postSnap.data()!.authorId;
        if (postOwnerId === senderId) return;

        const body = buildPushBody(NotificationType.COMMENT, senderName, { contentSnippet });

        await createNotification({
          receiverId: postOwnerId,
          actorId: senderId,
          type: NotificationType.COMMENT,
          data: { postId, commentId, contentSnippet },
        });

        await sendPushNotification({
          receiverId: postOwnerId,
          type: NotificationType.COMMENT,
          body,
          data: { postId, commentId },
        });
      }
    } catch (error) {
      console.error('[onCommentCreated] Lỗi:', error);
    }
  }
);
