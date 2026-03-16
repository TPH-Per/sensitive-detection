import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { User } from '../../../../shared/types';
import { Avatar } from '../../ui';
import { useAuthStore } from '../../../store';

interface MessageStatusProps {
  isRead: boolean;
  isDelivered: boolean;
  readers: User[];
  isMine: boolean;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({
  isRead,
  isDelivered,
  readers,
  isMine
}) => {
  const { settings } = useAuthStore();
  
  if (!isMine) return null;

  const shouldShowReaders = isRead && !!settings?.showReadReceipts;

  if (shouldShowReaders) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex -space-x-1">
          {readers.slice(0, 3).map(user => (
            <Avatar
              key={user.id}
              src={user.avatar.url}
              name={user.fullName}
              size="2xs"
            />
          ))}
        </div>
        {readers.length > 3 && (
          <span className="text-[9px] text-text-tertiary font-bold">
            +{readers.length - 3}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="text-text-tertiary">
      {isDelivered || isRead ? (
        <CheckCheck size={14} strokeWidth={2.5} />
      ) : (
        <Check size={14} strokeWidth={2.5} />
      )}
    </div>
  );
};
