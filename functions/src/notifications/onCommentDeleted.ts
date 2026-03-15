import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { FieldValue } from 'firebase-admin/firestore';
import { CommentStatus } from '../types';

/**
 * Xử lý khi comment bị soft-delete (status chuyển sang DELETED)
 * Giảm commentCount của post hoặc replyCount của parent comment
 */
export const onCommentDeleted = onDocumentUpdated(
    { document: 'comments/{commentId}', region: 'us-central1' },
    async (event) => {
        const beforeData = event.data?.before?.data();
        const afterData = event.data?.after?.data();

        if (!beforeData || !afterData) return;

        const wasActive = beforeData.status === CommentStatus.ACTIVE;
        const isNowDeleted = afterData.status === CommentStatus.DELETED;

        if (!wasActive || !isNowDeleted) return;

        const { postId, parentId } = afterData;

        try {
            const batch = db.batch();

            if (parentId) {
                batch.update(db.collection('comments').doc(parentId), {
                    replyCount: FieldValue.increment(-1)
                });
            }

            batch.update(db.collection('posts').doc(postId), {
                commentCount: FieldValue.increment(-1)
            });

            await batch.commit();
            console.log(`[onCommentDeleted] Đã giảm counter cho comment ${event.params.commentId}`);
        } catch (error) {
            console.error('[onCommentDeleted] Lỗi:', error);
        }
    }
);
