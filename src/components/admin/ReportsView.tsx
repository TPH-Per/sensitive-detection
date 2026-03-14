import React, { useState } from 'react';
import {
  Shield,
  Flag,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertTriangle,
  FileX,
  Search,
  Filter
} from 'lucide-react';
import { ReportStatus, ReportType } from '../../../shared/types';
import { Button, UserAvatar, Skeleton, Select } from '../ui';
import { REPORT_CONFIG } from '../../constants';
import { formatRelativeTime } from '../../utils/dateUtils';
import { useAdminReports } from '../../hooks/useAdminReports';

interface ReportsViewProps {
  onSelectReport: (reportId: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onSelectReport }) => {
  const {
    reports,
    stats,
    isLoading,
    statusFilter,
    typeFilter,
    setStatusFilter,
    setTypeFilter,
    getUser,
    openConfirmDialog,
  } = useAdminReports();

  const tabs = [
    { label: 'Chờ xử lý', value: 'pending', color: 'warning', icon: <Clock size={16} />, count: stats.pending },
    { label: 'Đã xử lý', value: ReportStatus.RESOLVED, color: 'success', icon: <CheckCircle size={16} />, count: stats.resolved },
    { label: 'Từ chối', value: ReportStatus.REJECTED, color: 'error', icon: <XCircle size={16} />, count: stats.rejected },
  ];

  const typeOptions = [
    { value: 'all', label: 'Tất cả loại' },
    { value: ReportType.POST, label: 'Bài viết' },
    { value: ReportType.COMMENT, label: 'Bình luận' },
    { value: ReportType.USER, label: 'Người dùng' },
  ];

  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case ReportStatus.PENDING:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/10 text-warning flex items-center gap-1"><Clock size={10} /> Chờ xử lý</span>;
      case ReportStatus.RESOLVED:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success flex items-center gap-1"><CheckCircle size={10} /> Đã xử lý</span>;
      case ReportStatus.REJECTED:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-text-secondary/10 text-text-secondary flex items-center gap-1"><XCircle size={10} /> Từ chối</span>;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filters & Tabs */}
      <div className="bg-bg-primary p-4 border-b border-border-light space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex bg-bg-secondary p-1 rounded-xl border border-border-light w-full sm:w-auto">
            {tabs.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value as ReportStatus | 'pending')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${statusFilter === tab.value
                  ? `bg-bg-primary text-primary shadow-sm`
                  : 'text-text-secondary hover:text-text-primary'
                  }`}
              >
                {tab.label}
                <span className="opacity-50 font-medium">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto min-w-[160px]">
            <Select
              value={typeFilter}
              onChange={(val) => setTypeFilter(val as ReportType | 'all')}
              options={typeOptions}
              className="flex-1"
            />
          </div>
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto bg-bg-secondary/30 p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="bg-bg-primary p-5 rounded-2xl border border-border-light flex flex-col gap-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" width={32} height={32} />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ))
          ) : reports.length === 0 ? (
            <div className="text-center py-20 bg-bg-primary rounded-2xl border border-border-light border-dashed">
              <Flag size={48} className="text-text-tertiary mx-auto mb-4 opacity-20" />
              <p className="text-text-secondary font-medium">Không có báo cáo nào</p>
            </div>
          ) : (
            reports.map(report => {
              const reporter = getUser(report.reporterId);
              const reasonConfig = REPORT_CONFIG.REASONS[report.reason as keyof typeof REPORT_CONFIG.REASONS];

              return (
                <div
                  key={report.id}
                  onClick={() => onSelectReport(report.id)}
                  className="bg-bg-primary p-4 rounded-xl border border-border-light shadow-sm hover:border-primary/30 active:bg-bg-hover transition-all duration-base cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(report.status)}
                      <span className="text-[10px] font-bold text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded uppercase">
                        {report.targetType}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-tertiary">
                      {formatRelativeTime(report.createdAt)}
                    </span>
                  </div>

                  <div className="flex items-start gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-text-primary mb-1 italic">
                        <AlertTriangle size={14} className="inline-block mr-1 text-error align-text-top" />
                        {reasonConfig?.label}
                      </h4>
                    </div>
                  </div>

                  {report.description && (
                    <div className="bg-bg-secondary/30 p-2.5 rounded-lg border border-border-light mb-3">
                      <p className="text-xs text-text-secondary italic line-clamp-1">"{report.description}"</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-border-light">
                    <div className="flex items-center gap-2">
                      <UserAvatar size="xs" userId={report.reporterId} />
                      <span className="text-[10px] font-medium text-text-tertiary truncate max-w-[120px]">
                        {reporter?.fullName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary text-[10px] font-bold uppercase tracking-wider">
                      Xem chi tiết
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
