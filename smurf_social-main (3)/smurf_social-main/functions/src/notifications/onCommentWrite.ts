import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { NotificationType, CommentStatus } from '../types';
import { createNotification, getSenderName, buildPushBody } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/** Thông báo khi có bình luận hoặc xóa bình luận */
export const onCommentWrite = onDocumentWritten(
    { document: 'comments/{commentId}', region: 'asia-southeast1' },
    async (event) => {
        const commentId = event.params.commentId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

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
                const postSnap = await db.collection('posts').doc(postId).get();

                if (!postSnap.exists) {
                    console.log(`[onCommentWrite] Bài viết ${postId} không tồn tại, bỏ qua thông báo.`);
                    return;
                }

                const postOwnerId = postSnap.data()?.authorId;
                const replyToUserId = after.replyToUserId;

                const receivers = new Set<string>();
                if (postOwnerId && postOwnerId !== senderId) receivers.add(postOwnerId);
                if (replyToUserId && replyToUserId !== senderId) receivers.add(replyToUserId);

                if (receivers.size > 0) {
                    const body = buildPushBody(NotificationType.COMMENT, senderName, { contentSnippet });
                    
                    const promises = Array.from(receivers).map(async (receiverId) => {
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
                    });

                    await Promise.all(promises);
                }
                console.log(`[onCommentWrite/Create] Đã xử lý thông báo cho ${receivers.size} người.`);
            } catch (error) {
                console.error('[onCommentWrite/Create] Lỗi:', error);
            }
            return;
        }

        if (before && after && before.status === CommentStatus.ACTIVE && after.status === CommentStatus.DELETED) {
            const { postId, parentId } = after;
            try {
                const batch = db.batch();

                if (parentId) {
                    batch.update(db.collection('comments').doc(parentId), { replyCount: FieldValue.increment(-1) });
                    batch.update(db.collection('posts').doc(postId), { commentCount: FieldValue.increment(-1) });
                } else {
                    batch.update(db.collection('posts').doc(postId), { commentCount: FieldValue.increment(-1) });
                    
                    const repliesSnapshot = await db.collection('comments')
                        .where('parentId', '==', commentId)
                        .get();
                        
                    repliesSnapshot.docs.forEach(doc => {
                        if (doc.data().status === CommentStatus.ACTIVE) {
                            batch.update(doc.ref, {
                                status: CommentStatus.DELETED,
                                deletedAt: FieldValue.serverTimestamp(),
                                deletedBy: after.deletedBy,
                                updatedAt: FieldValue.serverTimestamp()
                            });
                        }
                    });
                }

                const notifsSnap = await db.collection('notifications')
                    .where('data.commentId', '==', commentId)
                    .get();

                notifsSnap.docs.forEach(doc => batch.delete(doc.ref));

                await batch.commit();
                console.log(`[onCommentWrite/Delete] Đã dọn dẹp thông báo và counter cho ${commentId}`);
            } catch (error) {
                console.error('[onCommentWrite/Delete] Lỗi:', error);
            }
        }
    }
);
