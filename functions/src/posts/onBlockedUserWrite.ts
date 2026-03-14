import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

/**
 * Đồng bộ feed khi block options thay đổi
 */
export const onBlockedUserWrite = onDocumentWritten(
    { document: 'users/{userId}/blockedUsers/{blockedUid}', region: 'us-central1' },
    async (event) => {
        const userId = event.params.userId;
        const blockedUid = event.params.blockedUid;
        const db = admin.firestore();

        const before = event.data?.before?.data();
        const after = event.data?.after?.data();

        const prevHide = before?.hideTheirActivity ?? false;
        const newHide = after?.hideTheirActivity ?? false;
        const prevViewBlock = before?.blockViewMyActivity ?? false;
        const newViewBlock = after?.blockViewMyActivity ?? false;

        const tasks: Promise<void>[] = [];

        if (!prevHide && newHide) tasks.push(removePostsFromFeed(db, userId, blockedUid));
        if (prevHide && !newHide) tasks.push(restorePostsIfFriend(db, userId, blockedUid));
        if (!prevViewBlock && newViewBlock) tasks.push(removePostsFromFeed(db, blockedUid, userId));
        if (prevViewBlock && !newViewBlock) tasks.push(restorePostsIfFriend(db, blockedUid, userId));

        if (tasks.length > 0) await Promise.all(tasks);
    }
);

/**
 * Xóa bài viết khỏi feed
 */
async function removePostsFromFeed(db: admin.firestore.Firestore, targetUserId: string, authorId: string): Promise<void> {
    try {
        const feedSnap = await db.collection('users').doc(targetUserId).collection('feeds').get();
        if (feedSnap.empty) return;

        const postIds = feedSnap.docs.map(d => d.data().postId as string).filter(Boolean);
        if (postIds.length === 0) return;

        const toRemove: string[] = [];
        const chunkSize = 10;

        for (let i = 0; i < postIds.length; i += chunkSize) {
            const snap = await db.collection('posts')
                .where(admin.firestore.FieldPath.documentId(), 'in', postIds.slice(i, i + chunkSize))
                .where('authorId', '==', authorId)
                .get();
            snap.docs.forEach(d => toRemove.push(d.id));
        }

        if (toRemove.length === 0) return;

        const batch = db.batch();
        toRemove.forEach(postId =>
            batch.delete(db.collection('users').doc(targetUserId).collection('feeds').doc(postId))
        );
        await batch.commit();
    } catch (error) {
        console.error('removePostsFromFeed:', error);
    }
}

/**
 * Khôi phục bài viết vào feed nếu là bạn
 */
async function restorePostsIfFriend(db: admin.firestore.Firestore, targetUserId: string, authorId: string): Promise<void> {
    try {
        const friendSnap = await db.collection('users').doc(targetUserId).collection('friends').doc(authorId).get();
        if (!friendSnap.exists) return;

        const postsSnap = await db.collection('posts')
            .where('authorId', '==', authorId)
            .where('status', '==', 'active')
            .where('visibility', 'in', ['public', 'friends'])
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        if (postsSnap.empty) return;

        const batch = db.batch();
        postsSnap.docs.forEach(postDoc => {
            batch.set(
                db.collection('users').doc(targetUserId).collection('feeds').doc(postDoc.id),
                { postId: postDoc.id, createdAt: postDoc.data().createdAt }
            );
        });
        await batch.commit();
    } catch (error) {
        console.error('restorePostsIfFriend:', error);
    }
}
