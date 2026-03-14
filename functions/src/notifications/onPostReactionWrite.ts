import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { NotificationType } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

export const onPostReactionWrite = onDocumentWritten(
  { document: 'posts/{postId}/reactions/{userId}', region: 'us-central1' },
  async (event) => {
    const beforeData = event.data?.before?.data() as { type: string } | undefined;
    const afterData = event.data?.after?.data() as { type: string } | undefined;

    const isCreate = !beforeData && !!afterData;
    const isDelete = !!beforeData && !afterData;
    const isUpdate = !!beforeData && !!afterData && beforeData.type !== afterData.type;

    if (!isCreate && !isDelete && !isUpdate) return;

    const postId = event.params.postId;
    const userId = event.params.userId;
    const postRef = db.collection('posts').doc(postId);
    const updates: Record<string, FieldValue> = {};

    if (isCreate) {
      updates['reactionCount'] = FieldValue.increment(1);
      updates[`reactionSummary.${afterData!.type}`] = FieldValue.increment(1);
    } else if (isDelete) {
      updates['reactionCount'] = FieldValue.increment(-1);
      updates[`reactionSummary.${beforeData!.type}`] = FieldValue.increment(-1);
    } else {
      // Đổi loại cảm xúc
      updates[`reactionSummary.${beforeData!.type}`] = FieldValue.increment(-1);
      updates[`reactionSummary.${afterData!.type}`] = FieldValue.increment(1);
    }

    await postRef.update(updates);

    if (!isCreate) return;

    try {
      const postSnap = await postRef.get();
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
