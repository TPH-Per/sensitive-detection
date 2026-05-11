import React from 'react';
import { BellOff } from 'lucide-react';
import { NotificationType } from '../../../shared/types';
import { useNotificationStore } from '../../store/notificationStore';
import { useLoadingStore } from '../../store/loadingStore';
import { NotificationItem } from './NotificationItem';
import { NotificationSkeleton } from './NotificationSkeleton';

interface NotificationListProps {
  onItemClick?: () => void;
  maxHeight?: string;
}

export const NotificationList: React.FC<NotificationListProps> = ({
  onItemClick,
  maxHeight = '420px',
}) => {
  const notifications = useNotificationStore(state => state.notifications);
  const isLoading = useLoadingStore(state => state.loadingStates['notifications']);

  const visible = notifications.filter(n => {
    if (n.type !== NotificationType.REPORT) return true;
    return !(n.data?.contentSnippet ?? '').includes('bị khóa');
  });

  if (isLoading && visible.length === 0) return <NotificationSkeleton />;

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-20 h-20 bg-bg-secondary rounded-3xl flex items-center justify-center mb-5 border border-divider shadow-sm rotate-3">
          <BellOff size={32} className="text-text-tertiary opacity-40 -rotate-3" />
        </div>
        <h4 className="text-[16px] font-bold text-text-primary tracking-tight">Chưa có thông báo</h4>
        <p className="text-[13px] mt-1.5 text-text-secondary leading-relaxed max-w-[200px]">
          Các cập nhật và hoạt động mới nhất của bạn sẽ được hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto scroll-hide p-2 flex flex-col gap-1.5"
      style={{ maxHeight }}
    >
      {visible.map(n => (
        <NotificationItem key={n.id} notification={n} onClick={onItemClick} />
      ))}
    </div>
  );
};
