import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';
import {
  NotificationType,
  ReportType,
  ReportStatus,
  PostStatus,
  CommentStatus,
  REPORT_TYPE_LABELS,
  REPORT_REASON_LABELS,
  ReportReason,
} from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';
import { banUserById } from '../helpers/adminHelper';

async function deletePostById(postId: string, adminId: string): Promise<void> {
  const postRef = db.collection('posts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return;
  if (postSnap.data()?.status !== PostStatus.DELETED) {
    await postRef.update({
      status: PostStatus.DELETED,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: adminId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function deleteCommentById(commentId: string, adminId: string): Promise<void> {
  const commentRef = db.collection('comments').doc(commentId);
  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) return;
  if (commentSnap.data()?.status !== CommentStatus.DELETED) {
    await commentRef.update({
      status: CommentStatus.DELETED,
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: adminId,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export const resolveReport = onCall(
  { region: 'us-central1', cors: true },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Chưa đăng nhập');

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== 'admin') {
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

    if (reportData.status !== ReportStatus.PENDING) {
      throw new HttpsError('failed-precondition', 'Báo cáo này đã được xử lý trước đó');
    }

    const adminId = request.auth.uid;

    await reportRef.update({
      status: ReportStatus.RESOLVED,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: adminId,
      resolution,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (action === 'delete_content') {
      if (reportData.targetType === ReportType.POST) {
        await deletePostById(reportData.targetId, adminId);
      } else if (reportData.targetType === ReportType.COMMENT) {
        await deleteCommentById(reportData.targetId, adminId);
      }
    } else if (action === 'ban_user') {
      const targetUserId = reportData.targetType === ReportType.USER
        ? reportData.targetId
        : reportData.targetOwnerId;
      if (targetUserId) await banUserById(targetUserId);
    }

    const typeLabel = REPORT_TYPE_LABELS[reportData.targetType as ReportType] || reportData.targetType;
    const reasonLabel = REPORT_REASON_LABELS[reportData.reason as ReportReason] || reportData.reason;
    const targetId: string = reportData.targetType === ReportType.USER
      ? reportData.targetId
      : reportData.targetOwnerId || reportData.targetId;

    // Thông báo cho người báo cáo
    await Promise.all([
      createNotification({
        receiverId: reportData.reporterId,
        actorId: 'system',
        type: NotificationType.REPORT,
        data: {
          reportId,
          contentSnippet: `Báo cáo của bạn về ${typeLabel} đã được xử lý. Cảm ơn bạn đã góp phần xây dựng cộng đồng.`,
        },
      }),
      sendPushNotification({
        receiverId: reportData.reporterId,
        type: NotificationType.REPORT,
        body: `Báo cáo về ${typeLabel} đã được xử lý.`,
        data: { reportId },
      }),
    ]);

    // Thông báo cho người bị xử lý
    if (action === 'delete_content' && reportData.targetOwnerId) {
      const msg = `Nội dung ${typeLabel} của bạn đã bị gỡ bỏ do vi phạm quy tắc: ${reasonLabel}.`;
      await Promise.all([
        createNotification({
          receiverId: reportData.targetOwnerId,
          actorId: 'system',
          type: NotificationType.REPORT,
          data: { contentSnippet: msg },
        }),
        sendPushNotification({
          receiverId: reportData.targetOwnerId,
          type: NotificationType.REPORT,
          body: msg,
        }),
      ]);
    } else if ((action === 'warn_user' || action === 'ban_user') && targetId) {
      const msg = action === 'ban_user'
        ? `Tài khoản của bạn đã bị khóa do vi phạm quy tắc cộng đồng: ${reasonLabel}.`
        : `Cảnh báo: Tài khoản của bạn bị báo cáo vì: ${reasonLabel}. Vui lòng tuân thủ quy tắc cộng đồng.`;
      await Promise.all([
        createNotification({
          receiverId: targetId,
          actorId: 'system',
          type: NotificationType.REPORT,
          data: { contentSnippet: msg },
        }),
        sendPushNotification({
          receiverId: targetId,
          type: NotificationType.REPORT,
          body: msg,
        }),
      ]);
    }

    return { success: true };
  }
);
