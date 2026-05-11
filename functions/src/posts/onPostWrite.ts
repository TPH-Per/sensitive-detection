import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';

const MAX_BATCH_OPS = 450;

function shouldFanoutToFriends(visibility?: string): boolean {
    return visibility === 'friends' || visibility === 'public' || visibility == null;
}

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

async function getVisibleFriendIds(authorId: string): Promise<string[]> {
    const friendsSnap = await db.collection('users').doc(authorId).collection('friends').get();
    if (friendsSnap.empty) return [];

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

    return friendIds.filter(friendId => !usersHidingAuthor.has(friendId));
}

async function touchAuthorFeed(postId: string, authorId: string) {
    await db.collection('users').doc(authorId).collection('feeds').doc(postId).set(
        { updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
    );
}

/**
 * Xử lý tất cả thay đổi trên bài viết (Create, Soft-delete)
 */
export const onPostWrite = onDocumentWritten(
    { document: 'posts/{postId}', database: 'per0', region: 'asia-southeast1' },
    async (event) => {
        const postId = event.params.postId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        // 1. Xử lý CREATE (Fan-out)
        if (!before && after) {
            await handleFanout(postId, after);
            return;
        }

        // 2. Xử lý DELETE (Soft-delete) hoặc Thay đổi trạng thái
        if (before && after && before.status !== 'deleted' && after.status === 'deleted') {
            await removeFeedEntriesIncludingAuthor(postId, after.authorId);
            return;
        }

        // 3. Xử lý UPDATE (Nội dung, Media, Visibility)
        if (before && after && before.status === 'active' && after.status === 'active') {
            const visibilityChanged = before.visibility !== after.visibility;
            const contentChanged = before.content !== after.content ||
                JSON.stringify(before.media) !== JSON.stringify(after.media);

            if (!visibilityChanged && !contentChanged) return;

            // Nếu đổi sang Private: Xóa khỏi feeds của bạn bè (giữ lại feed của tác giả)
            if (visibilityChanged && after.visibility === 'private') {
                await removeFeedEntriesExcludingAuthor(postId, after.authorId);
                await touchAuthorFeed(postId, after.authorId);
            }
            // Nếu đổi từ private sang friends/public: Fan-out lại cho bạn bè
            else if (visibilityChanged && !shouldFanoutToFriends(before.visibility) && shouldFanoutToFriends(after.visibility)) {
                await handleFanout(postId, after);
            }
            // Nếu chỉ đổi nội dung: Cập nhật updatedAt để kích hoạt listener tại client
            else {
                await updateFeedEntries(postId, after.authorId, after.visibility);
            }
        }
    }
);

/**
 * Thêm bài viết vào Feed của bạn bè (Fan-out)
 */
async function handleFanout(postId: string, postData: any) {
    const authorId = postData.authorId;
    if (!authorId) return;

    try {
        const feedEntry = {
            postId,
            authorId,
            createdAt: postData.createdAt || FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
            (batch) => batch.set(db.collection('users').doc(authorId).collection('feeds').doc(postId), feedEntry)
        ];

        if (!shouldFanoutToFriends(postData.visibility)) {
            await commitInChunks(ops);
            return;
        }

        const visibleFriendIds = await getVisibleFriendIds(authorId);
        visibleFriendIds.forEach(friendId => {
            ops.push((batch) => batch.set(db.collection('users').doc(friendId).collection('feeds').doc(postId), feedEntry));
        });

        await commitInChunks(ops);
        console.log(`[handleFanout] ${postId} to ${visibleFriendIds.length + 1} feeds`);
    } catch (error) {
        console.error('[handleFanout] Lỗi:', error);
    }
}

/**
 * Xóa bài viết khỏi Feed của bạn bè (không xóa khỏi feed của chính tác giả)
 */
async function removeFeedEntriesExcludingAuthor(postId: string, authorId: string) {
    try {
        const friendsSnapshot = await db.collection('users').doc(authorId).collection('friends').get();
        const ops = friendsSnapshot.docs.map(friendDoc => (
            (batch: FirebaseFirestore.WriteBatch) => batch.delete(db.collection('users').doc(friendDoc.id).collection('feeds').doc(postId))
        ));

        await commitInChunks(ops);
        console.log(`[removeFeedEntriesExcludingAuthor] ${postId} from ${ops.length} friend feeds`);
    } catch (error) {
        console.error('[removeFeedEntriesExcludingAuthor] Lỗi:', error);
    }
}

/**
 * Xóa bài viết khỏi Feed của tất cả (bao gồm cả tác giả)
 */
async function removeFeedEntriesIncludingAuthor(postId: string, authorId: string) {
    try {
        const friendsSnapshot = await db.collection('users').doc(authorId).collection('friends').get();
        const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
            (batch) => batch.delete(db.collection('users').doc(authorId).collection('feeds').doc(postId))
        ];

        friendsSnapshot.docs.forEach(friendDoc => {
            ops.push((batch) => batch.delete(db.collection('users').doc(friendDoc.id).collection('feeds').doc(postId)));
        });

        await commitInChunks(ops);
        console.log(`[removeFeedEntriesIncludingAuthor] ${postId} from ${ops.length} feeds`);
    } catch (error) {
        console.error('[removeFeedEntriesIncludingAuthor] Lỗi:', error);
    }
}

/**
 * Cập nhật timestamp để kích hoạt listener phía client
 */
async function updateFeedEntries(postId: string, authorId: string, visibility?: string) {
    try {
        const updatedAt = FieldValue.serverTimestamp();

        const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
            (batch) => batch.set(
                db.collection('users').doc(authorId).collection('feeds').doc(postId),
                { updatedAt },
                { merge: true }
            )
        ];

        if (shouldFanoutToFriends(visibility)) {
            const friendsSnapshot = await db.collection('users').doc(authorId).collection('friends').get();
            friendsSnapshot.docs.forEach(friendDoc => {
                ops.push((batch) => batch.set(
                    db.collection('users').doc(friendDoc.id).collection('feeds').doc(postId),
                    { updatedAt },
                    { merge: true }
                ));
            });
        }

        await commitInChunks(ops);
        console.log(`[updateFeedEntries] ${postId} for ${ops.length} feeds`);
    } catch (error) {
        console.error('[updateFeedEntries] Lỗi:', error);
    }
}
