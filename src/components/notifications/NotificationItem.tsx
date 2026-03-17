import React from 'react';
import { Trash2, Shield } from 'lucide-react';
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

    // Luồng điều hướng triệt để cho mọi loại thông báo
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

  const showSenderName = notification.type !== NotificationType.SYSTEM && notification.type !== NotificationType.REPORT;

  return (
    <div
      className={`group flex items-start gap-3 p-3 cursor-pointer hover:bg-bg-hover active:bg-bg-active transition-all duration-base rounded-xl mb-1 ${!notification.isRead ? 'bg-primary/5' : ''
        }`}
      onClick={handleItemClick}
    >
      {!showSenderName ? (
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Shield size={20} className="text-primary" />
        </div>
      ) : (
        <UserAvatar userId={notification.actorId} size="md" showStatus={false} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary leading-tight">
          {showSenderName && (
            <span className="font-semibold mr-1">
              {sender?.fullName
                ? sender.fullName
                : <Skeleton width={72} height={13} className="opacity-60 inline-block align-middle" />}
            </span>
          )}
          {notificationService.getNotificationText(notification)}
        </p>
        <span className="text-xs text-text-tertiary mt-1 block" title={formatDateTime(notification.createdAt)}>
          {formatRelativeTime(notification.createdAt)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-2">
        {!notification.isRead && (
          <div className="w-2.5 h-2.5 bg-primary rounded-full" />
        )}
        <Button
          variant="ghost"
          size="md"
          onClick={handleDelete}
          className="md:opacity-0 md:group-hover:opacity-100 text-text-tertiary hover:text-error hover:bg-error/10 transition-all duration-base rounded-full active:scale-95"
          icon={<Trash2 size={18} />}
        />
      </div>
    </div>
  );
};
