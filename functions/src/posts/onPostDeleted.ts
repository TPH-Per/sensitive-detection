import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xử lý khi có bài viết bị xóa
 */
export const onPostDeleted = onDocumentUpdated(
    { document: 'posts/{postId}', region: 'us-central1' },
    async (event) => {
        const postId = event.params.postId;
        const beforeData = event.data?.before.data();
        const afterData = event.data?.after.data();

        if (!beforeData || !afterData) {
            console.error('Post data is null');
            return;
        }

        if (beforeData.status !== 'deleted' && afterData.status === 'deleted') {
            const authorId = afterData.authorId;

            if (!authorId) {
                console.error('Post missing authorId:', postId);
                return;
            }

            try {
                const db = admin.firestore();
                const batch = db.batch();

                const authorFeedRef = db.collection('users').doc(authorId).collection('feeds').doc(postId);
                batch.delete(authorFeedRef);

                const friendsSnapshot = await db.collection('users').doc(authorId).collection('friends').get();

                let batchCount = 0;
                const MAX_BATCH_SIZE = 500;

                for (const friendDoc of friendsSnapshot.docs) {
                    const friendId = friendDoc.id;
                    const friendFeedRef = db.collection('users').doc(friendId).collection('feeds').doc(postId);
                    batch.delete(friendFeedRef);

                    batchCount++;

                    if (batchCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }

                if (batchCount > 0) {
                    await batch.commit();
                }

                console.log(`Removed post ${postId} from ${friendsSnapshot.size + 1} feeds`);
            } catch (error) {
                console.error('Error removing post from feeds:', error);
            }
        }
    }
);
