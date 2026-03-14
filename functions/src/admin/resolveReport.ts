import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../app';
import { NotificationType, ReportType, ReportStatus, PostStatus, CommentStatus, UserStatus } from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

// Soft delete post — set status to DELETED
async function deletePostById(postId: string, adminId: string): Promise<void> {
  const postSnap = await db.collection('posts').doc(postId).get();
  if (!postSnap.exists) return;

  await db.collection('posts').doc(postId).update({
    status: PostStatus.DELETED,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: adminId,
  });
}

// Soft delete comment — set status to DELETED
async function deleteCommentById(commentId: string, adminId: string): Promise<void> {
  const commentSnap = await db.collection('comments').doc(commentId).get();
  if (!commentSnap.exists) return;

  await db.collection('comments').doc(commentId).update({
    status: CommentStatus.DELETED,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: adminId,
  });
}

export const resolveReport = onCall(
  {
    region: 'us-central1',
    cors: true
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    const callerRole = callerDoc.data()?.role;
    if (callerRole !== 'admin') {
      throw new HttpsError('permission-denied', 'Không có quyền Admin');
    }

    const { reportId, resolution = 'Đã xử lý', action = 'delete_content' } = request.data as {
      reportId: string;
      resolution?: string;
      action?: 'delete_content' | 'warn_user' | 'ban_user';
    };

    if (!reportId) throw new HttpsError('invalid-argument', 'Thiếu reportId');

    const reportRef = db.collection('reports').doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) throw new HttpsError('not-found', 'Báo cáo không tồn tại');

    const reportData = reportSnap.data()!;
    const adminId = request.auth.uid;

    await reportRef.update({
      status: ReportStatus.RESOLVED,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: adminId,
      resolution,
    });

    if (reportData.targetType === ReportType.POST && action === 'delete_content') {
      await deletePostById(reportData.targetId, adminId);
    } else if (reportData.targetType === ReportType.COMMENT && action === 'delete_content') {
      await deleteCommentById(reportData.targetId, adminId);
    } else if (reportData.targetType === ReportType.USER && action === 'ban_user') {
      await db.collection('users').doc(reportData.targetId).update({ status: UserStatus.BANNED });
      await auth.revokeRefreshTokens(reportData.targetId);
    }

    await createNotification({
      receiverId: reportData.reporterId,
      actorId: adminId,
      type: NotificationType.SYSTEM,
      data: { reportId },
    });
    await sendPushNotification({
      receiverId: reportData.reporterId,
      type: NotificationType.SYSTEM,
      body: 'Báo cáo của bạn đã được xử lý. Cảm ơn bạn!',
      data: { reportId },
    });

    if (reportData.targetOwnerId) {
      await createNotification({
        receiverId: reportData.targetOwnerId,
        actorId: adminId,
        type: NotificationType.SYSTEM,
        data: { contentSnippet: reportData.reason },
      });
      await sendPushNotification({
        receiverId: reportData.targetOwnerId,
        type: NotificationType.SYSTEM,
        body: 'Nội dung của bạn đã bị xem xét và xử lý do vi phạm quy tắc cộng đồng.',
      });
    }

    if (reportData.targetType === ReportType.USER && action === 'warn_user' && reportData.targetId) {
      await createNotification({
        receiverId: reportData.targetId,
        actorId: adminId,
        type: NotificationType.SYSTEM,
        data: { contentSnippet: `Cảnh báo: Tài khoản bị báo cáo vì: ${reportData.reason}. Vui lòng tuân thủ quy tắc cộng đồng.` },
      });
    }

    return { success: true };
  }
);
