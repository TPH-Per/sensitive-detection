export * from '../../shared/types';

import { NotificationType, NotificationPayload } from '../../shared/types';

// ========== BACKEND-SPECIFIC TYPES ==========

export interface NotificationData {
  receiverId: string;
  actorId: string;
  type: NotificationType;
  data: NotificationPayload;
}
