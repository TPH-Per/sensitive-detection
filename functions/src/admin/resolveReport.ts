import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth } from '../app';
import { NotificationType, ReportType, ReportStatus, PostStatus, CommentStatus, UserStatus, REPORT_TYPE_LABELS, REPORT_REASON_LABELS, ReportReason } from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xóa bài viết (soft delete)
 */
async function deletePostById(postId: string, adminId: string): Promise<void> {
  const postRef = db.collection('posts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return;

  const data = postSnap.data();
  if (data?.status !== PostStatus.DELETED) {
    await postRef.update({
      status: PostStatus.DELETED,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: adminId,
    });
  }
}

/**
 * Xóa bình luận (soft delete)
 */
async function deleteCommentById(commentId: string, adminId: string): Promise<void> {
  const commentRef = db.collection('comments').doc(commentId);
  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) return;

  const data = commentSnap.data();
  if (data?.status !== CommentStatus.DELETED) {
    await commentRef.update({
      status: CommentStatus.DELETED,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: adminId,
    });
  }
}

/**
 * Xử lý báo cáo
 */
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
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (reportData.targetType === ReportType.POST && action === 'delete_content') {
      await deletePostById(reportData.targetId, adminId);
    } else if (reportData.targetType === ReportType.COMMENT && action === 'delete_content') {
      await deleteCommentById(reportData.targetId, adminId);
    } else if (reportData.targetType === ReportType.USER && action === 'ban_user') {
      await db.collection('users').doc(reportData.targetId).update({ status: UserStatus.BANNED });
      await auth.revokeRefreshTokens(reportData.targetId);
    }

    const typeLabel = REPORT_TYPE_LABELS[reportData.targetType as ReportType] || reportData.targetType;
    const reasonLabel = REPORT_REASON_LABELS[reportData.reason as ReportReason] || reportData.reason;

    await createNotification({
      receiverId: reportData.reporterId,
      actorId: adminId,
      type: NotificationType.REPORT,
      data: { 
        reportId, 
        contentSnippet: `Báo cáo của bạn về ${typeLabel} đã được xử lý. Cảm ơn bạn đã góp phần xây dựng cộng đồng.` 
      },
    });
    await sendPushNotification({
      receiverId: reportData.reporterId,
      type: NotificationType.REPORT,
      body: `Báo cáo về ${typeLabel} đã được xử lý.`,
      data: { reportId },
    });

    if (reportData.targetOwnerId) {
      const victimMessage = `Nội dung ${typeLabel} của bạn đã bị gỡ bỏ do vi phạm quy tắc: ${reasonLabel}.`;
      await createNotification({
        receiverId: reportData.targetOwnerId,
        actorId: adminId,
        type: NotificationType.REPORT,
        data: { contentSnippet: victimMessage },
      });
      await sendPushNotification({
        receiverId: reportData.targetOwnerId,
        type: NotificationType.REPORT,
        body: 'Thông báo về nội dung vi phạm.',
      });
    }

    if (reportData.targetType === ReportType.USER && action === 'warn_user' && reportData.targetId) {
      const reasonLabel = REPORT_REASON_LABELS[reportData.reason as ReportReason] || reportData.reason;
      await createNotification({
        receiverId: reportData.targetId,
        actorId: adminId,
        type: NotificationType.REPORT,
        data: { contentSnippet: `Cảnh báo: Tài khoản của bạn bị báo cáo vì: ${reasonLabel}. Vui lòng tuân thủ quy tắc cộng đồng.` },
      });
    }

    return { success: true };
  }
);
