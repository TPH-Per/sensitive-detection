import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  Timestamp,
  serverTimestamp,
  limit,
  startAfter,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  DocumentData,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Comment, ReactionType, ReactionDoc, CommentStatus, MediaObject } from '../../shared/types'
import { PAGINATION, IMAGE_COMPRESSION } from '../constants';
import { batchGetUsers } from '../utils/batchUtils';
import { compressImage } from '../utils/imageUtils';
import { uploadWithProgress } from '../utils/uploadUtils';
import { withRetry } from '../utils/retryUtils';
import { convertDoc, convertDocs } from '../utils/firebaseUtils';
import {
  validateCommentContent,
  validateImageFile,
  FileValidationError
} from '../utils/fileValidation';

// Chuyển đổi document sang đối tượng Comment
const commentConverter = (doc: DocumentSnapshot | QueryDocumentSnapshot<DocumentData>) => convertDoc<Comment>(doc);

export const commentService = {
  generateCommentId: () => {
    return doc(collection(db, 'comments')).id;
  },

  /** Lấy danh sách bình luận gốc của bài viết */
  getRootComments: async (postId: string, blockedUserIds: string[] = [], limitCount: number = PAGINATION.COMMENTS, lastDoc?: DocumentSnapshot) => {
    try {
      let q = query(
        collection(db, 'comments'),
        where('postId', '==', postId),
        where('parentId', '==', null),
        where('status', '==', CommentStatus.ACTIVE),
        orderBy('createdAt', 'desc'),
        limit(limitCount + 1)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const hasMore = snapshot.docs.length > limitCount;
      const docsToProcess = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

      const authorIds = [...new Set(snapshot.docs.map(d => d.data().authorId))];
      const usersMap = await batchGetUsers(authorIds);

      const comments = convertDocs<Comment>(docsToProcess)
        .filter(c => !blockedUserIds.includes(c.authorId) && usersMap[c.authorId]?.status !== 'banned');

      return {
        comments,
        lastDoc: docsToProcess[docsToProcess.length - 1] || null,
        hasMore
      };
    } catch (error) {
      console.error("Lỗi lấy root comments:", error);
      throw error;
    }
  },

  /** Lấy danh sách phản hồi cho một bình luận */
  getReplies: async (postId: string, commentId: string, blockedUserIds: string[] = [], limitCount: number = PAGINATION.REPLIES, lastDoc?: DocumentSnapshot) => {
    try {
      let q = query(
        collection(db, 'comments'),
        where('postId', '==', postId),
        where('parentId', '==', commentId),
        where('status', '==', CommentStatus.ACTIVE),
        orderBy('createdAt', 'asc'),
        limit(limitCount + 1)
      );

      if (lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const hasMore = snapshot.docs.length > limitCount;
      const docsToProcess = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

      const authorIds = [...new Set(snapshot.docs.map(d => d.data().authorId))];
      const usersMap = await batchGetUsers(authorIds);

      const replies = convertDocs<Comment>(docsToProcess)
        .filter(c => !blockedUserIds.includes(c.authorId) && usersMap[c.authorId]?.status !== 'banned');

      return {
        replies,
        lastDoc: docsToProcess[docsToProcess.length - 1] || null,
        hasMore
      };
    } catch (error) {
      console.error("Lỗi lấy replies:", error);
      throw error;
    }
  },

  /** Tạo bình luận hoặc phản hồi mới */
  createComment: async (
    postId: string,
    userId: string,
    content: string,
    parentId: string | null = null,
    replyToUserId?: string,
    replyToId?: string,
    image?: MediaObject,
    preGeneratedId?: string
  ): Promise<string> => {
    try {
      validateCommentContent(content);
      const commentData: any = {
        postId,
        authorId: userId,
        content,
        parentId: parentId || null,
        replyToUserId: replyToUserId || null,
        replyToId: replyToId || null,
        status: CommentStatus.ACTIVE,
        replyCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (image) commentData.image = image;

      let docRefId = preGeneratedId;
      if (preGeneratedId) {
        await setDoc(doc(db, 'comments', preGeneratedId), commentData);
      } else {
        const docRef = await addDoc(collection(db, 'comments'), commentData);
        docRefId = docRef.id;
      }

      return docRefId!;
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      throw error;
    }
  },

  /** Xóa bình luận bài viết (soft-delete) */
  deleteComment: async (commentId: string, userId: string, parentId: string | null = null) => {
    try {
      const commentRef = doc(db, 'comments', commentId);
      
      await updateDoc(commentRef, {
        status: CommentStatus.DELETED,
        deletedAt: serverTimestamp(),
        deletedBy: userId,
        updatedAt: serverTimestamp()
      });

      if (!parentId) {
        const repliesQuery = query(
          collection(db, 'comments'),
          where('parentId', '==', commentId),
          where('status', '==', CommentStatus.ACTIVE)
        );
        const repliesSnapshot = await getDocs(repliesQuery);
        
        if (!repliesSnapshot.empty) {
          const deletePromises = repliesSnapshot.docs.map(d =>
            updateDoc(d.ref, {
              status: CommentStatus.DELETED,
              deletedAt: serverTimestamp(),
              deletedBy: userId,
              updatedAt: serverTimestamp()
            }).catch(err => console.error(`Lỗi xóa reply ${d.id}:`, err))
          );
          await Promise.all(deletePromises);
        }
      }
    } catch (error) {
      console.error("Lỗi xóa comment:", error);
      throw error;
    }
  },

  /** Sửa nội dung hoặc ảnh của bình luận */
  updateComment: async (commentId: string, content: string, image?: MediaObject | null) => {
    try {
      const commentRef = doc(db, 'comments', commentId);
      const updateData: any = {
        content,
        updatedAt: serverTimestamp()
      };
      if (image !== undefined) updateData.image = image;
      await updateDoc(commentRef, updateData);
    } catch (error) {
      console.error("Lỗi cập nhật comment:", error);
      throw error;
    }
  },

  /** Tương tác cảm xúc với bình luận */
  reactToComment: async (commentId: string, userId: string, reaction: string | ReactionType) => {
    try {
      const reactionRef = doc(db, 'comments', commentId, 'reactions', userId);
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
      console.error("Lỗi react comment:", error);
      throw error;
    }
  },

  /** Lấy reaction của người dùng hiện tại tại bình luận */
  getMyReactionForComment: async (commentId: string, userId: string): Promise<string | null> => {
    try {
      const snap = await getDoc(doc(db, 'comments', commentId, 'reactions', userId));
      return snap.exists() ? snap.data().type : null;
    } catch {
      return null;
    }
  },

  /** Tải hàng loạt reaction của người dùng cho danh sách bình luận */
  batchLoadMyReactionsForComments: async (commentIds: string[], userId: string): Promise<Record<string, string>> => {
    const results: Record<string, string> = {};
    await Promise.all(
      commentIds.map(async (commentId) => {
        const snap = await getDoc(doc(db, 'comments', commentId, 'reactions', userId));
        if (snap.exists()) results[commentId] = snap.data().type;
      })
    );
    return results;
  },

  /** Lấy thông tin bình luận chi tiết theo ID */
  getCommentById: async (commentId: string): Promise<Comment | null> => {
    try {
      const commentRef = doc(db, 'comments', commentId);
      const commentSnap = await getDoc(commentRef);

      if (!commentSnap.exists()) return null;

      const data = commentSnap.data();
      return {
        ...data,
        id: commentSnap.id,
        createdAt: data.createdAt as Timestamp,
      } as Comment;
    } catch (error) {
      console.error("Lỗi lấy comment:", error);
      return null;
    }
  },

  /** Theo dõi bình luận bài viết thời gian thực */
  subscribeToComments: (
    postId: string,
    blockedUserIds: string[] = [],
    callback: (action: 'initial' | 'add' | 'update' | 'remove', data: Comment[] | { comments: Comment[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }) => void,
    limitCount: number = PAGINATION.COMMENTS
  ) => {

    const rootQuery = query(
      collection(db, 'comments'),
      where('postId', '==', postId),
      where('parentId', '==', null),
      where('status', '==', CommentStatus.ACTIVE),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1)
    );

    let isInitialLoad = true;

    return onSnapshot(rootQuery, { includeMetadataChanges: true }, async (snapshot) => {
      if (snapshot.metadata.hasPendingWrites && isInitialLoad) return;

      const wasInitialLoad = isInitialLoad;
      isInitialLoad = false;

      const authorIds = [...new Set(snapshot.docs.map(d => d.data().authorId))];
      const usersMap = await batchGetUsers(authorIds);

      if (wasInitialLoad) {
        const hasMore = snapshot.docs.length > limitCount;
        const docsToProcess = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

        const comments = convertDocs<Comment>(docsToProcess)
          .filter(c => !blockedUserIds.includes(c.authorId) && usersMap[c.authorId]?.status !== 'banned');

        callback('initial', {
          comments,
          lastDoc: docsToProcess[docsToProcess.length - 1] || null,
          hasMore
        });
        return;
      }

      const changes = snapshot.docChanges();
      
      const changeDocs = changes
        .map(change => ({ change, comment: commentConverter(change.doc) }))
        .filter(({ comment }) => !blockedUserIds.includes(comment.authorId) && usersMap[comment.authorId]?.status !== 'banned');

      const added = changeDocs.filter(d => d.change.type === 'added').map(d => d.comment);
      const modified = changeDocs.filter(d => d.change.type === 'modified').map(d => d.comment);
      const removed = changeDocs.filter(d => d.change.type === 'removed').map(d => d.comment);

      if (added.length > 0) callback('add', added);
      if (modified.length > 0) callback('update', modified);
      if (removed.length > 0) callback('remove', removed);

    }, (error) => console.error("Lỗi subscribe comments:", error));
  },

  /** Theo dõi phản hồi bài viết thời gian thực */
  subscribeToReplies: (
    postId: string,
    parentId: string,
    blockedUserIds: string[] = [],
    callback: (action: 'initial' | 'add' | 'update' | 'remove', data: Comment[] | { replies: Comment[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }) => void,
    limitCount: number = PAGINATION.REPLIES
  ) => {
    const q = query(
      collection(db, 'comments'),
      where('postId', '==', postId),
      where('parentId', '==', parentId),
      where('status', '==', CommentStatus.ACTIVE),
      orderBy('createdAt', 'asc'),
      limit(limitCount + 1)
    );

    let isInitialLoad = true;

    return onSnapshot(q, { includeMetadataChanges: true }, async (snapshot) => {
      if (snapshot.metadata.hasPendingWrites && isInitialLoad) return;

      const wasInitialLoad = isInitialLoad;
      isInitialLoad = false;

      const authorIds = [...new Set(snapshot.docs.map(d => d.data().authorId))];
      const usersMap = await batchGetUsers(authorIds);

      if (wasInitialLoad) {
        const hasMore = snapshot.docs.length > limitCount;
        const docsToProcess = hasMore ? snapshot.docs.slice(0, limitCount) : snapshot.docs;

        const replies = docsToProcess
          .map(commentConverter)
          .filter(c => !blockedUserIds.includes(c.authorId) && usersMap[c.authorId]?.status !== 'banned');

        callback('initial', {
          replies,
          lastDoc: docsToProcess[docsToProcess.length - 1] || null,
          hasMore
        });
        return;
      }

      snapshot.docChanges().forEach(change => {
        const reply = commentConverter(change.doc);
        if (blockedUserIds.includes(reply.authorId)) return;

        if (change.type === 'added') {
          callback('add', [reply]);
        } else if (change.type === 'modified') {
          callback('update', [reply]);
        } else if (change.type === 'removed') {
          callback('remove', [reply]);
        }
      });
    }, (error) => console.error("Lỗi subscribe replies:", error));
  },

  /** Tải lên ảnh cho bình luận và trả về MediaObject */
  uploadCommentImage: async (
    file: File,
    userId: string,
    onProgress?: (progress: number) => void
  ): Promise<MediaObject> => {
    try {
      // Validate image
      validateImageFile(file);

      const compressedFile = await compressImage(file, IMAGE_COMPRESSION.COMMENT);

      const createdAt = Date.now();
      const fileName = `comment_img_${createdAt}_${file.name}`;
      const path = `comments/${userId}/images/${fileName}`;

      const url = await withRetry(() => uploadWithProgress(path, compressedFile, (p) => {
        onProgress?.(p.progress);
      }));

      return {
        url,
        fileName,
        mimeType: file.type,
        size: compressedFile.size,
        isSensitive: false,
      };
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      console.error("Lỗi upload ảnh comment:", error);
      throw error;
    }
  }
};


