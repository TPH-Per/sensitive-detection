import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { User } from '../../../../shared/types';
import { Avatar } from '../../ui';

interface MessageStatusProps {
  isMine: boolean;
  isRead: boolean;
  isDelivered: boolean;
  readers: User[];
}

export const MessageStatus: React.FC<MessageStatusProps> = ({
  isMine, isRead, isDelivered, readers,
}) => {
  if (!isMine) return null;

  if (isRead && readers.length > 0) {
    return (
      <div className="flex items-center gap-0.5">
        <div className="flex -space-x-1">
          {readers.slice(0, 3).map(user => (
            <Avatar
              key={user.id}
              src={user.avatar?.url}
              name={user.fullName}
              size="2xs"
            />
          ))}
        </div>
        {readers.length > 3 && (
          <span className="text-[10px] text-text-tertiary font-semibold ml-0.5">
            +{readers.length - 3}
          </span>
        )}
      </div>
    );
  }

  if (isDelivered) {
    return <CheckCheck size={13} strokeWidth={2.5} className="text-text-tertiary" />;
  }

  return <Check size={13} strokeWidth={2.5} className="text-text-tertiary" />;
};
