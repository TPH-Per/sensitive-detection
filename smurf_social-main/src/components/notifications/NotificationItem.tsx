import React, { useEffect, useCallback } from 'react';
import { Trash2, Bell, ShieldAlert } from 'lucide-react';
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
      case NotificationType.REPORT:
        navigate(currentUser?.role === 'admin' ? '/admin/reports' : '/notifications');
        break;
      case NotificationType.SYSTEM:
        navigate(notification.data.friendRequestId
          ? `/profile/${notification.actorId}`
          : '/notifications'
        );
        break;
      default:
        break;
    }
  }, [notification, markAsRead, onClick, navigate]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  }, [notification.id, deleteNotification]);

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
      className={`group relative flex items-start gap-3 px-4 py-3.5 cursor-pointer
        transition-colors duration-200 outline-none
        hover:bg-bg-hover active:bg-bg-active
        focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset
        border-b border-border-subtle last:border-0
        ${!notification.isRead ? 'bg-primary/[0.025]' : ''}`}
      onClick={handleClick}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      {/* Unread left bar */}
      {!notification.isRead && (
        <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-primary rounded-r-full" />
      )}

      {/* Avatar / icon */}
      <div className="flex-shrink-0 mt-0.5">
        {!isSystem ? (
          <UserAvatar userId={notification.actorId} size="md" showStatus={false} />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
            ${notification.type === NotificationType.REPORT
              ? 'bg-error/10 text-error'
              : 'bg-primary/10 text-primary'
            }`}
          >
            {notification.type === NotificationType.REPORT
              ? <ShieldAlert size={20} strokeWidth={2} />
              : <Bell size={20} strokeWidth={2} />
            }
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed break-words
          ${!notification.isRead ? 'text-text-primary' : 'text-text-secondary'}`}
        >
          {!isSystem && (
            <span className="font-semibold text-text-primary mr-1">
              {sender?.fullName ?? (
                <Skeleton width={56} height={12} className="inline-block align-middle" />
              )}
            </span>
          )}
          <span className={!notification.isRead ? 'font-medium' : ''}>
            {notifText}
          </span>
        </p>
        <p
          className="mt-0.5 text-[11px] text-text-tertiary"
          title={formatDateTime(notification.createdAt)}
        >
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {/* Right: unread dot + delete */}
      <div className="flex flex-col items-center gap-2 flex-shrink-0 ml-1">
        {!notification.isRead && (
          <div className="w-2 h-2 bg-primary rounded-full mt-1" />
        )}
        <button
          onClick={handleDelete}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary
            hover:text-error hover:bg-error/10 transition-all duration-200
            opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
          title="Xóa thông báo"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

export const NotificationItem = React.memo(NotificationItemInner);
