import { create } from 'zustand';
import { ReportType, ReportReason, Report, MediaObject } from '../../shared/types';
import { reportService } from '../services/reportService';
import { userService } from '../services/userService';
import { useAuthStore } from './authStore';

interface ReportState {
  isOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  pendingCount: number;

  data: {
    type: ReportType | null;
    id: string | null;
    ownerId: string | null;
  };

  openReportModal: (type: ReportType, id: string, ownerId: string) => void;
  closeReportModal: () => void;
  submitReport: (
    reporterId: string,
    reason: ReportReason,
    description?: string,
    images?: MediaObject[],
    blockUser?: boolean
  ) => Promise<boolean>;
  reset: () => void;
  fetchPendingCount: () => Promise<void>;
}

const initialData = { type: null, id: null, ownerId: null };

export const useReportStore = create<ReportState>((set, get) => ({
  isOpen: false,
  isSubmitting: false,
  error: null,
  pendingCount: 0,
  data: initialData,

  openReportModal: (type, id, ownerId) => {
    set({
      isOpen: true,
      error: null,
      data: { type, id, ownerId }
    });
  },

  closeReportModal: () => {
    set({
      isOpen: false,
      error: null,
      data: initialData
    });
  },

  submitReport: async (reporterId, reason, description, images, blockUser = false) => {
    const { data } = get();
    const { type: targetType, id: targetId, ownerId: targetOwnerId } = data;

    if (!targetType || !targetId || !targetOwnerId) {
      set({ error: 'Thiếu thông tin báo cáo' });
      return false;
    }

    if (reporterId === targetOwnerId) {
      set({ error: 'Không thể báo cáo chính mình' });
      return false;
    }

    set({ isSubmitting: true, error: null });

    try {
      const hasReported = await reportService.hasUserReported(
        reporterId,
        targetType,
        targetId
      );

      if (hasReported) {
        if (blockUser && targetOwnerId) {
        const defaultBlockOptions = { 
          blockMessages: true, 
          blockCalls: true, 
          blockViewMyActivity: true, 
          hideTheirActivity: true 
        };
          await userService.blockUser(reporterId, targetOwnerId, defaultBlockOptions);
          useAuthStore.getState().updateBlockEntry('add', targetOwnerId, defaultBlockOptions);
          set({ isOpen: false, isSubmitting: false });
          return true;
        }
        set({ error: 'Bạn đã báo cáo nội dung này trước đó', isSubmitting: false });
        return false;
      }

      await reportService.createReport({
        reporterId,
        targetType,
        targetId,
        targetOwnerId,
        reason,
        description,
        images
      });

      if (blockUser && targetOwnerId) {
        const defaultBlockOptions = { 
          blockMessages: true, 
          blockCalls: true, 
          blockViewMyActivity: true, 
          hideTheirActivity: true 
        };
        await userService.blockUser(reporterId, targetOwnerId, defaultBlockOptions);
        useAuthStore.getState().updateBlockEntry('add', targetOwnerId, defaultBlockOptions);
      }

      set({ isOpen: false, isSubmitting: false });
      return true;
    } catch (error) {
      set({ error: 'Có lỗi xảy ra, vui lòng thử lại', isSubmitting: false });
      return false;
    }
  },

  reset: () => {
    set({
      isOpen: false,
      isSubmitting: false,
      error: null,
      data: initialData,
      pendingCount: 0
    });
  },

  fetchPendingCount: async () => {
    try {
      const count = await reportService.getPendingCount();
      set({ pendingCount: count });
    } catch (error) {
      console.error("Lỗi lấy số báo cáo:", error);
    }
  }
}));
