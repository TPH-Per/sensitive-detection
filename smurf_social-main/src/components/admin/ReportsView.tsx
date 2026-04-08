import React, { useCallback } from 'react';
import { Flag, Clock, CheckCircle, XCircle, AlertTriangle, FileText, MessageSquare, User as UserIcon } from 'lucide-react';
import { ReportStatus, ReportType } from '../../../shared/types';
import { UserAvatar, Skeleton, Select } from '../ui';
import { REPORT_CONFIG } from '../../constants';
import { formatRelativeTime } from '../../utils/dateUtils';
import { useAdminReports } from '../../hooks/useAdminReports';

interface ReportsViewProps {
  onSelectReport: (reportId: string) => void;
}

const STATUS_TABS: { label: string; value: ReportStatus | 'pending' }[] = [
  { label: 'Chờ xử lý', value: 'pending' },
  { label: 'Đã xử lý', value: ReportStatus.RESOLVED },
  { label: 'Từ chối', value: ReportStatus.REJECTED },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tất cả loại' },
  { value: ReportType.POST, label: 'Bài viết' },
  { value: ReportType.COMMENT, label: 'Bình luận' },
  { value: ReportType.USER, label: 'Người dùng' },
];

const STATUS_BADGE: Record<ReportStatus, React.ReactNode> = {
  [ReportStatus.PENDING]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning uppercase">
      <Clock size={9} /> Chờ xử lý
    </span>
  ),
  [ReportStatus.RESOLVED]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success uppercase">
      <CheckCircle size={9} /> Đã xử lý
    </span>
  ),
  [ReportStatus.REJECTED]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-tertiary text-text-secondary uppercase">
      <XCircle size={9} /> Từ chối
    </span>
  ),
};

const TYPE_BADGE: Record<ReportType, React.ReactNode> = {
  [ReportType.POST]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-info/10 text-info uppercase">
      <FileText size={9} /> Bài viết
    </span>
  ),
  [ReportType.COMMENT]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning uppercase">
      <MessageSquare size={9} /> Bình luận
    </span>
  ),
  [ReportType.USER]: (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/10 text-error uppercase">
      <UserIcon size={9} /> Người dùng
    </span>
  ),
};

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="bg-bg-secondary/60 px-4 py-2.5 rounded-xl border border-border-light flex flex-col items-center min-w-[90px]">
    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{label}</span>
    <span className={`text-xl font-black ${color}`}>{value}</span>
  </div>
);

export const ReportsView: React.FC<ReportsViewProps> = ({ onSelectReport }) => {
  const {
    reports, stats, isLoading,
    statusFilter, typeFilter,
    setStatusFilter, setTypeFilter,
    getUser,
  } = useAdminReports();

  const handleTypeChange = useCallback(
    (val: string) => setTypeFilter(val as ReportType | 'all'),
    [setTypeFilter]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-bg-primary px-4 md:px-6 py-4 border-b border-border-light flex-shrink-0 space-y-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Flag size={18} className="text-primary" />
              Quản lý báo cáo
            </h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              Xử lý các báo cáo vi phạm nội dung và người dùng
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatCard label="Chờ xử lý" value={stats.pending} color="text-warning" />
            <StatCard label="Đã xử lý" value={stats.resolved} color="text-success" />
            <StatCard label="Từ chối" value={stats.rejected} color="text-error" />
          </div>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Status tabs */}
          <div className="flex bg-bg-secondary p-1 rounded-xl border border-border-light w-full sm:w-auto">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition-colors duration-200
                  ${statusFilter === tab.value
                    ? 'bg-bg-primary text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={typeFilter}
              onChange={handleTypeChange}
              options={TYPE_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto scroll-hide p-4 md:p-6 bg-bg-secondary/30">
        <div className="max-w-3xl mx-auto space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="bg-bg-primary p-4 rounded-2xl border border-border-light space-y-3 animate-fade-in">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" width={28} height={28} />
                  <Skeleton className="h-4 w-36" />
                </div>
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-bg-primary rounded-2xl border border-dashed border-border-light">
              <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
                <Flag size={22} className="text-text-tertiary" />
              </div>
              <p className="text-sm font-medium text-text-secondary">Không có báo cáo nào</p>
            </div>
          ) : (
            reports.map(report => {
              const reporter = getUser(report.reporterId);
              const reasonConfig = REPORT_CONFIG.REASONS[report.reason as keyof typeof REPORT_CONFIG.REASONS];

              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => onSelectReport(report.id)}
                  className="w-full text-left bg-bg-primary p-4 rounded-2xl border border-border-light hover:border-primary/30 hover:shadow-md transition-all duration-200 group outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      {STATUS_BADGE[report.status]}
                      {TYPE_BADGE[report.targetType]}
                    </div>
                    <span className="text-[11px] text-text-tertiary">
                      {formatRelativeTime(report.createdAt)}
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-sm font-semibold text-text-primary mb-2.5 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-error flex-shrink-0" />
                    {reasonConfig?.label}
                  </p>

                  {/* Description snippet */}
                  {report.description && (
                    <div className="bg-bg-secondary/50 px-3 py-2 rounded-xl border border-border-light mb-2.5">
                      <p className="text-xs text-text-secondary italic line-clamp-1">
                        "{report.description}"
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-border-light/60">
                    <div className="flex items-center gap-2">
                      <UserAvatar size="xs" userId={report.reporterId} />
                      <span className="text-xs text-text-tertiary truncate max-w-[120px]">
                        {reporter?.fullName}
                      </span>
                    </div>
                    <span className="text-primary text-xs font-semibold group-hover:underline transition-all">
                      Xem chi tiết →
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
