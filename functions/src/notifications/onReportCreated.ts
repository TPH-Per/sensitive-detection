import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from '../app';
import { NotificationType } from '../types';
import { createNotification } from '../helpers/notificationHelper';
import { sendPushNotification } from '../helpers/fcmHelper';

const REPORT_TYPE_LABELS: Record<string, string> = {
  post: 'Bài viết',
  comment: 'Bình luận',
  user: 'Người dùng',
};

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

      const typeLabel = REPORT_TYPE_LABELS[targetType] || targetType;
      const contentSnippet = `${typeLabel} - ${reason}`;

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
