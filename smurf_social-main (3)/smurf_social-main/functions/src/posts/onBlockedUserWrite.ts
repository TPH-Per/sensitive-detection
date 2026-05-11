import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldPath, FieldValue, Firestore } from 'firebase-admin/firestore';
import { db } from '../app';

const MAX_BATCH_OPS = 450;

async function commitInChunks(
    firestore: Firestore,
    ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>
): Promise<void> {
    let batch = firestore.batch();
    let opCount = 0;

    for (const op of ops) {
        op(batch);
        opCount++;

        if (opCount >= MAX_BATCH_OPS) {
            await batch.commit();
            batch = firestore.batch();
            opCount = 0;
        }
    }

    if (opCount > 0) {
        await batch.commit();
    }
}

/** Cập nhật bảng tin khi thay đổi trạng thái ẩn hoặc chặn */
export const onBlockedUserWrite = onDocumentWritten(
    { document: 'users/{userId}/blockedUsers/{blockedUid}', region: 'asia-southeast1' },
    async (event) => {
        const userId = event.params.userId;
        const blockedUid = event.params.blockedUid;

        const before = event.data?.before?.data();
        const after = event.data?.after?.data();

        const prevHide = before?.hideTheirActivity ?? false;
        const newHide = after?.hideTheirActivity ?? false;
        
        const prevBlockView = before?.blockViewMyActivity ?? false;
        const newBlockView = after?.blockViewMyActivity ?? false;

        const tasks: Promise<void>[] = [];

        if (!prevHide && newHide) tasks.push(removePostsFromFeed(db, userId, blockedUid));
        if (prevHide && !newHide) tasks.push(restorePostsIfFriend(db, userId, blockedUid));

        if (!prevBlockView && newBlockView) tasks.push(removePostsFromFeed(db, blockedUid, userId));
        if (prevBlockView && !newBlockView) tasks.push(restorePostsIfFriend(db, blockedUid, userId));

        if (tasks.length > 0) await Promise.all(tasks);
    }
);

/** Gỡ bài viết khỏi bảng tin người dùng */
async function removePostsFromFeed(db: Firestore, targetUserId: string, authorId: string): Promise<void> {
    try {
        const feedSnap = await db.collection('users').doc(targetUserId).collection('feeds').get();
        if (feedSnap.empty) return;

        const postIds = feedSnap.docs.map(d => d.data().postId as string).filter(Boolean);
        if (postIds.length === 0) return;

        const toRemove: string[] = [];
        const chunkSize = 10;

        for (let i = 0; i < postIds.length; i += chunkSize) {
            const snap = await db.collection('posts')
                .where(FieldPath.documentId(), 'in', postIds.slice(i, i + chunkSize))
                .where('authorId', '==', authorId)
                .get();
            snap.docs.forEach(d => toRemove.push(d.id));
        }

        if (toRemove.length === 0) return;

        const ops = toRemove.map(postId => (
            (batch: FirebaseFirestore.WriteBatch) => batch.delete(db.collection('users').doc(targetUserId).collection('feeds').doc(postId))
        ));

        await commitInChunks(db, ops);
    } catch (error) {
        console.error('removePostsFromFeed:', error);
    }
}

/** Khôi phục bài viết vào bảng tin nếu là bạn bè */
async function restorePostsIfFriend(db: Firestore, targetUserId: string, authorId: string): Promise<void> {
    try {
        const friendSnap = await db.collection('users').doc(targetUserId).collection('friends').doc(authorId).get();
        if (!friendSnap.exists) return;

        const postsSnap = await db.collection('posts')
            .where('authorId', '==', authorId)
            .where('status', '==', 'active')
            .where('visibility', 'in', ['friends', 'public'])
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        if (postsSnap.empty) return;

        const ops = postsSnap.docs.map(postDoc => (
            (batch: FirebaseFirestore.WriteBatch) => batch.set(
                db.collection('users').doc(targetUserId).collection('feeds').doc(postDoc.id),
                {
                    postId: postDoc.id,
                    authorId,
                    createdAt: postDoc.data().createdAt,
                    updatedAt: FieldValue.serverTimestamp()
                }
            )
        ));

        await commitInChunks(db, ops);
    } catch (error) {
        console.error('restorePostsIfFriend:', error);
    }
}
