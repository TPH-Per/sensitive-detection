import { Timestamp } from 'firebase-admin/firestore';

// ────────────────────────────────────────────
// User
// ────────────────────────────────────────────
export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BANNED: 'banned',
} as const;
export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

export interface User {
  status?: string;
  role?: string;
  interests?: string[];
  location?: string;
  school?: string;
  generation?: string;
  userVector?: number[];
  suggestedFriends?: Array<{ id: string; mutualCount?: number }>;
  suggestionsLastUpdated?: Timestamp;
  fullName?: string;
  email?: string;
  avatar?: MediaObject;
  cover?: MediaObject;
  dob?: Timestamp;
  friendIds?: string[];
  myPostIds?: string[];
}

// ────────────────────────────────────────────
// Post
// ────────────────────────────────────────────
export const PostStatus = {
  ACTIVE: 'active',
  DELETED: 'deleted',
} as const;
export type PostStatusType = (typeof PostStatus)[keyof typeof PostStatus];

export const PostType = {
  REGULAR: 'regular',
  AVATAR_UPDATE: 'avatar_update',
  COVER_UPDATE: 'cover_update',
} as const;
export type PostTypeType = (typeof PostType)[keyof typeof PostType];

// ────────────────────────────────────────────
// Comment
// ────────────────────────────────────────────
export const CommentStatus = {
  ACTIVE: 'active',
  DELETED: 'deleted',
} as const;
export type CommentStatusType = (typeof CommentStatus)[keyof typeof CommentStatus];

// ────────────────────────────────────────────
// Notification
// ────────────────────────────────────────────
export const NotificationType = {
  REACTION: 'reaction',
  COMMENT: 'comment',
  CHAT: 'chat',
  MENTION: 'mention',
  FRIEND_REQUEST: 'friendRequest',
  JOB_ALERT: 'jobAlert',
  SYSTEM: 'system',
  REPORT: 'report',
  APPLICATION_RECEIVED: 'applicationReceived',
  APPLICATION_STATUS_CHANGED: 'applicationStatusChanged',
  INTERVIEW_SCHEDULED: 'interviewScheduled',
  INTERVIEW_RESCHEDULED: 'interviewRescheduled',
  INTERVIEW_CANCELLED: 'interviewCancelled',
  NEW_JOB_MATCH: 'newJobMatch',
  JOB_EXPIRED: 'jobExpired',
} as const;
export type NotificationTypeType = (typeof NotificationType)[keyof typeof NotificationType];

// ────────────────────────────────────────────
// Report
// ────────────────────────────────────────────
export const ReportType = {
  POST: 'post',
  COMMENT: 'comment',
  USER: 'user',
} as const;
export type ReportTypeType = (typeof ReportType)[keyof typeof ReportType];

export const ReportStatus = {
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;
export type ReportStatusType = (typeof ReportStatus)[keyof typeof ReportStatus];

export const ReportReason = {
  SPAM: 'spam',
  HARASSMENT: 'harassment',
  INAPPROPRIATE_CONTENT: 'inappropriate_content',
  FAKE_ACCOUNT: 'fake_account',
  SCAM: 'scam',
  OTHER: 'other',
} as const;
export type ReportReasonType = (typeof ReportReason)[keyof typeof ReportReason];

export const REPORT_TYPE_LABELS: Record<string, string> = {
  [ReportType.POST]: 'Bài viết',
  [ReportType.COMMENT]: 'Bình luận',
  [ReportType.USER]: 'Người dùng',
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  [ReportReason.SPAM]: 'Spam',
  [ReportReason.HARASSMENT]: 'Quấy rối',
  [ReportReason.INAPPROPRIATE_CONTENT]: 'Nội dung không phù hợp',
  [ReportReason.FAKE_ACCOUNT]: 'Tài khoản giả mạo',
  [ReportReason.SCAM]: 'Lừa đảo',
  [ReportReason.OTHER]: 'Khác',
};

// ────────────────────────────────────────────
// Media
// ────────────────────────────────────────────
export interface MediaObject {
  url: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  isSensitive?: boolean;
}
