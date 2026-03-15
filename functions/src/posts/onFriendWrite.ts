import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Xử lý tất cả thay đổi trên quan hệ bạn bè (Add, Remove)
 */
export const onFriendWrite = onDocumentWritten(
    { document: 'users/{userId}/friends/{friendId}', region: 'us-central1' },
    async (event) => {
        const userId = event.params.userId;
        const friendId = event.params.friendId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        // 1. Xử lý ADD (Fan-out bài viết của bạn mới vào feed của user)
        if (!before && after) {
            try {
                const db = admin.firestore();
                const friendPostsSnapshot = await db.collection('posts')
                    .where('authorId', '==', friendId)
                    .where('status', '==', 'active')
                    .where('visibility', 'in', ['public', 'friends'])
                    .orderBy('createdAt', 'desc')
                    .limit(100)
                    .get();

                if (friendPostsSnapshot.empty) return;

                const batch = db.batch();
                let batchCount = 0;
                for (const postDoc of friendPostsSnapshot.docs) {
                    batch.set(db.collection('users').doc(userId).collection('feeds').doc(postDoc.id), {
                        postId: postDoc.id,
                        authorId: friendId,
                        createdAt: postDoc.data().createdAt,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    batchCount++;
                    if (batchCount >= 500) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) await batch.commit();
                console.log(`[onFriendWrite/Add] Fan-out ${friendPostsSnapshot.size} bài viết từ ${friendId} sang feed của ${userId}`);
            } catch (error) {
                console.error('[onFriendWrite/Add] Lỗi:', error);
            }
            return;
        }

        // 2. Xử lý REMOVE (Xóa bài viết của bạn cũ khỏi feed của user)
        if (before && !after) {
            try {
                const db = admin.firestore();
                const feedSnapshot = await db.collection('users').doc(userId).collection('feeds').get();
                if (feedSnapshot.empty) return;

                const postIds = feedSnapshot.docs.map(doc => doc.data().postId);
                const postsToRemove: string[] = [];

                for (let i = 0; i < postIds.length; i += 10) {
                    const chunk = postIds.slice(i, i + 10);
                    const postsSnapshot = await db.collection('posts')
                        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
                        .where('authorId', '==', friendId)
                        .get();
                    postsSnapshot.docs.forEach(doc => postsToRemove.push(doc.id));
                }

                if (postsToRemove.length === 0) return;

                const batch = db.batch();
                let batchCount = 0;
                for (const postId of postsToRemove) {
                    batch.delete(db.collection('users').doc(userId).collection('feeds').doc(postId));
                    batchCount++;
                    if (batchCount >= 500) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) await batch.commit();
                console.log(`[onFriendWrite/Remove] Đã xóa ${postsToRemove.length} bài viết của ${friendId} khỏi feed của ${userId}`);
            } catch (error) {
                console.error('[onFriendWrite/Remove] Lỗi:', error);
            }
        }
    }
);
