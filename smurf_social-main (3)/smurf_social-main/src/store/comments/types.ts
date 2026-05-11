import { Comment, ReactionType, MediaObject } from '../../../shared/types';
import { DocumentSnapshot } from 'firebase/firestore';

export interface CommentState {
  rootComments: Record<string, Comment[]>;
  replies: Record<string, Record<string, Comment[]>>;
  lastRootDoc: Record<string, DocumentSnapshot | null>;
  hasMoreRoot: Record<string, boolean>;
  lastReplyDoc: Record<string, Record<string, DocumentSnapshot | null>>;
  hasMoreReply: Record<string, Record<string, boolean>>;
  loadingPosts: Record<string, boolean>;
  uploadingStates: Record<string, { progress: number; error?: string }>;
  rootSortOrder: Record<string, 'asc' | 'desc'>;
}

export interface CommentActions {
  fetchRootComments: (postId: string, hiddenActivityUserIds?: string[], loadMore?: boolean) => Promise<void>;
  fetchReplies: (postId: string, parentId: string, hiddenActivityUserIds?: string[], loadMore?: boolean) => Promise<void>;
  subscribeToComments: (postId: string, hiddenActivityUserIds?: string[]) => () => void;
  subscribeToReplies: (postId: string, parentId: string, hiddenActivityUserIds?: string[]) => () => void;
  createComment: (postId: string, userId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: MediaObject | File) => Promise<string>;
  updateComment: (postId: string, commentId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: MediaObject | File) => Promise<void>;
  deleteComment: (postId: string, commentId: string, userId: string, parentId?: string | null) => Promise<void>;
  reactToComment: (postId: string, commentId: string, userId: string, reaction: ReactionType | 'REMOVE', parentId?: string | null) => Promise<void>;
  setRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  addRootComments: (postId: string, comments: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  setReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  addReplies: (postId: string, parentId: string, replies: Comment[], lastDoc: DocumentSnapshot | null, hasMore: boolean) => void;
  clearComments: (postId: string) => void;
  updateCommentInStore: (postId: string, commentId: string, content: string, parentId?: string | null, replyToUserId?: string, replyToId?: string, image?: any) => void;
  isLoadingPost: (postId: string) => boolean;
  getFilteredRootComments: (postId: string, postOwnerId: string, currentUserId: string, friendIds: string[]) => { visibleComments: Comment[]; hiddenCount: number };
  getFilteredReplies: (postId: string, parentId: string, postOwnerId: string, currentUserId: string, friendIds: string[]) => { visibleReplies: Comment[]; hiddenCount: number };
  setRootSortOrder: (postId: string, order: 'asc' | 'desc') => void;
  reset: () => void;
}

export type CommentStoreState = CommentState & CommentActions;
