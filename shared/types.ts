// ========== SHARED ENUMS ==========
// Các enums này được dùng chung giữa frontend (src) và backend (functions)

import { Timestamp } from 'firebase/firestore';

export enum UserStatus {
    ACTIVE = "active",
    BANNED = "banned",
}

export enum Gender {
    MALE = "male",
    FEMALE = "female",
    NONE = "",
}

export enum Visibility {
    PUBLIC = "public",
    FRIENDS = "friends",
    PRIVATE = "private",
}

export enum FriendRequestStatus {
    PENDING = "pending",
    ACCEPTED = "accepted",
    REJECTED = "rejected",
}

export enum ReactionType {
    LIKE = "like",
    LOVE = "love",
    HAHA = "haha",
    WOW = "wow",
    SAD = "sad",
    ANGRY = "angry",
}

export enum MessageType {
    TEXT = "text",
    IMAGE = "image",
    VIDEO = "video",
    FILE = "file",
    VOICE = "voice",
    SYSTEM = "system",
    CALL = "call",
}

export enum NotificationType {
    REACTION = "reaction",
    COMMENT = "comment",
    FRIEND_REQUEST = "friend_request",
    SYSTEM = "system",
    REPORT = "report",
    CHAT = "chat",
    MENTION = "mention",
}

export enum ReportType {
    POST = "post",
    COMMENT = "comment",
    USER = "user",
}

export enum ReportReason {
    SPAM = "spam",
    HARASSMENT = "harassment",
    HATE_SPEECH = "hate_speech",
    SENSITIVE = "sensitive",
    SCAM_IMPERSONATION = "scam_impersonation",
    OTHER = "other",
}

export enum ReportStatus {
    PENDING = "pending",
    RESOLVED = "resolved",
    REJECTED = "rejected",
}

export enum PostStatus {
    ACTIVE = "active",
    DELETED = "deleted",
}

export enum PostType {
    REGULAR = "regular",
    AVATAR_UPDATE = "avatar_update",
    COVER_UPDATE = "cover_update",
}

export enum CommentStatus {
    ACTIVE = "active",
    DELETED = "deleted",
}

export enum UserRole {
    USER = "user",
    ADMIN = "admin",
}

export enum FriendStatus {
    NOT_FRIEND = "not_friend",
    PENDING_SENT = "pending_sent",
    PENDING_RECEIVED = "pending_received",
    FRIEND = "friend",
}

// ========== SHARED TYPES ==========

export type MemberRole = "admin" | "member";
export type ThemeMode = "light" | "dark";

// ========== SHARED INTERFACES ==========

export interface NotificationPayload {
    postId?: string;
    commentId?: string;
    friendRequestId?: string;
    contentSnippet?: string;
    reportId?: string;
    convId?: string;
    senderName?: string;
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

// ========== USER SETTINGS ==========

export interface UserSettings {
    showOnlineStatus: boolean;
    showReadReceipts: boolean;
    defaultPostVisibility: Visibility;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// ========== CORE INTERFACES ==========

export interface User extends BaseEntity {
    fullName: string;
    avatar?: MediaObject;
    email: string;
    location?: string;
    gender?: Gender;
    dob?: Timestamp;
    status: UserStatus;
    role: UserRole;
    bio?: string;
    cover?: MediaObject;
    updatedAt: Timestamp;
    deletedAt?: Timestamp;
    settings?: UserSettings;
}

export interface FriendRequest extends BaseEntity {
    senderId: string;
    receiverId: string;
    status: FriendRequestStatus;
    updatedAt: Timestamp;
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
    lastReadMsgId?: string | null;
    lastMsgTimestamp: number;
    clearedAt: number;
    createdAt: number;
    updatedAt: number;
}

export interface CallMessagePayload {
    callType: 'voice' | 'video';
    status: 'started' | 'ended' | 'missed' | 'rejected' | 'busy';
    duration?: number;
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
    updatedAt: number;
}

export interface RtdbPresence {
    isOnline: boolean;
    lastSeen: number;
    createdAt: number;
    updatedAt: number;
}

export interface RtdbCallSignaling {
    callerId: string;
    callerName: string;
    callerAvatar: string;
    conversationId: string;
    callType: 'voice' | 'video';
    status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'busy';
    isGroupCall?: boolean;
    timestamp: number;
    createdAt: number;
    updatedAt: number;
}

// ========== POSTS & COMMENTS ==========

export interface Comment extends BaseEntity, SoftDeletableEntity {
    postId: string;
    authorId: string;
    parentId?: string;
    replyToUserId?: string;
    replyToId?: string;
    content: string;
    status: CommentStatus;
    image?: MediaObject;
    replyCount?: number;
    updatedAt: Timestamp;
}

// ========== REACTION INTERFACES ==========

export interface ReactionDoc {
    type: ReactionType;
    createdAt: Timestamp;
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
    updatedAt: Timestamp;
}

// ========== NOTIFICATIONS & REPORTS ==========

export interface Notification extends BaseEntity {
    receiverId: string;
    actorId: string;
    type: NotificationType;
    data: NotificationPayload;
    isRead: boolean;
    updatedAt: Timestamp;
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
    updatedAt: Timestamp;
    resolvedAt?: Timestamp;
    resolvedBy?: string;
    resolution?: string;
}

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
    updatedAt: Timestamp;
}

// Sub-collections interfaces
export interface UserFeedItem {
    postId: string;
    authorId: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface UserFriendItem {
    friendId: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface FCMTokenDoc {
    fcmTokens: string[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
