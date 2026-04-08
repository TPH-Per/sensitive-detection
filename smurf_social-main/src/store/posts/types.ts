import { Post, Visibility, ReactionType, MediaObject } from '../../../shared/types';
import { DocumentSnapshot } from 'firebase/firestore';

export interface PostState {
  posts: Post[];
  hasMore: boolean;
  lastDoc: DocumentSnapshot | null;
  abortController: AbortController | null;
  uploadingStates: Record<string, { progress: number; error?: string }>;
  isError: boolean;
  lastFetchTime: number | null;
  selectedPost: Post | null;
  selectedPostUnsubscribe: (() => void) | null;
}

export interface PostActions {
  fetchPosts: (currentUserId: string, loadMore?: boolean, force?: boolean) => Promise<void>;
  subscribeToPosts: (currentUserId: string) => () => void;
  refreshFeed: (currentUserId: string) => Promise<void>;
  createPost: (userId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[], onProgress?: (progress: number) => void) => Promise<void>;
  updatePost: (postId: string, content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[], onProgress?: (progress: number) => void) => Promise<void>;
  deletePost: (postId: string, userId: string) => Promise<void>;
  reactToPost: (postId: string, userId: string, reaction: ReactionType | 'REMOVE') => Promise<void>;
  uploadMedia: (files: File[], userId: string) => Promise<MediaObject[]>;
  clearPosts: () => void;
  filterPostsByAuthor: (authorId: string) => void;
  setSelectedPost: (post: Post | null) => void;
  fetchPostById: (postId: string, currentUserId: string, friendIds: string[]) => Promise<void>;
  reset: () => void;
}

export type PostStoreState = PostState & PostActions;
