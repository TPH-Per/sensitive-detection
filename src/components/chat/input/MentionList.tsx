import React from 'react';
import { User } from '../../../types';
import { UserAvatar } from '../../ui';

interface MentionListProps {
  users: User[];
  selectedIndex: number;
  onSelect: (user: User) => void;
}

export const MentionList: React.FC<MentionListProps> = ({
  users,
  selectedIndex,
  onSelect
}) => {
  if (users.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 mb-2 w-64 bg-bg-primary border border-border-light rounded-lg shadow-lg overflow-hidden z-50 animate-in slide-in-from-bottom-2">
      <div className="max-h-48 overflow-y-auto py-1">
        {users.map((user, index) => (
          <button
            key={user.id}
            onClick={() => onSelect(user)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-all duration-base ${index === selectedIndex
              ? 'bg-bg-hover active:bg-bg-active'
              : 'hover:bg-bg-hover active:bg-bg-active'
              }`}
          >
            <UserAvatar
              userId={user.id}
              src={user.avatar.url}
              initialStatus={user.status}
              size="xs"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">
                {user.fullName}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
