import { Post, PostType, SharedPostMessagePayload } from '../../shared/types';

export type SharedPostPayload = SharedPostMessagePayload;
const SNIPPET_LIMIT = 140;

const toSingleLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const getPostSnippet = (post: Post): string => {
  if (post.content?.trim()) {
    return toSingleLine(post.content).slice(0, SNIPPET_LIMIT);
  }

  if (post.type === PostType.AVATAR_UPDATE) {
    return 'Đã cập nhật ảnh đại diện';
  }

  if (post.type === PostType.COVER_UPDATE) {
    return 'Đã cập nhật ảnh bìa';
  }

  return 'Bài viết không có nội dung văn bản';
};

export const getPreviewMedia = (post: Post): { url?: string; type?: 'image' | 'video' } => {
  const media = post.media || [];
  if (media.length === 0) return {};

  const primary = media[0];
  if (primary.mimeType?.startsWith('video/')) {
    return {
      url: primary.thumbnailUrl || primary.url,
      type: 'video',
    };
  }

  return {
    url: primary.url,
    type: 'image',
  };
};

export const getShareUrl = (postId: string): string => {
  if (typeof window === 'undefined') {
    return `/?post=${postId}`;
  }
  return `${window.location.origin}/?post=${postId}`;
};

export const buildSharedPostPayload = (post: Post, authorName: string): SharedPostPayload => {
  const safeAuthorName = authorName.trim() || 'Người dùng';
  const snippet = getPostSnippet(post);
  const url = getShareUrl(post.id);
  const previewMedia = getPreviewMedia(post);

  return {
    postId: post.id,
    authorId: post.authorId,
    authorName: safeAuthorName,
    snippet,
    url,
    previewMediaType: previewMedia.type,
    previewMediaUrl: previewMedia.url,
  };
};

const isValidSharedPostPayload = (value: unknown): value is SharedPostPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const previewType = payload.previewMediaType;

  return (
    typeof payload.postId === 'string' &&
    typeof payload.authorId === 'string' &&
    typeof payload.authorName === 'string' &&
    typeof payload.snippet === 'string' &&
    typeof payload.url === 'string' &&
    (payload.previewMediaUrl === undefined || typeof payload.previewMediaUrl === 'string') &&
    (previewType === undefined || previewType === 'image' || previewType === 'video')
  );
};

export const parseSharedPostMessage = (content: string): SharedPostPayload | null => {
  try {
    const parsed = JSON.parse(content);
    if (!isValidSharedPostPayload(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
