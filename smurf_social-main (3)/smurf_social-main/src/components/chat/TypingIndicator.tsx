import React from 'react';
import { User } from '../../../shared/types';
import { getLastName } from '../../utils/uiUtils';

interface TypingIndicatorProps {
  typingUsers: string[];
  currentUserId: string;
  usersMap: Record<string, User>;
}

/** Chỉ báo đang soạn tin nhắn */
export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUsers, currentUserId, usersMap,
}) => {
  const active = typingUsers.filter(uid => uid !== currentUserId);
  if (active.length === 0) return null;

  const name = (uid: string) => getLastName(usersMap[uid]?.fullName) || 'Người dùng';

  const typingText =
    active.length === 1
      ? `${name(active[0])} đang soạn tin...`
      : active.length === 2
        ? `${name(active[0])} và ${name(active[1])} đang soạn tin...`
        : `${name(active[0])}, ${name(active[1])} và ${active.length - 2} người khác đang soạn tin...`;

  return (
    <div
      className="absolute bottom-2 left-4 animate-fade-in pointer-events-none"
      style={{ zIndex: 'var(--z-sticky)' }}
    >
      <div className="flex items-center gap-2 bg-bg-primary border border-border-light/50 rounded-full px-3 py-1.5 shadow-sm">
        {/* Animated Dots */}
        <div className="flex items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse-dot"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        <span className="text-xs text-text-tertiary font-medium">{typingText}</span>
      </div>
    </div>
  );
};
