import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../app';
import { FriendRequestStatus, PostStatus, CommentStatus } from '../types';

// Hàng tuần: xóa notifications đã đọc > 90 ngày
export const cleanupOldNotifications = onSchedule(
  { schedule: 'every sunday 03:00', region: 'us-central1', timeZone: 'Asia/Ho_Chi_Minh' },
  async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      const snap = await db
        .collection('notifications')
        .where('isRead', '==', true)
        .where('createdAt', '<', ninetyDaysAgo)
        .get();

      if (snap.empty) return;

      const BATCH_SIZE = 400;
      for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      console.log(`[cleanupOldNotifications] Đã xóa ${snap.size} notifications`);
    } catch (error) {
      console.error('[cleanupOldNotifications] Lỗi:', error);
    }
  }
);

// Hàng tháng: xóa friend requests PENDING > 30 ngày
export const cleanupExpiredFriendRequests = onSchedule(
  { schedule: '0 4 1 * *', region: 'us-central1', timeZone: 'Asia/Ho_Chi_Minh' },
  async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      const snap = await db
        .collection('friendRequests')
        .where('status', '==', FriendRequestStatus.PENDING)
        .where('createdAt', '<', thirtyDaysAgo)
        .get();

      if (snap.empty) return;

      const BATCH_SIZE = 400;
      for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      console.log(`[cleanupExpiredFriendRequests] Đã xóa ${snap.size} requests`);
    } catch (error) {
      console.error('[cleanupExpiredFriendRequests] Lỗi:', error);
    }
  }
);

// Hàng tuần: hard delete posts/comments đã soft delete > 90 ngày
export const cleanupSoftDeletedContent = onSchedule(
  { schedule: 'every sunday 04:00', region: 'us-central1', timeZone: 'Asia/Ho_Chi_Minh' },
  async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 400;

    try {
      const postsSnap = await db
        .collection('posts')
        .where('status', '==', PostStatus.DELETED)
        .where('deletedAt', '<', ninetyDaysAgo)
        .get();

      if (!postsSnap.empty) {
        for (let i = 0; i < postsSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const postDocs = postsSnap.docs.slice(i, i + BATCH_SIZE);

          for (const postDoc of postDocs) {
            const reactionsSnap = await postDoc.ref.collection('reactions').get();
            reactionsSnap.docs.forEach((reactionDoc) => batch.delete(reactionDoc.ref));

            batch.delete(postDoc.ref);
          }

          await batch.commit();
        }
        console.log(`[cleanupSoftDeletedContent] Đã xóa ${postsSnap.size} posts`);
      }

      const commentsSnap = await db
        .collection('comments')
        .where('status', '==', CommentStatus.DELETED)
        .where('deletedAt', '<', ninetyDaysAgo)
        .get(); {
        for (let i = 0; i < commentsSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const commentDocs = commentsSnap.docs.slice(i, i + BATCH_SIZE);

          for (const commentDoc of commentDocs) {
            const reactionsSnap = await commentDoc.ref.collection('reactions').get();
            reactionsSnap.docs.forEach((reactionDoc) => batch.delete(reactionDoc.ref));

            batch.delete(commentDoc.ref);
          }

          await batch.commit();
        }
        console.log(`[cleanupSoftDeletedContent] Đã xóa ${commentsSnap.size} comments`);
      }
    } catch (error) {
      console.error('[cleanupSoftDeletedContent] Lỗi:', error);
    }
  }
);
