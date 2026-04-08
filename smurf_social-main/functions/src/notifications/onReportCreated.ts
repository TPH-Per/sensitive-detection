import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { NotificationType, REPORT_TYPE_LABELS, REPORT_REASON_LABELS, ReportType, ReportReason } from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

/**
 * Xử lý khi có báo cáo mới
 */
export const onReportCreated = onDocumentCreated(
  { document: 'reports/{reportId}', region: 'us-central1' },
  async (event) => {
    const report = event.data?.data();
    if (!report) return;

    const reportId = event.params.reportId;
    const { reporterId, targetType, reason } = report;

    try {
      const usersSnapshot = await db.collection('users').where('role', '==', 'admin').get();
      const adminIds = usersSnapshot.docs.map(doc => doc.id);

      if (adminIds.length === 0) return;

      const typeLabel = REPORT_TYPE_LABELS[targetType as ReportType] || targetType;
      const reasonLabel = REPORT_REASON_LABELS[reason as ReportReason] || reason;
      const contentSnippet = `Báo cáo mới về ${typeLabel}: ${reasonLabel}`;

      const notifications = adminIds.map((adminId) =>
        createNotification({
          receiverId: adminId,
          actorId: reporterId,
          type: NotificationType.REPORT,
          data: { reportId, contentSnippet },
        })
      );

      const pushNotifications = adminIds.map((adminId) =>
        sendPushNotification({
          receiverId: adminId,
          type: NotificationType.REPORT,
          body: `Có báo cáo mới: ${contentSnippet}`,
          data: { reportId },
        })
      );

      await Promise.all([...notifications, ...pushNotifications]);
    } catch (error) {
      console.error('[onReportCreated] Lỗi:', error);
    }
  }
);
