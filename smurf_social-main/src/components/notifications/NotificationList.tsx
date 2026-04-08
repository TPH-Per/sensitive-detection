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
      <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
        <div className="w-12 h-12 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
          <BellOff size={20} className="opacity-50" />
        </div>
        <p className="text-sm font-medium">Chưa có thông báo nào</p>
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto scroll-hide"
      style={{ maxHeight }}
    >
      {visible.map(n => (
        <NotificationItem key={n.id} notification={n} onClick={onItemClick} />
      ))}
    </div>
  );
};
