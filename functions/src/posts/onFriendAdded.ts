import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Fan-out posts cũ của bạn mới vào feed của user
 * Trigger: onCreate users/{userId}/friends/{friendId}
 */
export const onFriendAdded = onDocumentCreated(
    { document: 'users/{userId}/friends/{friendId}', region: 'us-central1' },
    async (event) => {
        const userId = event.params.userId;
        const friendId = event.params.friendId;

        try {
            const db = admin.firestore();

            // Lấy tất cả posts ACTIVE của friend
            const friendPostsSnapshot = await db.collection('posts')
                .where('authorId', '==', friendId)
                .where('status', '==', 'active')
                .where('visibility', 'in', ['public', 'friends'])
                .orderBy('createdAt', 'desc')
                .limit(100) // Giới hạn số posts để tránh quá tải
                .get();

            if (friendPostsSnapshot.empty) {
                console.log(`Friend ${friendId} has no posts to fan-out`);
                return;
            }

            const batch = db.batch();
            let batchCount = 0;
            const MAX_BATCH_SIZE = 500;

            for (const postDoc of friendPostsSnapshot.docs) {
                const postId = postDoc.id;
                const postData = postDoc.data();

                const feedRef = db.collection('users').doc(userId).collection('feeds').doc(postId);
                batch.set(feedRef, {
                    postId,
                    createdAt: postData.createdAt,
                });

                batchCount++;

                if (batchCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            console.log(`Fan-out ${friendPostsSnapshot.size} posts from ${friendId} to ${userId}'s feed`);
        } catch (error) {
            console.error('Error fan-out friend posts:', error);
        }
    }
);
