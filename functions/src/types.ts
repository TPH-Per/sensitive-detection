// ========== IMPORTS FROM SHARED ==========
// Enums và types dùng chung — import từ shared/types.ts

import {
  UserStatus,
  PostStatus,
  CommentStatus,
  Visibility,
  NotificationType,
  ReportType,
  ReportReason,
  ReportStatus,
  FriendRequestStatus,
  MessageType,
  ReactionType,
  Gender,
  NotificationPayload,
} from "../../shared/types";

// Re-export for consumers
export {
  UserStatus,
  PostStatus,
  CommentStatus,
  Visibility,
  NotificationType,
  ReportType,
  ReportReason,
  ReportStatus,
  FriendRequestStatus,
  MessageType,
  ReactionType,
  Gender,
};

export type { NotificationPayload };

// ========== BACKEND-SPECIFIC TYPES ==========

export interface NotificationData {
  receiverId: string;
  actorId: string;
  type: NotificationType;
  data: NotificationPayload;
}
