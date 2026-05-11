import React, { useEffect, useCallback } from 'react';
import { Trash2, Bell, ShieldAlert, Check } from 'lucide-react';
import { formatRelativeTime, formatDateTime } from '../../utils/dateUtils';
import { Notification, NotificationType } from '../../../shared/types';
import { UserAvatar, Skeleton } from '../ui';
import { notificationService } from '../../services/notificationService';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { useUserCache } from '../../store/userCacheStore';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

const NotificationItemInner: React.FC<NotificationItemProps> = ({ notification, onClick }) => {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore(state => state.markAsRead);
  const deleteNotification = useNotificationStore(state => state.deleteNotification);
  const { getUser, fetchUser } = useUserCache();
  const sender = getUser(notification.actorId);
  const isSystem = !notification.actorId || notification.actorId === 'system';

  useEffect(() => {
    if (!isSystem && !sender) fetchUser(notification.actorId);
  }, [notification.actorId, isSystem, sender, fetchUser]);

  const handleClick = useCallback(async () => {
    if (!notification.isRead) await markAsRead(notification.id);
    onClick?.();

    const { user: currentUser } = useAuthStore.getState();

    switch (notification.type) {
      case NotificationType.REACTION:
      case NotificationType.COMMENT:
        if (notification.data.postId) navigate(`/feed/post/${notification.data.postId}`);
        break;
      case NotificationType.FRIEND_REQUEST:
        navigate('/contacts');
        break;
      case NotificationType.FRIEND_ACCEPT:
        navigate(`/profile/${notification.actorId}`);
        break;
      case NotificationType.REPORT:
        if (currentUser?.role === 'admin') {
          navigate('/admin/reports');
        }
        break;
      case NotificationType.SYSTEM:
        navigate('/notifications');
        break;
      default:
        break;
    }
  }, [notification, markAsRead, onClick, navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  }, [notification.id, deleteNotification]);

  const handleMarkAsRead = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAsRead(notification.id);
  }, [notification.id, markAsRead]);

  const notifText = (() => {
    const raw = notificationService.getNotificationText(notification);
    if (!isSystem && sender?.fullName && raw.startsWith(sender.fullName)) {
      return raw.replace(sender.fullName, '').trim();
    }
    return raw;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group relative flex items-start gap-3.5 px-4 py-3.5 cursor-pointer
        transition-all duration-200 outline-none rounded-xl border
        hover:bg-bg-hover active:bg-bg-active
        focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset
        ${!notification.isRead 
          ? 'bg-primary/[0.04] border-primary/10' 
          : 'bg-bg-primary border-border-subtle'
        }`}
      onClick={handleClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      {/* Avatar / icon */}
      <div className="flex-shrink-0 relative">
        {!isSystem ? (
          <UserAvatar userId={notification.actorId} size="md" showStatus={false} />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm
            ${notification.type === NotificationType.REPORT
              ? 'bg-error/10 text-error'
              : 'bg-primary/10 text-primary'
            }`}
          >
            {notification.type === NotificationType.REPORT ? (
              <ShieldAlert size={20} strokeWidth={2.5} />
            ) : (
              <Bell size={20} strokeWidth={2.5} />
            )}
          </div>
        )}

        {!notification.isRead && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-bg-primary ring-1 ring-primary/20 shadow-sm" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className={`text-sm leading-relaxed break-words line-clamp-2
          ${!notification.isRead ? 'text-text-primary' : 'text-text-secondary'}`}
        >
          {!isSystem && (
            <span 
              className={`${!notification.isRead ? 'font-bold' : 'font-semibold'} text-text-primary mr-1.5 hover:text-primary transition-colors duration-200 cursor-pointer`}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/profile/${notification.actorId}`);
              }}
            >
              {sender?.fullName ?? (
                <Skeleton width={60} height={14} className="inline-block align-middle" />
              )}
            </span>
          )}
          <span className={!notification.isRead ? 'font-medium text-text-primary' : ''}>
            {notifText}
          </span>
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <p
            className="text-[11px] text-text-tertiary"
            title={formatDateTime(notification.createdAt)}
          >
            {formatRelativeTime(notification.createdAt)}
          </p>
          {notification.isRead && (
            <span className="w-1 h-1 bg-text-tertiary/40 rounded-full" />
          )}
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex flex-col items-center justify-center flex-shrink-0 ml-1 self-stretch min-w-[32px] gap-1">
        {/* Mark as read button (only if unread) */}
        {!notification.isRead && (
          <button
            onClick={handleMarkAsRead}
            className="w-8 h-8 flex items-center justify-center rounded-full text-text-tertiary
              hover:text-primary hover:bg-primary/10 active:bg-primary/20 
              transition-all duration-200 
              md:opacity-0 md:group-hover:opacity-100"
            title="Đánh dấu đã đọc"
          >
            <Check size={16} strokeWidth={2.5} />
          </button>
        )}
        
        {/* Delete button */}
        <button
          onClick={handleDelete}
          className="w-8 h-8 flex items-center justify-center rounded-full text-text-tertiary
            hover:text-error hover:bg-error/10 active:bg-error/20
            transition-all duration-200
            md:opacity-0 md:group-hover:opacity-100"
          title="Xóa thông báo"
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export const NotificationItem = React.memo(NotificationItemInner);
