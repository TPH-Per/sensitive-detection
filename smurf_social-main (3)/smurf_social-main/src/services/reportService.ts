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
import { validateImageFile, FileValidationError } from '../utils/fileValidation';

export const reportService = {
  /** Tải lên ảnh bằng chứng */
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
        validateImageFile(file);
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

  /** Tạo báo cáo vi phạm */
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

  /** Kiểm tra trạng thái đã báo cáo */
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
        where('targetId', '==', targetId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.some(doc => doc.data().status === ReportStatus.PENDING);
    } catch (error) {
      console.error("Lỗi kiểm tra báo cáo:", error);
      return false;
    }
  },

  /** Lấy báo cáo chờ xử lý */
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

  /** Lấy toàn bộ báo cáo */
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

  /** Theo dõi báo cáo thời gian thực */
  subscribeToReports: (
    callback: (reports: Report[]) => void,
    onError?: (error: any) => void,
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

    return onSnapshot(
      q,
      (snapshot) => {
        callback(convertDocs<Report>(snapshot.docs));
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  },

  /** Xử lý báo cáo (Admin) */
  resolveReport: async (
    reportId: string,
    resolution: string = 'Đã xử lý',
    action: 'delete_content' | 'warn_user' | 'ban_user' = 'delete_content'
  ): Promise<void> => {
    const fn = httpsCallable(functions, 'resolveReport');
    await fn({ reportId, resolution, action });
  },

  /** Từ chối báo cáo (Admin) */
  rejectReport: async (reportId: string): Promise<void> => {
    const fn = httpsCallable(functions, 'rejectReport');
    await fn({ reportId });
  },

  /** Thống kê báo cáo (Admin) */
  getAdminStats: async (): Promise<{ pending: number, resolved: number, rejected: number }> => {
    try {
      const reportsRef = collection(db, 'reports');
      const [pendingSnap, resolvedSnap, rejectedSnap] = await Promise.all([
        getCountFromServer(query(reportsRef, where('status', '==', ReportStatus.PENDING))),
        getCountFromServer(query(reportsRef, where('status', '==', ReportStatus.RESOLVED))),
        getCountFromServer(query(reportsRef, where('status', '==', ReportStatus.REJECTED)))
      ]);

      return {
        pending: pendingSnap.data().count,
        resolved: resolvedSnap.data().count,
        rejected: rejectedSnap.data().count
      };
    } catch (error) {
      console.error("Lỗi lấy thống kê báo cáo admin:", error);
      return { pending: 0, resolved: 0, rejected: 0 };
    }
  },

  /** Đếm số báo cáo đang chờ */
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

  /** Lấy chi tiết báo cáo theo ID */
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
