import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xử lý khi có bạn bị xóa
 */
export const onFriendRemoved = onDocumentDeleted(
    { document: 'users/{userId}/friends/{friendId}', region: 'us-central1' },
    async (event) => {
        const userId = event.params.userId;
        const friendId = event.params.friendId;

        try {
            const db = admin.firestore();

            const feedSnapshot = await db.collection('users').doc(userId).collection('feeds').get();

            if (feedSnapshot.empty) {
                console.log(`User ${userId} has no feed entries`);
                return;
            }

            const postIds = feedSnapshot.docs.map(doc => doc.data().postId);

            if (postIds.length === 0) {
                return;
            }

            const postsToRemove: string[] = [];

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
