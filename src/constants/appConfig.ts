import { getValidatedEnvConfig } from '../utils/validateEnv';
import { ReactionType } from '../types';

// Phân trang
export const PAGINATION = {
  FEED_POSTS: 15,
  USER_POSTS: 20,
  COMMENTS: 5,
  REPLIES: 3,
  FRIENDS: 50,
  MESSAGES: 50,
  CHAT_MESSAGES: 20,
  NOTIFICATIONS: 15,
  ADMIN_REPORTS: 50,
  ADMIN_USERS: 50,
  FEED_CACHE_LIMIT: 50,
  CHAT_CACHE_LIMIT: 50,
  USER_CACHE_LIMIT: 100,
  NOTIFY_CACHE_LIMIT: 50,
} as const;

// Giới hạn Firebase
export const FIREBASE_LIMITS = {
  QUERY_IN_LIMIT: 10,
} as const;

// Giới hạn thời gian (ms)
export const TIME_LIMITS = {
  MESSAGE_EDIT_WINDOW: 5 * 60 * 1000,
  TYPING_TIMEOUT: 3000,
  TOAST_DURATION: 3000,
  VOICE_MAX_DURATION: 5 * 60 * 1000,
} as const;

// Giới hạn Media
export const MEDIA_CONSTRAINTS = {
  MAX_IMAGES_PER_POST: 10,
  MAX_VIDEOS_PER_POST: 1,
  MAX_IMAGES_PER_COMMENT: 1,
} as const;

// Giới hạn nhóm chat
export const GROUP_LIMITS = {
  MIN_MEMBERS: 2,
  MAX_MEMBERS: 100,
  NAME_MAX_LENGTH: 50,
} as const;

// Validation
export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 6,
  BIO_MAX_LENGTH: 500,
  POST_CONTENT_MAX_LENGTH: 5000,
  COMMENT_MAX_LENGTH: 2000,
  MESSAGE_MAX_LENGTH: 5000,
  USER_NAME_MAX_LENGTH: 50,
} as const;

// Giới hạn kích thước file (bytes)
export const FILE_LIMITS = {
  IMAGE: 5 * 1024 * 1024,      // 5MB (posts/images, avatars)
  VIDEO: 50 * 1024 * 1024,     // 50MB (posts/videos)
  FILE: 10 * 1024 * 1024,      // 10MB (chat files)
  AVATAR: 5 * 1024 * 1024,     // 5MB
  COVER: 10 * 1024 * 1024,     // 10MB
  CHAT_MAX_FILES: 10,
} as const;

export type FileLimitType = keyof typeof FILE_LIMITS;

// Cấu hình nén ảnh
export const IMAGE_COMPRESSION = {
  AVATAR: { maxSizeMB: 0.5, maxWidthOrHeight: 512 },
  COVER: { maxSizeMB: 1, maxWidthOrHeight: 1920 },
  POST: { maxSizeMB: 1, maxWidthOrHeight: 1920 },
  COMMENT: { maxSizeMB: 0.5, maxWidthOrHeight: 1280 },
  CHAT: { maxSizeMB: 0.8, maxWidthOrHeight: 1920 },
  REPORT: { maxSizeMB: 1, maxWidthOrHeight: 1280 },
} as const;

// Cấu hình báo cáo
export const REPORT_CONFIG = {
  DESCRIPTION_MAX_LENGTH: 500,
  MAX_IMAGES_PER_REPORT: 5,
  REASONS: {
    spam: { label: 'Spam', description: 'Tin rác, quảng cáo không mong muốn' },
    harassment: { label: 'Quấy rối & Bạo lực', description: 'Bắt nạt, đe dọa hoặc nội dung bạo lực' },
    hate_speech: { label: 'Ngôn từ thù ghét', description: 'Phân biệt chủng tộc, giới tính, thù địch' },
    sensitive: { label: 'Nội dung nhạy cảm', description: 'Hình ảnh/video khiêu dâm, người lớn' },
    scam_impersonation: { label: 'Lừa đảo & Giả mạo', description: 'Chiếm đoạt tài sản hoặc mạo danh người khác' },
    other: { label: 'Khác', description: 'Lý do khác' }
  },
  TYPE_LABELS: {
    post: 'Bài viết',
    comment: 'Bình luận',
    user: 'Người dùng'
  }
} as const;

// Phản ứng (Reactions)
export const REACTIONS = [
  ReactionType.LIKE,
  ReactionType.LOVE,
  ReactionType.HAHA,
  ReactionType.WOW,
  ReactionType.SAD,
  ReactionType.ANGRY
] as const;

export const REACTION_LABELS: Record<ReactionType, string> = {
  [ReactionType.LIKE]: 'Thích',
  [ReactionType.LOVE]: 'Yêu thích',
  [ReactionType.HAHA]: 'Haha',
  [ReactionType.WOW]: 'Wow',
  [ReactionType.SAD]: 'Buồn',
  [ReactionType.ANGRY]: 'Phẫn nộ'
};

// API Endpoints
const envConfig = getValidatedEnvConfig();

export const API_ENDPOINTS = {
  PROVINCES: envConfig.api.provincesUrl,
} as const;
