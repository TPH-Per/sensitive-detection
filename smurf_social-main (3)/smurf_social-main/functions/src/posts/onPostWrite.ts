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
    const hiddenOrBlockedIds = new Set<string>();
    const chunkSize = 20;

    for (let i = 0; i < friendIds.length; i += chunkSize) {
        const chunk = friendIds.slice(i, i + chunkSize);

        const blockCheckPromises = chunk.flatMap(fid => [
            db.collection('users').doc(fid).collection('blockedUsers').doc(authorId).get(),
            db.collection('users').doc(authorId).collection('blockedUsers').doc(fid).get()
        ]);

        const snaps = await Promise.all(blockCheckPromises);

        for (let j = 0; j < chunk.length; j++) {
            const friendId = chunk[j];
            const friendBlockSnap = snaps[j * 2];     
            const authorBlockSnap = snaps[j * 2 + 1]; 

            const isHiddenByFriend = friendBlockSnap.exists && friendBlockSnap.data()?.hideTheirActivity === true;
            const isBlockedByAuthor = authorBlockSnap.exists && authorBlockSnap.data()?.blockViewMyActivity === true;

            if (isHiddenByFriend || isBlockedByAuthor) {
                hiddenOrBlockedIds.add(friendId);
            }
        }
    }

    return friendIds.filter(friendId => !hiddenOrBlockedIds.has(friendId));
}

async function touchAuthorFeed(postId: string, authorId: string) {
    await db.collection('users').doc(authorId).collection('feeds').doc(postId).set(
        { updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
    );
}

/** Đồng bộ bài viết vào bảng tin khi có thay đổi */
export const onPostWrite = onDocumentWritten(
    { document: 'posts/{postId}', region: 'asia-southeast1' },
    async (event) => {
        const postId = event.params.postId;
        const before = event.data?.before.data();
        const after = event.data?.after.data();

        if (!before && after) {
            await handleFanout(postId, after);
            return;
        }

        if (before && after && before.status !== 'deleted' && after.status === 'deleted') {
            await removeFeedEntriesIncludingAuthor(postId, after.authorId);
            return;
        }

        if (before && after && before.status === 'active' && after.status === 'active') {
            const visibilityChanged = before.visibility !== after.visibility;
            const contentChanged = before.content !== after.content ||
                JSON.stringify(before.media) !== JSON.stringify(after.media);

            if (!visibilityChanged && !contentChanged) return;

            if (visibilityChanged && after.visibility === 'private') {
                await removeFeedEntriesExcludingAuthor(postId, after.authorId);
                await touchAuthorFeed(postId, after.authorId);
            }
            else if (visibilityChanged && !shouldFanoutToFriends(before.visibility) && shouldFanoutToFriends(after.visibility)) {
                await handleFanout(postId, after);
            }
            else {
                await updateFeedEntries(postId, after.authorId, after.visibility);
            }
        }
    }
);

/** Phân phối bài viết tới bảng tin bạn bè */
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

/** Gỡ bài viết khỏi bảng tin bạn bè (giữ lại trên bảng tin người đăng) */
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

/** Gỡ bài viết khỏi tất cả bảng tin */
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

/** Cập nhật trạng thái bài viết trên bảng tin */
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
