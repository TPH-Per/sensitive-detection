import { doc, setDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Post, PostStatus, Visibility, PostType, MediaObject } from '../../shared/types';

/** Dịch vụ tạo bài viết hệ thống */
export const systemPostService = {
  /** Tạo bài viết cập nhật hồ sơ */
  createProfileUpdatePost: async (params: {
    userId: string;
    type: PostType.AVATAR_UPDATE | PostType.COVER_UPDATE;
    media: MediaObject[];
    visibility: Visibility;
  }): Promise<string> => {
    try {
      const postRef = doc(collection(db, 'posts'));
      
      const dataToSave: Partial<Post> = {
        authorId: params.userId,
        type: params.type,
        content: '', 
        status: PostStatus.ACTIVE,
        visibility: params.visibility,
        media: params.media,
        commentCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(postRef, dataToSave);
      return postRef.id;
    } catch (error) {
      console.error("[systemPostService] Lỗi tạo bài viết hệ thống:", error);
      throw error;
    }
  }
};
