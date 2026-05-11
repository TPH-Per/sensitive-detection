import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Skeleton } from '../components/ui';
import { ReportsView } from '../components/admin/ReportsView';
import { ReportDetailModal } from '../components/admin/ReportDetailModal';

const AdminReportsPage: React.FC = () => {
  const { user, isInitialized } = useAuthStore();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  if (!isInitialized) {
    return (
      <div className="p-6 space-y-5 h-full bg-bg-secondary/20 animate-fade-in">
        <Skeleton className="h-9 w-44 rounded-xl" />
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="h-full relative overflow-hidden">
      <ReportsView onSelectReport={setSelectedReportId} />
      {selectedReportId && (
        <ReportDetailModal
          reportId={selectedReportId}
          onClose={() => setSelectedReportId(null)}
        />
      )}
    </div>
  );
};

export default AdminReportsPage;
