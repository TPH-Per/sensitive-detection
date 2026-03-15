import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  limit,
  startAfter,
  DocumentSnapshot,
  getCountFromServer,
  Timestamp,
  serverTimestamp,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { User, MediaObject, UserRole, UserStatus, BlockOptions, BlockedUserEntry, UserSettings, Visibility, PostType } from '../../shared/types';
import { postService } from './postService';
import { SOCIAL_MESSAGES } from '../constants/socialMessages';
import { batchGetUsers } from '../utils/batchUtils';
import { compressImage } from '../utils/imageUtils';
import { withRetry } from '../utils/retryUtils';
import { uploadWithProgress, ProgressCallback, deleteStorageFile } from '../utils/uploadUtils';
import { PAGINATION, IMAGE_COMPRESSION } from '../constants';
import { convertDoc } from '../utils/firebaseUtils';
import {
  validateUserName,
  validateBio,
  validateAvatarFile,
  validateCoverFile,
  FileValidationError
} from '../utils/fileValidation';

// Xử lý document thành đối tượng User
const userConverter = (doc: DocumentSnapshot) => convertDoc<User>(doc);

export const userService = {
  // Lấy thông tin user
  getUserById: async (id: string): Promise<User | undefined> => {
    try {
      const userDoc = await getDoc(doc(db, 'users', id));
      if (userDoc.exists()) {
        return userConverter(userDoc);
      }
      return undefined;
    } catch (error) {
      console.error("Lỗi lấy thông tin user", error);
      return undefined;
    }
  },



  searchUsers: async (searchTerm: string, currentUserId: string): Promise<User[]> => {
    try {
      const fn = httpsCallable<{ searchTerm: string; currentUserId: string }, { users: User[] }>(functions, 'searchUsers');
      const result = await fn({ searchTerm, currentUserId });
      return result.data.users;
    } catch (error) {
      console.error("Lỗi tìm kiếm người dùng", error);
      return [];
    }
  },

  // Cập nhật hồ sơ
  updateProfile: async (userId: string, data: Partial<User>): Promise<User> => {
    try {
      if (data.fullName !== undefined) {
        validateUserName(data.fullName);
      }
      if (data.bio !== undefined) {
        validateBio(data.bio);
      }

      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
      return { ...data, id: userId } as User;
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      console.error("Lỗi cập nhật profile", error);
      throw error;
    }
  },

  // Khởi tạo document người dùng khi đăng ký mới
  createUserDocument: async (userId: string, data: Partial<User>): Promise<void> => {
    try {
      const batch = writeBatch(db);

      const userRef = doc(db, 'users', userId);
      batch.set(userRef, {
        fullName: data.fullName || '',
        email: data.email || '',
        avatar: data.avatar || { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false },
        cover: { url: '', fileName: '', mimeType: '', size: 0, isSensitive: false },
        status: UserStatus.ACTIVE,
        role: UserRole.USER,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const settingsRef = doc(db, 'users', userId, 'private', 'settings');
      batch.set(settingsRef, {
        showOnlineStatus: true,
        showReadReceipts: true,
        defaultPostVisibility: Visibility.PUBLIC,
        updatedAt: serverTimestamp()
      });

      await batch.commit();
    } catch (error) {
      console.error("Lỗi khởi tạo document user", error);
      throw error;
    }
  },

  // Helper nội bộ để upload media cho profile (Avatar/Cover)
  uploadProfileMedia: async (
    userId: string,
    file: File,
    type: 'avatar' | 'cover',
    shareToFeed: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<MediaObject> => {
    try {
      // Validate file
      if (type === 'avatar') {
        validateAvatarFile(file);
      } else {
        validateCoverFile(file);
      }

      const compressionType = type === 'avatar' ? IMAGE_COMPRESSION.AVATAR : IMAGE_COMPRESSION.COVER;
      const compressedFile = await compressImage(file, compressionType);

      const fileExt = file.name.split('.').pop();
      const prefix = type === 'avatar' ? 'avatar' : 'cover';
      const folder = type === 'avatar' ? 'avatars' : 'covers';
      const fileName = `${prefix}_${userId}_${Date.now()}.${fileExt}`;
      const path = `${folder}/${userId}/${fileName}`;

      const currentUser = await userService.getUserById(userId);
      const oldUrl = type === 'avatar' ? currentUser?.avatar?.url : currentUser?.cover?.url;

      const downloadURL = await withRetry(() =>
        uploadWithProgress(path, compressedFile, onProgress)
      );

      const mediaObject: MediaObject = {
        url: downloadURL,
        fileName,
        mimeType: file.type,
        size: compressedFile.size,
        isSensitive: false,
      };

      // Cập nhật profile
      await userService.updateProfile(userId, { [type]: mediaObject });

      // Tự động tạo bài viết nếu được yêu cầu
      if (shareToFeed && currentUser) {
        const settings = await userService.getUserSettings(userId);
        await postService.createPost({
          authorId: userId,
          type: type === 'avatar' ? PostType.AVATAR_UPDATE : PostType.COVER_UPDATE,
          content: SOCIAL_MESSAGES[type === 'avatar' ? 'UPDATE_AVATAR' : 'UPDATE_COVER'],
          media: [mediaObject],
          visibility: settings.defaultPostVisibility,
          updatedAt: serverTimestamp() as any
        });
      }

      if (oldUrl) await deleteStorageFile(oldUrl);

      return mediaObject;
    } catch (error) {
      if (error instanceof FileValidationError) {
        throw error;
      }
      console.error(`Lỗi upload ${type}`, error);
      throw error;
    }
  },

  // Tải lên ảnh đại diện
  uploadAvatar: async (
    userId: string,
    file: File,
    shareToFeed: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<MediaObject> => {
    return userService.uploadProfileMedia(userId, file, 'avatar', shareToFeed, onProgress);
  },

  // Tải lên ảnh bìa
  uploadCoverImage: async (
    userId: string,
    file: File,
    shareToFeed: boolean = false,
    onProgress?: ProgressCallback
  ): Promise<MediaObject> => {
    return userService.uploadProfileMedia(userId, file, 'cover', shareToFeed, onProgress);
  },



  // Danh sách user bị chặn
  getBlockedUsers: async (userId: string): Promise<Record<string, BlockedUserEntry>> => {
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'blockedUsers'));
      const result: Record<string, BlockedUserEntry> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        result[d.id] = {
          blockedUid: data.blockedUid,
          blockMessages: data.blockMessages ?? false,
          blockCalls: data.blockCalls ?? false,
          blockViewMyActivity: data.blockViewMyActivity ?? false,
          hideTheirActivity: data.hideTheirActivity ?? false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      return result;
    } catch {
      return {};
    }
  },

  // Chặn người dùng
  blockUser: async (userId: string, blockedUserId: string, options: BlockOptions): Promise<void> => {
    try {
      await setDoc(
        doc(db, 'users', userId, 'blockedUsers', blockedUserId),
        {
          blockedUid: blockedUserId,
          ...options,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Lỗi chặn người dùng', error);
      throw error;
    }
  },

  // Cập nhật từng options của block
  updateBlockOptions: async (userId: string, blockedUserId: string, options: Partial<BlockOptions>): Promise<void> => {
    try {
      await updateDoc(
        doc(db, 'users', userId, 'blockedUsers', blockedUserId),
        { ...options, updatedAt: serverTimestamp() }
      );
    } catch (error) {
      console.error('Lỗi cập nhật block options', error);
      throw error;
    }
  },

  // Bỏ chặn — xóa document khỏi subcollection
  unblockUser: async (userId: string, blockedUserId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'users', userId, 'blockedUsers', blockedUserId));
    } catch (error) {
      console.error('Lỗi bỏ chặn người dùng', error);
      throw error;
    }
  },

  // Theo dõi user realtime
  subscribeToUser: (userId: string, callback: (user: User) => void): (() => void) => {
    const userRef = doc(db, 'users', userId);
    return onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(userConverter(snapshot));
      }
    });
  },

  // Danh sách user cho Admin
  getAdminUsers: async (
    limitCount: number = PAGINATION.ADMIN_USERS,
    lastVisibleDoc?: DocumentSnapshot
  ): Promise<{ users: User[], lastDoc: DocumentSnapshot | null }> => {
    try {
      const usersRef = collection(db, 'users');
      let q = query(
        usersRef,
        limit(limitCount)
      );

      if (lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
      }

      const snapshot = await getDocs(q);
      const users = snapshot.docs.map(doc => userConverter(doc));

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      return { users, lastDoc };
    } catch (error) {
      console.error("Lỗi lấy danh sách admin users", error);
      throw error;
    }
  },

  // Thống kê cho Admin
  getAdminStats: async (): Promise<{ total: number, active: number, banned: number }> => {
    try {
      const usersRef = collection(db, 'users');
      // 2 count queries song song thay vì tải toàn bộ docs
      const [totalSnap, bannedSnap] = await Promise.all([
        getCountFromServer(usersRef),
        getCountFromServer(query(usersRef, where('status', '==', 'banned')))
      ]);

      const total = totalSnap.data().count;
      const banned = bannedSnap.data().count;

      return { total, banned, active: total - banned };
    } catch (error) {
      console.error("Lỗi lấy thống kê admin", error);
      return { total: 0, active: 0, banned: 0 };
    }
  },

  // Theo dõi user cho Admin
  subscribeToAdminUsers: (
    limitCount: number = PAGINATION.ADMIN_USERS,
    callback: (users: User[]) => void,
    onError?: (error: Error) => void
  ): (() => void) => {
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      limit(limitCount)
    );

    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => userConverter(doc));
      callback(users);
    }, (error) => {
      if (onError) onError(error);
    });
  },

  /**
   * Lấy cài đặt người dùng từ sub-collection private/settings
   */
  getUserSettings: async (userId: string): Promise<UserSettings> => {
    try {
      const settingsDoc = await getDoc(doc(db, 'users', userId, 'private', 'settings'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          showOnlineStatus: data.showOnlineStatus ?? true,
          showReadReceipts: data.showReadReceipts ?? true,
          defaultPostVisibility: data.defaultPostVisibility || Visibility.PUBLIC,
          updatedAt: data.updatedAt as Timestamp
        } as UserSettings;
      }

      // Trả về mặc định nếu chưa có document
      return {
        showOnlineStatus: true,
        showReadReceipts: true,
        defaultPostVisibility: Visibility.PUBLIC,
        updatedAt: Timestamp.now()
      };
    } catch (error) {
      console.error("[userService] Lỗi getUserSettings:", error);
      throw error;
    }
  },

  /**
   * Cập nhật cài đặt người dùng
   */
  updateUserSettings: async (userId: string, settings: Partial<UserSettings>): Promise<void> => {
    try {
      const settingsRef = doc(db, 'users', userId, 'private', 'settings');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("[userService] Lỗi updateUserSettings:", error);
      throw error;
    }
  }
};
