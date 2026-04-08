import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Report, ReportStatus, ReportType, User, UserRole } from '../../shared/types';
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
    if (user && user.role !== UserRole.ADMIN) {
      toast.error(TOAST_MESSAGES.ADMIN.NO_PERMISSION);
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user || user.role !== UserRole.ADMIN) return;

    setLoading('admin.reports', true);
    let unsubscribeFn: (() => void) | undefined;

    try {
      unsubscribeFn = reportService.subscribeToReports(
        (allReports) => {
          const filteredStats = typeFilter === 'all'
            ? allReports
            : allReports.filter(r => r.targetType === typeFilter);

          setStats({
            pending: filteredStats.filter(r => r.status === ReportStatus.PENDING).length,
            resolved: filteredStats.filter(r => r.status === ReportStatus.RESOLVED).length,
            rejected: filteredStats.filter(r => r.status === ReportStatus.REJECTED).length,
          });

          let filtered = statusFilter === 'pending'
            ? allReports.filter(r => r.status === ReportStatus.PENDING)
            : allReports.filter(r => r.status === statusFilter);

          if (typeFilter !== 'all') {
            filtered = filtered.filter(r => r.targetType === typeFilter);
          }

          setReports(filtered);
          setLoading('admin.reports', false);

          const userIds = [...new Set([
            ...filtered.map(r => r.reporterId),
            ...filtered.map(r => r.targetOwnerId)
          ])];
          fetchUsers(userIds);
        },
        (error: any) => {
          console.error('[useAdminReports] Subscription error:', error);
          setLoading('admin.reports', false);
          if (error.code === 'permission-denied') {
            toast.error("Bạn không có quyền truy cập dữ liệu quản trị.");
          } else {
            toast.error(TOAST_MESSAGES.REPORT.LOAD_FAILED);
          }
        },
        undefined,
        500
      );
    } catch (error) {
      console.error('[useAdminReports] Setup error:', error);
      setLoading('admin.reports', false);
      toast.error(TOAST_MESSAGES.REPORT.LOAD_FAILED);
    }

    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
        unsubscribeFn = undefined;
      }
      setLoading('admin.reports', false);
    };
  }, [user, statusFilter, typeFilter, fetchUsers, setLoading]);

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
