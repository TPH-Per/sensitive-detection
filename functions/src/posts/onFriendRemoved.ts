import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xóa posts của ex-friend khỏi feed của user
 * Trigger: onDelete users/{userId}/friends/{friendId}
 */
export const onFriendRemoved = onDocumentDeleted(
    { document: 'users/{userId}/friends/{friendId}', region: 'us-central1' },
    async (event) => {
        const userId = event.params.userId;
        const friendId = event.params.friendId;

        try {
            const db = admin.firestore();

            // Lấy tất cả feed entries của ex-friend trong feed của user
            const feedSnapshot = await db.collection('users').doc(userId).collection('feeds').get();

            if (feedSnapshot.empty) {
                console.log(`User ${userId} has no feed entries`);
                return;
            }

            // Lấy tất cả postIds từ feed
            const postIds = feedSnapshot.docs.map(doc => doc.data().postId);

            if (postIds.length === 0) {
                return;
            }

            // Batch get posts để check authorId
            const postsToRemove: string[] = [];

            // Firestore 'in' query giới hạn 10 items, nên chia nhỏ
            const chunkSize = 10;
            for (let i = 0; i < postIds.length; i += chunkSize) {
                const chunk = postIds.slice(i, i + chunkSize);
                const postsSnapshot = await db.collection('posts')
                    .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                    .where('authorId', '==', friendId)
                    .get();

                postsSnapshot.docs.forEach(doc => {
                    postsToRemove.push(doc.id);
                });
            }

            if (postsToRemove.length === 0) {
                console.log(`No posts from ${friendId} found in ${userId}'s feed`);
                return;
            }

            // Xóa feed entries
            const batch = db.batch();
            let batchCount = 0;
            const MAX_BATCH_SIZE = 500;

            for (const postId of postsToRemove) {
                const feedRef = db.collection('users').doc(userId).collection('feeds').doc(postId);
                batch.delete(feedRef);

                batchCount++;

                if (batchCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`Removed ${postsToRemove.length} posts from ${friendId} in ${userId}'s feed`);
        } catch (error) {
            console.error('Error removing friend posts from feed:', error);
        }
    }
);
