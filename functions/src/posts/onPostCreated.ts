import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xử lý khi có bài viết mới
 */
export const onPostCreated = onDocumentCreated(
    { document: 'posts/{postId}', region: 'us-central1' },
    async (event) => {
        const postId = event.params.postId;
        const postData = event.data?.data();

        if (!postData) {
            console.error('Post data is null');
            return;
        }

        const authorId = postData.authorId;
        if (!authorId) {
            console.error('Post missing authorId:', postId);
            return;
        }

        try {
            const db = admin.firestore();
            const batch = db.batch();
            const feedEntry = {
                postId,
                authorId,
                createdAt: postData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            batch.set(
                db.collection('users').doc(authorId).collection('feeds').doc(postId),
                feedEntry
            );

            const friendsSnap = await db.collection('users').doc(authorId).collection('friends').get();
            if (friendsSnap.empty) {
                await batch.commit();
                return;
            }

            const friendIds = friendsSnap.docs.map(d => d.id);

            const usersHidingAuthor = new Set<string>();
            const chunkSize = 10;

            for (let i = 0; i < friendIds.length; i += chunkSize) {
                const chunk = friendIds.slice(i, i + chunkSize);
                const blockSnaps = await Promise.all(
                    chunk.map(fid =>
                        db.collection('users').doc(fid).collection('blockedUsers').doc(authorId).get()
                    )
                );
                blockSnaps.forEach((snap, idx) => {
                    if (snap.exists && snap.data()?.hideTheirActivity === true) {
                        usersHidingAuthor.add(chunk[idx]);
                    }
                });
            }

            let batchCount = 0;
            const MAX_BATCH_SIZE = 500;

            for (const friendId of friendIds) {
                if (usersHidingAuthor.has(friendId)) continue;

                batch.set(
                    db.collection('users').doc(friendId).collection('feeds').doc(postId),
                    feedEntry
                );

                batchCount++;
                if (batchCount >= MAX_BATCH_SIZE) {
                    await batch.commit();
                    batchCount = 0;
                }
            }

            if (batchCount > 0) await batch.commit();

            console.log(`Fan-out ${postId}: ${friendIds.length - usersHidingAuthor.size + 1} feeds`);
        } catch (error) {
            console.error('Error fan-out post:', error);
        }
    }
);
