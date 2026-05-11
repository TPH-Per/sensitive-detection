import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { db } from '../app';

const MAX_BATCH_OPS = 450;

async function commitInChunks(ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>) {
    let batch = db.batch();
    let opCount = 0;

    for (const op of ops) {
        op(batch);
        opCount++;

        if (opCount >= MAX_BATCH_OPS) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }
}

/** Cập nhật bảng tin khi kết bạn hoặc hủy kết bạn */
export const onFriendWrite = onDocumentWritten(
    { document: 'users/{userId}/friends/{friendId}', region: 'asia-southeast1' },
    async (event) => {
        const userId = event.params.userId;
        const friendId = event.params.friendId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        if (!before && after) {
            try {
                const friendPostsSnapshot = await db.collection('posts')
                    .where('authorId', '==', friendId)
                    .where('status', '==', 'active')
                    .where('visibility', 'in', ['friends', 'public'])
                    .orderBy('createdAt', 'desc')
                    .limit(100)
                    .get();

                if (friendPostsSnapshot.empty) return;

                const ops = friendPostsSnapshot.docs.map(postDoc => (
                    (batch: FirebaseFirestore.WriteBatch) => batch.set(db.collection('users').doc(userId).collection('feeds').doc(postDoc.id), {
                        postId: postDoc.id,
                        authorId: friendId,
                        createdAt: postDoc.data().createdAt,
                        updatedAt: FieldValue.serverTimestamp(),
                    })
                ));

                await commitInChunks(ops);
                console.log(`[onFriendWrite/Add] Fan-out ${friendPostsSnapshot.size} bài viết từ ${friendId} sang feed của ${userId}`);
            } catch (error) {
                console.error('[onFriendWrite/Add] Lỗi:', error);
            }
            return;
        }

        if (before && !after) {
            try {
                const feedSnapshot = await db.collection('users').doc(userId).collection('feeds').get();
                if (feedSnapshot.empty) return;

                const postIds = feedSnapshot.docs.map(d => d.data().postId as string).filter(Boolean);
                const postsToRemove: string[] = [];

                for (let i = 0; i < postIds.length; i += 10) {
                    const chunk = postIds.slice(i, i + 10);
                    const postsSnapshot = await db.collection('posts')
                        .where(FieldPath.documentId(), 'in', chunk)
                        .where('authorId', '==', friendId)
                        .get();
                    postsSnapshot.docs.forEach(d => postsToRemove.push(d.id));
                }

                if (postsToRemove.length === 0) return;

                const ops = postsToRemove.map(postId => (
                    (batch: FirebaseFirestore.WriteBatch) => batch.delete(db.collection('users').doc(userId).collection('feeds').doc(postId))
                ));

                await commitInChunks(ops);
                console.log(`[onFriendWrite/Remove] Đã xóa ${postsToRemove.length} bài viết của ${friendId} khỏi feed của ${userId}`);
            } catch (error) {
                console.error('[onFriendWrite/Remove] Lỗi:', error);
            }
        }
    }
);
