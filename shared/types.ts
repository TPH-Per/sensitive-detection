// ========== SHARED ENUMS ==========
// Các enums này được dùng chung giữa frontend (src) và backend (functions)

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

// ========== SHARED TYPES ==========

export type MemberRole = "admin" | "member";

// ========== SHARED INTERFACES ==========

export interface NotificationPayload {
    postId?: string;
    commentId?: string;
    friendRequestId?: string;
    contentSnippet?: string;
    reportId?: string;
}
