import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Report, ReportStatus, ReportType, User } from '../types';
import { reportService } from '../services/reportService';
import { useAuthStore } from '../store/authStore';
import { useUserCache } from '../store/userCacheStore';
import { useLoadingStore } from '../store/loadingStore';
import { toast } from '../store/toastStore';
import { PAGINATION, TOAST_MESSAGES } from '../constants';

interface Stats {
  pending: number;
  resolved: number;
  rejected: number;
}

/**
 * Hook quản lý báo cáo (admin)
 */
export function useAdminReports() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { users: userCache, fetchUsers } = useUserCache();

  const [reports, setReports] = useState<Report[]>([]);
  const setLoading = useLoadingStore(state => state.setLoading);
  const isLoading = useLoadingStore(state => state.loadingStates['admin.reports']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'pending'>('pending');
  const [typeFilter, setTypeFilter] = useState<ReportType | 'all'>('all');
  const [stats, setStats] = useState<Stats>({ pending: 0, resolved: 0, rejected: 0 });
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionType, setActionType] = useState<'resolve' | 'reject' | null>(null);

  // Chặn truy cập phi admin
  useEffect(() => {
    if (user && !user.id) {
      toast.error(TOAST_MESSAGES.ADMIN.NO_PERMISSION);
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;

    setLoading('admin.reports', true);

    try {
      const unsubscribe = reportService.subscribeToReports(
        (allReports) => {
          // Tính stats từ tất cả reports
          setStats({
            pending: allReports.filter(r => r.status === ReportStatus.PENDING).length,
            resolved: allReports.filter(r => r.status === ReportStatus.RESOLVED).length,
            rejected: allReports.filter(r => r.status === ReportStatus.REJECTED).length
          });

          // Lọc theo status filter
          let filtered = statusFilter === 'pending'
            ? allReports.filter(r => r.status === ReportStatus.PENDING)
            : allReports.filter(r => r.status === statusFilter);

          // Lọc theo type filter
          if (typeFilter !== 'all') {
            filtered = filtered.filter(r => r.targetType === typeFilter);
          }

          setReports(filtered);
          setLoading('admin.reports', false);

          // Fetch user info từ cache
          const userIds = [...new Set([
            ...filtered.map(r => r.reporterId),
            ...filtered.map(r => r.targetOwnerId)
          ])];
          fetchUsers(userIds);
        },
        undefined,
        PAGINATION.ADMIN_REPORTS
      );

      return () => unsubscribe();
    } catch (error) {
      console.error('Lỗi subscription reports:', error);
      setLoading('admin.reports', false);
      toast.error(TOAST_MESSAGES.REPORT.LOAD_FAILED);
    }
  }, [user, statusFilter, typeFilter, fetchUsers]);

  // Lấy user info từ cache
  const getUser = useCallback((id: string): User | undefined => {
    return userCache[id];
  }, [userCache]);

  // Xử lý action (resolve/reject)
  const handleAction = useCallback(async () => {
    if (!selectedReport || !actionType || !user) return;

    setIsProcessing(true);
    try {
      if (actionType === 'resolve') {
        await reportService.resolveReport(selectedReport.id);
        toast.success(TOAST_MESSAGES.REPORT.REPORT_RESOLVED_SUCCESS);
      } else {
        await reportService.rejectReport(selectedReport.id);
        toast.success(TOAST_MESSAGES.REPORT.REPORT_REJECTED_SUCCESS);
      }
    } catch (error) {
      toast.error(TOAST_MESSAGES.REPORT.PROCESS_FAILED);
    } finally {
      setIsProcessing(false);
      setSelectedReport(null);
      setActionType(null);
    }
  }, [selectedReport, actionType, user]);

  // Open confirm dialog
  const openConfirmDialog = useCallback((report: Report, action: 'resolve' | 'reject') => {
    setSelectedReport(report);
    setActionType(action);
  }, []);

  // Close confirm dialog
  const closeConfirmDialog = useCallback(() => {
    setSelectedReport(null);
    setActionType(null);
  }, []);

  return {
    // State
    reports,
    stats,
    isLoading,
    isProcessing,
    statusFilter,
    typeFilter,
    selectedReport,
    actionType,
    isAdmin: !!user,

    // Actions
    setStatusFilter,
    setTypeFilter,
    getUser,
    handleAction,
    openConfirmDialog,
    closeConfirmDialog
  };
}
