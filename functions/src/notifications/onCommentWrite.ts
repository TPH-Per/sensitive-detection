import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { NotificationType, CommentStatus } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý tất cả thay đổi trên bình luận (Create, Soft-delete)
 */
export const onCommentWrite = onDocumentWritten(
    { document: 'comments/{commentId}', region: 'us-central1' },
    async (event) => {
        const commentId = event.params.commentId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        // 1. Xử lý CREATE
        if (!before && after) {
            const { postId, authorId: senderId, parentId, content } = after;
            const contentSnippet: string = (content || '').substring(0, 50);

            try {
                const batch = db.batch();
                batch.update(db.collection('posts').doc(postId), { commentCount: FieldValue.increment(1) });
                if (parentId) {
                    batch.update(db.collection('comments').doc(parentId), { replyCount: FieldValue.increment(1) });
                }
                await batch.commit();

                const senderName = await getSenderName(senderId);
                const receiverId = parentId 
                    ? (await db.collection('comments').doc(parentId).get()).data()?.authorId 
                    : (await db.collection('posts').doc(postId).get()).data()?.authorId;

                if (receiverId && receiverId !== senderId) {
                    const body = buildPushBody(NotificationType.COMMENT, senderName, { contentSnippet });
                    await createNotification({
                        receiverId,
                        actorId: senderId,
                        type: NotificationType.COMMENT,
                        data: { postId, commentId, contentSnippet },
                    });
                    await sendPushNotification({
                        receiverId,
                        type: NotificationType.COMMENT,
                        body,
                        data: { postId, commentId },
                    });
                }
                console.log(`[onCommentWrite/Create] Đã xử lý bình luận ${commentId}`);
            } catch (error) {
                console.error('[onCommentWrite/Create] Lỗi:', error);
            }
            return;
        }

        // 2. Xử lý DELETE (Soft-delete)
        if (before && after && before.status === CommentStatus.ACTIVE && after.status === CommentStatus.DELETED) {
            const { postId, parentId } = after;
            try {
                const batch = db.batch();
                if (parentId) {
                    batch.update(db.collection('comments').doc(parentId), { replyCount: FieldValue.increment(-1) });
                }
                batch.update(db.collection('posts').doc(postId), { commentCount: FieldValue.increment(-1) });
                await batch.commit();
                console.log(`[onCommentWrite/Delete] Đã giảm counter cho bình luận ${commentId}`);
            } catch (error) {
                console.error('[onCommentWrite/Delete] Lỗi:', error);
            }
        }
    }
);
