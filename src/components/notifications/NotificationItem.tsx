import React from 'react';
import { Trash2, Shield } from 'lucide-react';
import { formatRelativeTime, formatDateTime } from '../../utils/dateUtils';
import { Notification, NotificationType } from '../../../shared/types';
import { UserAvatar, Button, Skeleton } from '../ui';
import { notificationService } from '../../services/notificationService';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { usePostStore } from '../../store/postStore';
import { useAuthStore } from '../../store/authStore';
import { useUserCache } from '../../store/userCacheStore';
import { useFriendIds } from '../../hooks';
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
  const friendIds = useFriendIds();

  useEffect(() => {
    if (!sender) {
      fetchUser(notification.actorId);
    }
  }, [notification.actorId, sender, fetchUser]);

  const handleItemClick = async () => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    const { fetchPostById } = usePostStore.getState();
    const { user } = useAuthStore.getState();

    if (onClick) {
      onClick();
    }

    // Điều hướng theo loại thông báo
    switch (notification.type) {
      case NotificationType.REACTION:
      case NotificationType.COMMENT:
        if (notification.data.postId && user) {
          fetchPostById(notification.data.postId, user.id, friendIds);
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
      case NotificationType.CHAT:
      case NotificationType.MENTION:
        if (notification.data.convId) {
          navigate(`/chat/${notification.data.convId}`);
        }
        break;
      case NotificationType.SYSTEM:
        if (notification.data.friendRequestId) {
          navigate(`/profile/${notification.actorId}`);
        }
        break;
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  const isInteraction = [
    NotificationType.REACTION,
    NotificationType.COMMENT,
    NotificationType.FRIEND_REQUEST,
    NotificationType.CHAT,
    NotificationType.MENTION
  ].includes(notification.type);

  const isSystem = notification.type === NotificationType.SYSTEM || notification.type === NotificationType.REPORT;

  return (
    <div
      className={`group flex items-start gap-3 p-3 cursor-pointer hover:bg-bg-hover active:bg-bg-active transition-all duration-base rounded-xl mb-1 ${!notification.isRead ? 'bg-primary/5' : ''
        }`}
      onClick={handleItemClick}
    >
      {isSystem ? (
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Shield size={20} className="text-primary" />
        </div>
      ) : (
        <UserAvatar userId={notification.actorId} size="md" showStatus={false} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary leading-tight">
          {isInteraction && (
            <span className="font-semibold mr-1">
              {sender?.fullName
                ? sender.fullName
                : <Skeleton width={72} height={13} className="opacity-60 inline-block align-middle" />}
            </span>
          )}
          {notificationService.getNotificationText(notification, sender?.fullName || '')}
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
