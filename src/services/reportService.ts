import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  QueryConstraint,
  serverTimestamp
} from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Report, ReportType, ReportStatus, MediaObject } from '../../shared/types';
import { PAGINATION, IMAGE_COMPRESSION } from '../constants';
import { uploadWithProgress, ProgressCallback } from '../utils/uploadUtils';
import { compressImage } from '../utils/imageUtils';
import { convertDoc, convertDocs } from '../utils/firebaseUtils';

export const reportService = {
  /** Upload ảnh bằng chứng cho báo cáo (tối đa 5 ảnh) */
  uploadReportImages: async (
    files: File[],
    reporterId: string,
    onProgress?: ProgressCallback
  ): Promise<MediaObject[]> => {
    try {
      if (files.length > 5) {
        throw new Error('Tối đa 5 ảnh bằng chứng');
      }

      const uploadPromises = files.map(async (file, index) => {
        const compressedFile = await compressImage(file, IMAGE_COMPRESSION.POST);

        const fileExt = file.name.split('.').pop();
        const fileName = `report_${reporterId}_${Date.now()}_${index}.${fileExt}`;
        const path = `reports/${reporterId}/${fileName}`;

        const downloadURL = await uploadWithProgress(
          path,
          compressedFile,
          onProgress
        );

        const mediaObject: MediaObject = {
          url: downloadURL,
          fileName,
          mimeType: file.type,
          size: compressedFile.size,
          isSensitive: false,
        };

        return mediaObject;
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('Lỗi upload ảnh báo cáo:', error);
      throw error;
    }
  },

  /** Tạo báo cáo */
  createReport: async (data: Omit<Report, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<string> => {
    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );

      const docRef = await addDoc(collection(db, 'reports'), {
        ...cleanData,
        targetOwnerId: data.targetOwnerId,
        status: ReportStatus.PENDING,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return docRef.id;
    } catch (error) {
      console.error("Lỗi tạo báo cáo:", error);
      throw error;
    }
  },

  /** Kiểm tra user đã báo cáo nội dung này chưa */
  hasUserReported: async (
    reporterId: string,
    targetType: ReportType,
    targetId: string
  ): Promise<boolean> => {
    try {
      const q = query(
        collection(db, 'reports'),
        where('reporterId', '==', reporterId),
        where('targetType', '==', targetType),
        where('targetId', '==', targetId),
        limit(1)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error("Lỗi kiểm tra báo cáo:", error);
      return false;
    }
  },

  /** Lấy danh sách báo cáo chờ xử lý (Admin) */
  getPendingReports: async (limitCount: number = PAGINATION.ADMIN_REPORTS): Promise<Report[]> => {
    try {
      const q = query(
        collection(db, 'reports'),
        where('status', '==', ReportStatus.PENDING),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return convertDocs<Report>(snapshot.docs);
    } catch (error) {
      console.error("Lỗi lấy báo cáo:", error);
      return [];
    }
  },

  /** Lấy tất cả báo cáo (Admin) */
  getAllReports: async (limitCount: number = PAGINATION.ADMIN_REPORTS): Promise<Report[]> => {
    try {
      const q = query(
        collection(db, 'reports'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return convertDocs<Report>(snapshot.docs);
    } catch (error) {
      console.error("Lỗi lấy báo cáo:", error);
      return [];
    }
  },

  /** Lắng nghe thay đổi báo cáo theo thời gian thực */
  subscribeToReports: (
    callback: (reports: Report[]) => void,
    statusFilter?: ReportStatus,
    limitCount: number = PAGINATION.ADMIN_REPORTS
  ) => {
    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    ];

    if (statusFilter) {
      constraints.unshift(where('status', '==', statusFilter));
    }

    const q = query(collection(db, 'reports'), ...constraints);

    return onSnapshot(q, (snapshot) => {
      callback(convertDocs<Report>(snapshot.docs));
    });
  },

  /** Admin xử lý báo cáo qua Cloud Function (có auth check và token revoke) */
  resolveReport: async (
    reportId: string,
    resolution: string = 'Đã xử lý',
    action: 'delete_content' | 'warn_user' | 'ban_user' = 'delete_content'
  ): Promise<void> => {
    const fn = httpsCallable(functions, 'resolveReport');
    await fn({ reportId, resolution, action });
  },

  /** Admin từ chối báo cáo qua Cloud Function */
  rejectReport: async (reportId: string): Promise<void> => {
    const fn = httpsCallable(functions, 'rejectReport');
    await fn({ reportId });
  },

  // Đếm số báo cáo pending (cho badge)
  getPendingCount: async (): Promise<number> => {
    try {
      const q = query(
        collection(db, 'reports'),
        where('status', '==', ReportStatus.PENDING)
      );
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (error) {
      return 0;
    }
  },

  // Lấy báo cáo theo ID
  getReportById: async (reportId: string): Promise<Report | null> => {
    try {
      const reportSnap = await getDoc(doc(db, 'reports', reportId));
      if (!reportSnap.exists()) return null;
      return convertDoc<Report>(reportSnap);
    } catch (error) {
      console.error("Lỗi lấy báo cáo:", error);
      return null;
    }
  }
};
