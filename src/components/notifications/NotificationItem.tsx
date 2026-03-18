import React from 'react';
import { Trash2, Shield, Bell, AlertTriangle } from 'lucide-react';
import { formatRelativeTime, formatDateTime } from '../../utils/dateUtils';
import { Notification, NotificationType } from '../../../shared/types';
import { UserAvatar, Button, Skeleton } from '../ui';
import { notificationService } from '../../services/notificationService';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { useUserCache } from '../../store/userCacheStore';
import { useEffect } from 'react';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

export const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClick }) => {
  const navigate = useNavigate();
  const markAsRead = useNotificationStore(state => state.markAsRead);
  const deleteNotification = useNotificationStore(state => state.deleteNotification);
  const { getUser, fetchUser } = useUserCache();
  const sender = getUser(notification.actorId);

  useEffect(() => {
    if (!sender) {
      fetchUser(notification.actorId);
    }
  }, [notification.actorId, sender, fetchUser]);

  const handleItemClick = async () => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    const { user } = useAuthStore.getState();

    if (onClick) {
      onClick();
    }

    switch (notification.type) {
      case NotificationType.REACTION:
      case NotificationType.COMMENT:
        if (notification.data.postId) {
          navigate(`/post/${notification.data.postId}`);
        }
        break;
      case NotificationType.FRIEND_REQUEST:
        navigate('/contacts');
        break;
      case NotificationType.REPORT:
        if (user?.role === 'admin') {
          navigate('/admin/reports');
        } else {
          navigate('/notifications');
        }
        break;
      case NotificationType.SYSTEM:
        if (notification.data.friendRequestId) {
          navigate(`/profile/${notification.actorId}`);
        } else {
          navigate('/notifications');
        }
        break;
      default:
        break;
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  const showSenderName = ![NotificationType.SYSTEM, NotificationType.REPORT].includes(notification.type);

  return (
    <div
      className={`group relative flex items-start gap-4 p-4 cursor-pointer hover:bg-bg-hover active:bg-bg-active transition-all duration-base rounded-2xl mb-1 ${
        !notification.isRead ? 'bg-primary/[0.03]' : 'bg-transparent'
      }`}
      onClick={handleItemClick}
    >
      {/* Unread Indicator Bar */}
      {!notification.isRead && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-10 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.4)]" />
      )}

      <div className="shrink-0 relative">
        {!showSenderName ? (
           <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
            notification.type === NotificationType.REPORT ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
          }`}>
            {notification.type === NotificationType.REPORT ? <AlertTriangle size={24} strokeWidth={2.5} /> : <Bell size={24} strokeWidth={2.5} />}
          </div>
        ) : (
          <UserAvatar userId={notification.actorId} size="lg" showStatus={false} className="shadow-sm" />
        )}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-[15px] leading-snug break-words ${!notification.isRead ? 'text-text-primary font-semibold' : 'text-text-secondary font-medium'}`}>
              {showSenderName && (
                <span className="text-text-primary hover:underline cursor-pointer mr-1.5">
                  {sender?.fullName || <Skeleton width={60} height={14} className="inline-block" />}
                </span>
              )}
              <span className={!notification.isRead ? 'text-text-primary' : 'text-text-tertiary'}>
                {notificationService.getNotificationText(notification)}
              </span>
            </p>
            <span className="text-[12px] text-text-tertiary mt-1.5 flex items-center gap-1.5 opacity-70" title={formatDateTime(notification.createdAt)}>
              {formatRelativeTime(notification.createdAt)}
              {!notification.isRead && <span className="w-1 h-1 rounded-full bg-primary" />}
            </span>
          </div>
          
          <div className="flex flex-col items-center gap-2 shrink-0">
             {!notification.isRead && (
              <div className="w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.5)]" />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-error hover:bg-error/10 transition-all duration-base rounded-xl active:scale-90"
              icon={<Trash2 size={16} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
