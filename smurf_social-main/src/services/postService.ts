import {
  collection,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  Timestamp,
  serverTimestamp,
  onSnapshot,
  limit,
  startAfter,
  DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Post, Visibility, ReactionType, ReactionDoc, PostStatus, MediaObject, PostType } from '../../shared/types'
import { batchGetUsers } from '../utils/batchUtils';
import { userService } from './userService';
import { PAGINATION, IMAGE_COMPRESSION } from '../constants';
import { compressImage, isImageFile } from '../utils/imageUtils';
import { withRetry } from '../utils/retryUtils';
import { uploadWithProgress, ProgressCallback, deleteStorageFiles, generateVideoThumbnail } from '../utils/uploadUtils';
import { convertDoc, convertDocs } from '../utils/firebaseUtils';
import { getSafeMillis } from '../utils/timestampHelpers';
import {
  validatePostContent,
  validateImageFile,
  validateVideoFile,
  FileValidationError
} from '../utils/fileValidation';

// Chuyển đổi Firestore document sang Post
const postConverter = (doc: DocumentSnapshot) => convertDoc<Post>(doc);

// Phân quyền hiển thị
function getVisibilityFilter(isOwner: boolean, isFriend: boolean): Visibility[] {
  if (isOwner) {
    return [Visibility.FRIENDS, Visibility.PRIVATE];
  } else if (isFriend) {
    return [Visibility.FRIENDS];
  }
  return [];
}

export const postService = {
  /** Lấy danh sách bài viết từ Feed Fan-out */
  getFeedFromFanout: async (
    userId: string,
    limitCount: number = PAGINATION.FEED_POSTS,
    lastDoc?: DocumentSnapshot
  ): Promise<{ posts: Post[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> => {
    try {
      if (!userId) return { posts: [], lastDoc: null, hasMore: false };

      let feedQuery = query(
        collection(db, 'users', userId, 'feeds'),
        orderBy('createdAt', 'desc'),
        limit(limitCount + 1)
      );

      if (lastDoc) {
        feedQuery = query(feedQuery, startAfter(lastDoc));
      }

      const feedSnapshot = await getDocs(feedQuery);

      if (feedSnapshot.empty) {
        return { posts: [], lastDoc: null, hasMore: false };
      }

      const postIds = feedSnapshot.docs.map(doc => doc.data().postId);

      const posts: Post[] = [];

      const postPromises = postIds.map(id => getDoc(doc(db, 'posts', id)));
      const postResults = await Promise.allSettled(postPromises);

      for (const result of postResults) {
        if (result.status === 'fulfilled' && result.value.exists()) {
          const postData = result.value.data();
          if (postData.status === PostStatus.ACTIVE) {
            posts.push(convertDoc<Post>(result.value));
          }
        }
      }

      posts.sort((a, b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));

      const blockedUsersMap = await userService.getBlockedUsers(userId);
      const hiddenAuthorIds = Object.keys(blockedUsersMap).filter(
        id => blockedUsersMap[id].hideTheirActivity
      );
      const authorIds = [...new Set(posts.map(p => p.authorId))];
      const usersMap = await batchGetUsers(authorIds);
      const filteredPosts = posts.filter(p =>
        usersMap[p.authorId]?.status !== 'banned' &&
        !hiddenAuthorIds.includes(p.authorId)
      );

      const hasMore = filteredPosts.length > limitCount;
      const finalPosts = filteredPosts.slice(0, limitCount);

      const lastPost = finalPosts[finalPosts.length - 1];
      const lastVisible = lastPost
        ? feedSnapshot.docs.find(d => d.data().postId === lastPost.id) || null
        : null;

      return { posts: finalPosts, lastDoc: lastVisible, hasMore };
    } catch (error) {
      console.error("Lỗi lấy feed từ fan-out", error);
      return { posts: [], lastDoc: null, hasMore: false };
    }
  },

  /** Theo dõi bài viết Feed Fan-out thời gian thực */
  subscribeToFeedFanout: (
    userId: string,
    callback: (action: 'add' | 'update' | 'remove', posts: Post[]) => void,
    limitCount: number = PAGINATION.FEED_POSTS
  ) => {
    if (!userId) return () => { };

    const feedQuery = query(
      collection(db, 'users', userId, 'feeds'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    return onSnapshot(feedQuery, async (snapshot) => {
      const addedIds = snapshot.docChanges()
        .filter(c => c.type === 'added')
        .map(c => c.doc.data().postId);

      if (addedIds.length > 0) {
        const postPromises = addedIds.map(id => getDoc(doc(db, 'posts', id)));
        const postResults = await Promise.allSettled(postPromises);

        const posts: Post[] = [];
        for (const result of postResults) {
          if (result.status === 'fulfilled' && result.value.exists()) {
            const postData = result.value.data();
            if (postData.status === PostStatus.ACTIVE) {
              posts.push(convertDoc<Post>(result.value));
            }
          }
        }

        if (posts.length > 0) callback('add', posts);
      }

      const removedIds = snapshot.docChanges()
        .filter(c => c.type === 'removed')
        .map(c => c.doc.data().postId);

      if (removedIds.length > 0) {
        callback('remove', removedIds.map(id => ({ id } as Post)));
      }

      const modifiedIds = snapshot.docChanges()
        .filter(c => c.type === 'modified')
        .map(c => c.doc.data().postId);

      if (modifiedIds.length > 0) {
        const postPromises = modifiedIds.map(id => getDoc(doc(db, 'posts', id)));
        const postResults = await Promise.allSettled(postPromises);

        const posts: Post[] = [];
        for (const result of postResults) {
          if (result.status === 'fulfilled' && result.value.exists()) {
            const postData = result.value.data();
            if (postData.status === PostStatus.ACTIVE) {
              posts.push(convertDoc<Post>(result.value));
            }
          }
        }

        if (posts.length > 0) callback('update', posts);
      }
    }, (error) => {
      console.error("[postService] Lỗi subscribe feed:", error);
    });
  },

  /** Lấy danh sách bài viết của người dùng cụ thể */
  getUserPosts: async (userId: string, currentUserId: string, friendIds: string[], limitCount: number = PAGINATION.USER_POSTS, lastDoc?: DocumentSnapshot): Promise<{ posts: Post[], lastDoc: DocumentSnapshot | null }> => {
    try {
      if (!currentUserId) {
        return { posts: [], lastDoc: null };
      }

      const isOwner = userId === currentUserId;
      const isFriend = friendIds?.includes(userId) || false;
      const visibilityFilter = getVisibilityFilter(isOwner, isFriend);
      if (visibilityFilter.length === 0) {
        return { posts: [], lastDoc: null };
      }

      let q = query(
        collection(db, 'posts'),
        where('authorId', '==', userId),
        where('status', '==', PostStatus.ACTIVE),
        where('visibility', 'in', visibilityFilter),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const user = await userService.getUserById(userId);
      if (user?.status === 'banned') {
        return { posts: [], lastDoc: null };
      }

      if (userId !== currentUserId) {
        const blockSnap = await getDoc(doc(db, 'users', userId, 'blockedUsers', currentUserId));
        if (blockSnap.exists() && blockSnap.data().blockViewMyActivity === true) {
          return { posts: [], lastDoc: null };
        }

        const myBlockSnap = await getDoc(doc(db, 'users', currentUserId, 'blockedUsers', userId));
        if (myBlockSnap.exists() && myBlockSnap.data().hideTheirActivity === true) {
          return { posts: [], lastDoc: null };
        }
      }

      const querySnapshot = await getDocs(q);
      const posts = convertDocs<Post>(querySnapshot.docs);

      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;

      return { posts, lastDoc: lastVisible };
    } catch (error) {
      console.error("Lỗi lấy bài viết của user", error);
      return { posts: [], lastDoc: null };
    }
  },

  /** Theo dõi bài viết của người dùng thời gian thực */
  subscribeToUserPosts: (userId: string, currentUserId: string, friendIds: string[], callback: (posts: Post[]) => void, limitCount: number = PAGINATION.USER_POSTS) => {
    if (!currentUserId) {
      callback([]);
      return () => { };
    }

    const isOwner = userId === currentUserId;
    const isFriend = friendIds?.includes(userId) || false;
    const visibilityFilter = getVisibilityFilter(isOwner, isFriend);
    if (visibilityFilter.length === 0) {
      callback([]);
      return () => { };
    }

    const q = query(
      collection(db, 'posts'),
      where('authorId', '==', userId),
      where('status', '==', PostStatus.ACTIVE),
      where('visibility', 'in', visibilityFilter),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;

    const setup = async () => {
      const user = await userService.getUserById(userId);
      const currentUser = await userService.getUserById(currentUserId);
      if (isCancelled) return;

      if (user?.status === 'banned' || currentUser?.status === 'banned') {
        callback([]);
        return;
      }

      if (userId !== currentUserId) {
        const blockedByTarget = await getDoc(doc(db, 'users', userId, 'blockedUsers', currentUserId));
        const blockedByMe = await getDoc(doc(db, 'users', currentUserId, 'blockedUsers', userId));

        if ((blockedByTarget.exists() && blockedByTarget.data().blockViewMyActivity === true) ||
          (blockedByMe.exists() && blockedByMe.data().hideTheirActivity === true)) {
          callback([]);
          return;
        }
      }

      unsubscribe = onSnapshot(q, (snapshot) => {
        const posts = convertDocs<Post>(snapshot.docs);
        callback(posts);
      }, (error) => {
        if (error?.code === 'permission-denied') {
          callback([]);
          return;
        }
        console.error("Lỗi subscribe bài viết của user", error);
      });
    };

    setup();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  },

  /** Tạo bài viết mới */
  createPost: async (postData: Partial<Post> & { authorId: string, content?: string, media?: MediaObject[], visibility?: Visibility, type?: PostType }, predefinedId?: string): Promise<string> => {
    try {
      if (postData.content) {
        validatePostContent(postData.content);
      }

      const postRef = predefinedId ? doc(db, 'posts', predefinedId) : doc(collection(db, 'posts'));

      const dataToSave: any = {
        authorId: postData.authorId,
        type: postData.type || PostType.REGULAR,
        content: postData.content || '',
        status: PostStatus.ACTIVE,
        visibility: postData.visibility || Visibility.FRIENDS,
        commentCount: 0,
        createdAt: postData.createdAt || serverTimestamp(),
        updatedAt: postData.updatedAt || serverTimestamp()
      };

      if (postData.media && postData.media.length > 0) {
        dataToSave.media = postData.media;
      }

      await setDoc(postRef, dataToSave);
      return postRef.id;
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      console.error("Lỗi tạo bài viết", error);
      throw error;
    }
  },

  generatePostId: () => doc(collection(db, 'posts')).id,

  /** Cập nhật nội dung và thuộc tính bài viết */
  updatePost: async (postId: string, content: string, media: MediaObject[], visibility: Visibility): Promise<void> => {
    try {
      const postRef = doc(db, 'posts', postId);

      const oldSnap = await getDoc(postRef);
      if (oldSnap.exists()) {
        const old = oldSnap.data();
        const oldMediaUrls = (old.media || []).map((m: MediaObject) => m.url);
        const newMediaUrls = media.map(m => m.url);
        const removedUrls = oldMediaUrls.filter((u: string) => !newMediaUrls.includes(u));

        if (removedUrls.length > 0) {
          await deleteStorageFiles(removedUrls);
        }
      }

      await updateDoc(postRef, {
        content,
        media,
        visibility,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Lỗi cập nhật bài viết", error);
      throw error;
    }
  },

  /** Xóa bài viết bằng cách chuyển trạng thái sang DELETED */
  deletePost: async (postId: string, userId: string): Promise<void> => {
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, {
        status: PostStatus.DELETED,
        deletedAt: serverTimestamp(),
        deletedBy: userId,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Lỗi xóa bài viết", error);
      throw error;
    }
  },

  /** Tương tác cảm xúc với bài viết */
  reactToPost: async (postId: string, userId: string, reaction: string | ReactionType): Promise<void> => {
    try {
      const reactionRef = doc(db, 'posts', postId, 'reactions', userId);
      const snap = await getDoc(reactionRef);
      const current = snap.exists() ? snap.data().type : null;

      if (reaction === 'REMOVE' || current === reaction) {
        await deleteDoc(reactionRef);
      } else {
        const now = serverTimestamp();
        const reactionData: Partial<ReactionDoc> = {
          type: reaction as ReactionType,
          updatedAt: now as Timestamp
        };

        if (!snap.exists()) {
          reactionData.createdAt = now as Timestamp;
        }

        await setDoc(reactionRef, reactionData, { merge: true });
      }
    } catch (error) {
      console.error("Lỗi react bài viết", error);
      throw error;
    }
  },

  /** Lấy reaction của người dùng hiện tại tại bài viết */
  getMyReactionForPost: async (postId: string, userId: string): Promise<string | null> => {
    try {
      const snap = await getDoc(doc(db, 'posts', postId, 'reactions', userId));
      return snap.exists() ? snap.data().type : null;
    } catch {
      return null;
    }
  },


  /** Lấy thông tin bài viết theo ID kèm phân quyền (Admin bypass) */
  getPostById: async (postId: string, currentUserId: string, friendIds: string[], isAdmin: boolean = false): Promise<Post | null> => {
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) return null;

      const data = postSnap.data();

      if (isAdmin) {
        return convertDoc<Post>(postSnap);
      }

      if (data.status === PostStatus.DELETED) return null;

      const isOwner = data.authorId === currentUserId;
      const isFriend = friendIds?.includes(data.authorId) || false;

      if (data.visibility === Visibility.PRIVATE && !isOwner) {
        return null;
      }
      if (data.visibility === Visibility.FRIENDS && !isOwner && !isFriend) {
        return null;
      }

      return convertDoc<Post>(postSnap);
    } catch (error) {
      console.error("Lỗi lấy chi tiết bài viết", error);
      return null;
    }
  },

  /** Lấy thông tin bài viết cho Admin (không check quyền) */
  getPostByIdForAdmin: async (postId: string): Promise<Post | null> => {
    try {
      const postRef = doc(db, 'posts', postId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) return null;

      return convertDoc<Post>(postSnap);
    } catch (error) {
      console.error("Lỗi lấy chi tiết bài viết cho admin", error);
      return null;
    }
  },

  /** Tải lên phương tiện cho bài viết */
  uploadPostMedia: async (
    files: File[],
    userId: string,
    onProgress?: (progress: number, fileIndex: number, totalFiles: number) => void
  ): Promise<MediaObject[]> => {
    try {
      // Validate files
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          validateImageFile(file);
        } else if (file.type.startsWith('video/')) {
          validateVideoFile(file);
        } else {
          throw new FileValidationError('File phải là ảnh hoặc video');
        }
      }

      const media: MediaObject[] = [];
      const totalFiles = files.length;

      for (let i = 0; i < totalFiles; i++) {
        let file = files[i];
        const isVideo = file.type.startsWith('video/');
        const typeFolder = isVideo ? 'videos' : 'images';
        const createdAt = Date.now();
        const fileName = `${createdAt}_${file.name}`;
        const path = `posts/${userId}/${typeFolder}/${fileName}`;

        let thumbnailUrl: string | undefined = undefined;

        if (isImageFile(file)) {
          file = await compressImage(file, IMAGE_COMPRESSION.POST);
        } else if (isVideo) {
          // Trích xuất và upload thumbnail
          try {
            const thumbFile = await generateVideoThumbnail(file);
            const thumbPath = `thumbnails/${userId}/${createdAt}_${thumbFile.name}`;
            thumbnailUrl = await uploadWithProgress(thumbPath, thumbFile);
          } catch (e) {
            console.error("Lỗi tạo/up thumbnail:", e);
          }
        }

        const url = await withRetry(() =>
          uploadWithProgress(path, file, (progress) => {
            const fileProgress = progress.progress / 100;
            const overallProgress = ((i + fileProgress) / totalFiles) * 100;
            onProgress?.(overallProgress, i, totalFiles);
          })
        );

        const mediaObject: MediaObject = {
          url,
          fileName,
          mimeType: file.type,
          size: file.size,
          isSensitive: false
        };

        if (thumbnailUrl) {
          mediaObject.thumbnailUrl = thumbnailUrl;
        }

        media.push(mediaObject);
      }

      return media;
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      console.error("Lỗi upload media", error);
      throw error;
    }
  },

};

