import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, Flag, Clock, AlertTriangle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { userService } from '../../services/userService';
import { reportService } from '../../services/reportService';
import { Report, User, ReportStatus } from '../../../shared/types';
import { useAuthStore } from '../../store/authStore';
import { Skeleton, UserAvatar } from '../ui';
import { formatRelativeTime } from '../../utils/dateUtils';
import { REPORT_CONFIG } from '../../constants';
import { useUserCache } from '../../store/userCacheStore';

const StatCard: React.FC<{ label: string; value: number | string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-bg-primary p-4 rounded-2xl border border-border-light flex items-center justify-between transition-all hover:border-primary/30 hover:shadow-sm">
    <div className="flex flex-col">
      <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">{label}</span>
      <span className={`text-2xl font-black ${color}`}>{value}</span>
    </div>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.replace('text-', 'bg-').replace('primary', 'primary/10').replace('error', 'error/10').replace('success', 'success/10').replace('warning', 'warning/10')}`}>
      {icon}
    </div>
  </div>
);

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { getUser, fetchUsers } = useUserCache();

  const [isLoading, setIsLoading] = useState(true);
  const [userStats, setUserStats] = useState({ total: 0, active: 0, banned: 0 });
  const [reportStats, setReportStats] = useState({ pending: 0, resolved: 0, rejected: 0 });
  const [recentReports, setRecentReports] = useState<Report[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const [uStats, rStats, pendingReps] = await Promise.all([
          userService.getAdminStats(),
          reportService.getAdminStats(),
          reportService.getPendingReports(4)
        ]);

        if (isMounted) {
          setUserStats(uStats);
          setReportStats(rStats);
          setRecentReports(pendingReps);

          // Fetch reporters cache
          const userIds = [...new Set(pendingReps.map(r => r.reporterId))];
          if (userIds.length > 0) {
            fetchUsers(userIds);
          }
        }
      } catch (error) {
        console.error("Lỗi lấy dữ liệu Dashboard", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchDashboardData();
    return () => { isMounted = false; };
  }, [fetchUsers]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-bg-primary px-4 md:px-6 py-5 border-b border-border-light flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-text-primary flex items-center gap-2">
              <LayoutDashboard size={18} className="text-primary" />
              Tổng quan hệ thống
            </h1>
            <p className="text-xs text-text-tertiary mt-1">
              Xin chào {user?.fullName}.
            </p>
          </div>
        </div>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto scroll-hide p-4 md:p-6 bg-bg-secondary/30">
        <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
          
          {/* User Metrics */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Users size={16} /> Thống kê người dùng
              </h2>
              <button 
                onClick={() => navigate('/admin/users')}
                className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                Quản lý chi tiết <ChevronRight size={14} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                </>
              ) : (
                <>
                  <StatCard label="Tổng tài khoản" value={userStats.total} color="text-primary" icon={<Users size={20} className="text-primary"/>} />
                  <StatCard label="Đang hoạt động" value={userStats.active} color="text-success" icon={<Users size={20} className="text-success"/>} />
                  <StatCard label="Bị khóa" value={userStats.banned} color="text-error" icon={<AlertTriangle size={20} className="text-error" />} />
                </>
              )}
            </div>
          </section>

          {/* Report Metrics */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <Flag size={16} /> Tình trạng báo cáo
              </h2>
              <button 
                onClick={() => navigate('/admin/reports')}
                className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              >
                Tất cả báo cáo <ChevronRight size={14} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                  <Skeleton className="h-[88px] rounded-2xl w-full" />
                </>
              ) : (
                <>
                  <StatCard label="Cần xử lý" value={reportStats.pending} color="text-warning" icon={<Clock size={20} className="text-warning"/>} />
                  <StatCard label="Đã xử lý" value={reportStats.resolved} color="text-success" icon={<Flag size={20} className="text-success"/>} />
                  <StatCard label="Bị từ chối" value={reportStats.rejected} color="text-error" icon={<AlertTriangle size={20} className="text-error"/>} />
                </>
              )}
            </div>
          </section>

          {/* Recent Pending Reports */}
          <section>
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2 mb-3">
              <Clock size={16} /> Báo cáo mới nhất chờ xử lý
            </h2>

            <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recentReports.length === 0 ? (
                <div className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-success/10 rounded-full flex items-center justify-center mb-3">
                    <Flag size={20} className="text-success" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">Tuyệt vời!</p>
                  <p className="text-xs text-text-tertiary">Hiện tại không có báo cáo nào đang chờ xử lý.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-light">
                  {recentReports.map(report => {
                     const reporter = getUser(report.reporterId);
                     const reasonConfig = REPORT_CONFIG.REASONS[report.reason as keyof typeof REPORT_CONFIG.REASONS];
                     return (
                       <button
                         key={report.id}
                         onClick={() => navigate(`/admin/reports`)}
                         className="w-full text-left p-4 hover:bg-bg-secondary transition-colors group flex flex-col md:flex-row gap-3 md:items-center justify-between"
                       >
                         {/* Left Info */}
                         <div className="flex flex-col gap-1 min-w-0">
                           <p className="text-sm font-semibold text-text-primary flex items-center gap-1.5 truncate">
                             <AlertTriangle size={14} className="text-error flex-shrink-0" />
                             {reasonConfig?.label || 'Vi phạm'}
                           </p>
                           <div className="flex items-center gap-2 text-xs text-text-tertiary truncate">
                              <UserAvatar size="xs" userId={report.reporterId} />
                              <span className="truncate max-w-[120px]">{reporter?.fullName || 'Người dùng'}</span>
                              <span>•</span>
                              <span>{formatRelativeTime(report.createdAt)}</span>
                           </div>
                         </div>
                         <div className="hidden md:flex flex-shrink-0">
                            <span className="text-xs font-bold bg-warning/10 text-warning px-2.5 py-1 rounded-lg">
                              Pending
                            </span>
                         </div>
                       </button>
                     );
                  })}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
};
