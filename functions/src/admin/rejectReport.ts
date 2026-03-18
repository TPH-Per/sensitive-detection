import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../app';
import { NotificationType, ReportStatus, REPORT_TYPE_LABELS, ReportType } from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Từ chối báo cáo
 */
export const rejectReport = onCall(
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

    const { reportId } = request.data as { reportId: string };
    if (!reportId) throw new HttpsError('invalid-argument', 'Thiếu reportId');

    const reportRef = db.collection('reports').doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) throw new HttpsError('not-found', 'Báo cáo không tồn tại');

    const reportData = reportSnap.data()!;
    const adminId = request.auth.uid;

    await reportRef.update({
      status: ReportStatus.REJECTED,
      resolvedAt: FieldValue.serverTimestamp(),
      resolvedBy: adminId,
      resolution: 'Không phát hiện vi phạm',
      updatedAt: FieldValue.serverTimestamp(),
    });

    const typeLabel = REPORT_TYPE_LABELS[reportData.targetType as ReportType] || reportData.targetType;

    await createNotification({
      receiverId: reportData.reporterId,
      actorId: adminId,
      type: NotificationType.REPORT,
      data: { 
        reportId, 
        contentSnippet: `Báo cáo của bạn về ${typeLabel} đã được xem xét. Chúng tôi không phát hiện thấy vi phạm quy tắc cộng đồng trong nội dung này.` 
      },
    });
    await sendPushNotification({
      receiverId: reportData.reporterId,
      type: NotificationType.REPORT,
      body: `Kết quả xem xét báo cáo về ${typeLabel}.`,
      data: { reportId },
    });

    return { success: true };
  }
);
