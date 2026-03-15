import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xử lý tất cả thay đổi trên bài viết (Create, Soft-delete)
 */
export const onPostWrite = onDocumentWritten(
    { document: 'posts/{postId}', region: 'us-central1' },
    async (event) => {
        const postId = event.params.postId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        // 1. Xử lý CREATE (Fan-out)
        if (!before && after) {
            const authorId = after.authorId;
            if (!authorId) return;

            try {
                const db = admin.firestore();
                const batch = db.batch();
                const feedEntry = {
                    postId,
                    authorId,
                    createdAt: after.createdAt || admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };

                // Add to author's feed
                batch.set(db.collection('users').doc(authorId).collection('feeds').doc(postId), feedEntry);

                // Add to friends' feeds
                const friendsSnap = await db.collection('users').doc(authorId).collection('friends').get();
                if (friendsSnap.empty) {
                    await batch.commit();
                    return;
                }

                const friendIds = friendsSnap.docs.map(d => d.id);
                const usersHidingAuthor = new Set<string>();
                const chunkSize = 20;

                for (let i = 0; i < friendIds.length; i += chunkSize) {
                    const chunk = friendIds.slice(i, i + chunkSize);
                    const blockSnaps = await Promise.all(
                        chunk.map(fid => db.collection('users').doc(fid).collection('blockedUsers').doc(authorId).get())
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
                    batch.set(db.collection('users').doc(friendId).collection('feeds').doc(postId), feedEntry);
                    batchCount++;
                    if (batchCount >= MAX_BATCH_SIZE) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) await batch.commit();
                console.log(`[onPostWrite/Create] Fan-out ${postId} to ${friendIds.length - usersHidingAuthor.size + 1} feeds`);
            } catch (error) {
                console.error('[onPostWrite/Create] Lỗi:', error);
            }
            return;
        }

        // 2. Xử lý DELETE (Soft-delete: status chuyển sang deleted)
        if (before && after && before.status !== 'deleted' && after.status === 'deleted') {
            const authorId = after.authorId;
            if (!authorId) return;

            try {
                const db = admin.firestore();
                const batch = db.batch();

                // Remove from author's feed
                batch.delete(db.collection('users').doc(authorId).collection('feeds').doc(postId));

                // Remove from friends' feeds
                const friendsSnapshot = await db.collection('users').doc(authorId).collection('friends').get();
                let batchCount = 0;
                for (const friendDoc of friendsSnapshot.docs) {
                    batch.delete(db.collection('users').doc(friendDoc.id).collection('feeds').doc(postId));
                    batchCount++;
                    if (batchCount >= 500) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) await batch.commit();
                console.log(`[onPostWrite/Delete] Đã xóa post ${postId} khỏi ${friendsSnapshot.size + 1} feeds`);
            } catch (error) {
                console.error('[onPostWrite/Delete] Lỗi:', error);
            }
        }
    }
);
