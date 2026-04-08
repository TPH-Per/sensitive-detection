import React from 'react';
import { User } from '../../../../shared/types';
import { UserAvatar } from '../../ui';

interface MentionListProps {
  users: User[];
  selectedIndex: number;
  onSelect: (user: User) => void;
}

export const MentionList: React.FC<MentionListProps> = ({ users, selectedIndex, onSelect }) => {
  if (users.length === 0) return null;

  return (
    <div
      className="absolute bottom-full left-4 mb-2 w-60 bg-bg-primary border border-border-light rounded-xl shadow-dropdown overflow-hidden animate-fade-in"
      style={{ zIndex: 'var(--z-dropdown)' }}
    >
      <div className="max-h-48 overflow-y-auto scroll-hide py-1">
        {users.map((user, index) => (
          <button
            key={user.id}
            type="button"
            onClick={() => onSelect(user)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-200
              hover:bg-bg-hover active:bg-bg-active
              ${index === selectedIndex ? 'bg-bg-hover' : ''}`}
          >
            <UserAvatar
              userId={user.id}
              src={user.avatar?.url}
              initialStatus={user.status}
              size="xs"
            />
            <span className="text-sm font-medium text-text-primary truncate">
              {user.fullName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
