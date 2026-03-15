import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../app';
import { FriendRequestStatus, PostStatus, CommentStatus } from '../types';

// Hàng tuần: Dọn dẹp hệ thống (Notifications, Friend Requests, Soft-deleted Content)
export const systemCleanup = onSchedule(
  { schedule: 'every sunday 03:00', region: 'us-central1', timeZone: 'Asia/Ho_Chi_Minh' },
  async () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 400;

    try {
      // 1. Xóa notifications đã đọc > 90 ngày
      const notifSnap = await db.collection('notifications').where('isRead', '==', true).where('createdAt', '<', ninetyDaysAgo).get();
      if (!notifSnap.empty) {
        for (let i = 0; i < notifSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          notifSnap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        console.log(`[systemCleanup] Đã xóa ${notifSnap.size} notifications`);
      }

      // 2. Xóa friend requests PENDING > 30 ngày
      const freqSnap = await db.collection('friendRequests').where('status', '==', FriendRequestStatus.PENDING).where('createdAt', '<', thirtyDaysAgo).get();
      if (!freqSnap.empty) {
        for (let i = 0; i < freqSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          freqSnap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        console.log(`[systemCleanup] Đã xóa ${freqSnap.size} requests`);
      }

      // 3. Hard delete posts/comments đã soft delete > 90 ngày
      const postsSnap = await db.collection('posts').where('status', '==', PostStatus.DELETED).where('deletedAt', '<', ninetyDaysAgo).get();
      if (!postsSnap.empty) {
        for (let i = 0; i < postsSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          for (const postDoc of postsSnap.docs.slice(i, i + BATCH_SIZE)) {
            const reactionsSnap = await postDoc.ref.collection('reactions').get();
            reactionsSnap.docs.forEach((reactionDoc) => batch.delete(reactionDoc.ref));
            batch.delete(postDoc.ref);
          }
          await batch.commit();
        }
        console.log(`[systemCleanup] Đã xóa ${postsSnap.size} posts`);
      }

      const commentsSnap = await db.collection('comments').where('status', '==', CommentStatus.DELETED).where('deletedAt', '<', ninetyDaysAgo).get();
      if (!commentsSnap.empty) {
        for (let i = 0; i < commentsSnap.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          for (const commentDoc of commentsSnap.docs.slice(i, i + BATCH_SIZE)) {
            const reactionsSnap = await commentDoc.ref.collection('reactions').get();
            reactionsSnap.docs.forEach((reactionDoc) => batch.delete(reactionDoc.ref));
            batch.delete(commentDoc.ref);
          }
          await batch.commit();
        }
        console.log(`[systemCleanup] Đã xóa ${commentsSnap.size} comments`);
      }
    } catch (error) {
      console.error('[systemCleanup] Lỗi:', error);
    }
  }
);


