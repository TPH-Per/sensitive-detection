import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { FILE_LIMITS, FileLimitType, TOAST_MESSAGES } from '../constants';

// Kiểm tra dung lượng và loại file hợp lệ
export const validateFile = (file: File, type: FileLimitType): { isValid: boolean; error?: string } => {
  const limit = FILE_LIMITS[type];
  
  // 1. Kiểm tra loại file (MIME type)
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  
  if (type === 'IMAGE' || type === 'AVATAR' || type === 'COVER') {
    if (!isImage) {
      return {
        isValid: false,
        error: TOAST_MESSAGES.MEDIA.INVALID_FILE
      };
    }
  } else if (type === 'VIDEO') {
    if (!isVideo) {
      return {
        isValid: false,
        error: 'Chỉ hỗ trợ định dạng file video'
      };
    }
  }

  // 2. Kiểm tra dung lượng
  if (file.size > limit) {
    const mbLimit = limit / (1024 * 1024);
    const labels: Record<string, string> = { IMAGE: 'Ảnh', AVATAR: 'Ảnh đại diện', COVER: 'Ảnh bìa', FILE: 'File', VIDEO: 'Video' };
    const typeLabel = labels[type] || 'File';
      
    return {
      isValid: false,
      error: TOAST_MESSAGES.MEDIA.FILE_TOO_LARGE(mbLimit, typeLabel)
    };
  }
  return { isValid: true };
};

// Duy trì alias cho tương thích ngược
export const validateFileSize = validateFile;


export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  state: "running" | "paused" | "success" | "error" | "canceled";
}

export type ProgressCallback = (progress: UploadProgress) => void;

export const uploadWithProgress = (
  path: string,
  file: File,
  onProgress?: ProgressCallback,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.({
          progress,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          state: snapshot.state as UploadProgress['state'],
        });
      },
      (error) => {
        reject(new Error(`Lỗi tải lên Firebase Storage: ${error.message}`));
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          onProgress?.({
            progress: 100,
            bytesTransferred: file.size,
            totalBytes: file.size,
            state: 'success',
          });
          resolve(downloadURL);
        } catch (error) {
          reject(new Error('Không lấy được URL sau khi tải lên'));
        }
      }
    );
  });
};

// Xóa file trên Storage theo URL (bỏ qua URL không phải Firebase)
export const deleteStorageFile = async (url: string): Promise<void> => {
  if (!url || !url.includes('firebasestorage.googleapis.com')) return;
  try {
    const { ref: storageRef, deleteObject } = await import('firebase/storage');
    const path = decodeURIComponent(new URL(url).pathname.split('/o/')[1]?.split('?')[0] ?? '');
    if (!path) return;
    const fileRef = storageRef(storage, path);
    await deleteObject(fileRef);
  } catch (error) {
    // Log để debug — không throw để tránh crash flow chính
    console.error('[Storage] Xóa file thất bại:', url, error);
  }
};

// Xóa nhiều file cùng lúc
export const deleteStorageFiles = (urls: string[]): Promise<void[]> =>
  Promise.all(urls.filter(Boolean).map(deleteStorageFile));

// Định dạng bytes thành chuỗi dễ đọc
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Trích xuất thumbnail từ Video bằng Canvas ở phía Client
export const generateVideoThumbnail = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.autoplay = false;
    video.muted = true;
    
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            const thumbnailFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_thumb.jpg", { type: 'image/jpeg' });
            resolve(thumbnailFile);
          } else {
            reject(new Error("Could not create thumbnail blob"));
          }
        }, 'image/jpeg', 0.8);
      } else {
        URL.revokeObjectURL(url);
        reject(new Error("Could not get canvas context"));
      }
    };

    video.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Error loading video to generate thumbnail"));
    };
  });
};
