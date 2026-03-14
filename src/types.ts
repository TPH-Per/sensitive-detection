// ========== IMPORTS FROM FIREBASE ==========
import { Timestamp } from 'firebase/firestore';

// ========== IMPORTS FROM SHARED ==========
import {
  UserStatus,
  Gender,
  Visibility,
  FriendRequestStatus,
  ReactionType,
  MessageType,
  NotificationType,
  ReportType,
  ReportReason,
  ReportStatus,
  PostStatus,
  CommentStatus,
  MemberRole,
  NotificationPayload,
  UserRole,
  PostType,
} from "../shared/types";

// Re-export for consumers
export {
  UserStatus,
  Gender,
  Visibility,
  FriendRequestStatus,
  ReactionType,
  MessageType,
  NotificationType,
  ReportType,
  ReportReason,
  ReportStatus,
  PostStatus,
  PostType,
  CommentStatus,
  UserRole,
};

export type { NotificationPayload, MemberRole };

// ========== FRONTEND-SPECIFIC ENUMS ==========

export enum FriendStatus {
  NOT_FRIEND = "not_friend",
  PENDING_SENT = "pending_sent",
  PENDING_RECEIVED = "pending_received",
  FRIEND = "friend",
}

// ========== FRONTEND-SPECIFIC TYPES ==========

export type ThemeMode = "light" | "dark";

// ========== BLOCK OPTIONS ==========

export interface BlockOptions {
  blockMessages: boolean;
  blockCalls: boolean;
  blockViewMyActivity: boolean;
  hideTheirActivity: boolean;
}

export interface BlockedUserEntry extends BlockOptions {
  blockedUid: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// ========== BASE ENTITIES ==========

export interface BaseEntity {
  id: string;
  createdAt: Timestamp;
}

export interface SoftDeletableEntity {
  deletedAt?: Timestamp;
  deletedBy?: string;
}

// ========== MEDIA OBJECT ==========

export interface MediaObject {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
  isSensitive: boolean;
}

// Sub-collections interfaces
export interface UserFeedItem {
  postId: string;
  authorId: string;
  createdAt: Timestamp;
}

export interface UserFriendItem {
  friendId: string;
  createdAt: Timestamp;
}

export interface FCMTokenDoc {
  fcmTokens: string[];
  updatedAt: Timestamp;
}

// ========== USER SETTINGS ==========

export interface UserSettings {
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  defaultPostVisibility: Visibility;
  updatedAt: Timestamp;
}

// ========== CORE INTERFACES ==========

export interface User extends BaseEntity {
  fullName: string;
  avatar: MediaObject;
  email: string;
  location?: string;
  gender?: Gender;
  dob?: Timestamp;
  status: 'active' | 'banned';
  role: UserRole;
  bio?: string;
  cover: MediaObject;
  updatedAt: Timestamp;
  deletedAt?: Timestamp;
  settings?: UserSettings;
}

export interface FriendRequest extends BaseEntity {
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  updatedAt?: Timestamp;
}

// ========== RTDB CHAT INTERFACES ==========

export interface RtdbConversation {
  isGroup: boolean;
  name?: string;
  avatar?: MediaObject;
  creatorId: string;
  members: Record<string, MemberRole>;
  typing?: Record<string, number>;
  lastMessage?: {
    senderId: string;
    content: string;
    type: MessageType;
    timestamp: number;
    messageId?: string;
    readBy?: Record<string, number>;
    deliveredTo?: Record<string, number>;
  };
  createdAt: number;
  updatedAt: number;
  isDisbanded?: boolean;
}

export interface RtdbUserChat {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
  lastReadMsgId: string | null;
  lastMsgTimestamp: number;
  clearedAt?: number;
}

export interface RtdbMessage {
  senderId: string;
  type: MessageType;
  content: string;
  media?: MediaObject[];
  mentions?: string[];
  isForwarded?: boolean;
  replyToId?: string;
  isEdited?: boolean;
  isRecalled?: boolean;
  deletedBy?: Record<string, true>;
  readBy?: Record<string, number>;
  deliveredTo?: Record<string, number>;
  reactions?: Record<string, string>;
  createdAt: number;
  updatedAt?: number;
}


export interface RtdbPresence {
  isOnline: boolean;
  lastSeen: number;
}

export interface RtdbCallSignaling {
  callerId: string;
  conversationId: string;
  callType: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  zegoToken?: string;
  timestamp: number;
}

export interface Comment extends BaseEntity, SoftDeletableEntity {
  postId: string;
  authorId: string;
  parentId?: string;
  content: string;
  status: CommentStatus;
  image?: MediaObject;
  replyCount?: number;
  isEdited?: boolean;
  editedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface Post extends BaseEntity, SoftDeletableEntity {
  authorId: string;
  type: PostType;
  content: string;
  status: PostStatus;
  media?: MediaObject[];
  commentCount: number;
  visibility: Visibility;
  isEdited?: boolean;
  editedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface Notification extends BaseEntity {
  receiverId: string;
  actorId: string;
  type: NotificationType;
  data: NotificationPayload;
  isRead: boolean;
}

export interface Report extends BaseEntity {
  reporterId: string;
  targetType: ReportType;
  targetId: string;
  targetOwnerId: string;
  reason: ReportReason;
  description?: string;
  images?: MediaObject[];
  status: ReportStatus;
  updatedAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
  resolution?: string;
}
