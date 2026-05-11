import React from 'react';
import { ChevronLeft, Trash2, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import { useAuthStore } from '../store/authStore';
import { NotificationList } from '../components/notifications/NotificationList';
import { IconButton } from '../components/ui';

const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { notifications, unreadCount, markAllAsRead, clearAllNotifications, currentLimit, loadMore } =
    useNotificationStore();

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 h-16 border-b border-border-light bg-bg-primary">
        <div className="flex items-center gap-2">
          <IconButton
            onClick={() => navigate(-1)}
            icon={<ChevronLeft size={22} />}
            variant="ghost"
            className="md:hidden -ml-1"
          />
          <div>
            <h1 className="text-base font-semibold text-text-primary leading-tight">Thông báo</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-primary font-medium leading-tight">{unreadCount} thông báo mới</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => user && markAllAsRead(user.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-primary hover:bg-primary/10 transition-colors duration-200"
            >
              <CheckCheck size={15} />
              <span className="hidden sm:inline">Đọc tất cả</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => user && clearAllNotifications(user.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-text-tertiary hover:text-error hover:bg-error/10 transition-colors duration-200"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Xóa tất cả</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto scroll-hide">
        <div className="max-w-2xl mx-auto md:py-5 md:px-4">
          <div className="bg-bg-primary md:rounded-2xl md:border md:border-border-light overflow-hidden">
            <NotificationList maxHeight="100%" />

            {notifications.length >= currentLimit && (
              <div className="px-4 py-3 border-t border-border-light flex justify-center">
                <button
                  onClick={() => user && loadMore(user.id)}
                  className="text-xs font-semibold text-primary hover:underline transition-colors duration-200"
                >
                  Xem thêm thông báo cũ hơn
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
