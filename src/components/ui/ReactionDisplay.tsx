import React, { useMemo } from 'react';
import { ReactionType } from '../../../shared/types';
import { getReactionIcon } from '../chat/reactions/ReactionIcons';

interface ReactionDisplayProps {
  reactionSummary?: Record<string, number>;
  reactionCount?: number;
  className?: string;
  onClick?: () => void;
  variant?: 'default' | 'minimal';
}

const ReactionDisplayInner: React.FC<ReactionDisplayProps> = ({
  reactionSummary = {},
  reactionCount = 0,
  className = '',
  onClick,
  variant = 'default'
}) => {
  const sortedEmojis = useMemo(() =>
    Object.entries(reactionSummary)
      .sort(([, a], [, b]) => b - a)
      .map(([emoji]) => emoji)
      .slice(0, 3),
    [reactionSummary]
  );

  if (reactionCount === 0) return null;

  const isMinimal = variant === 'minimal';

  return (
    <div
      className={`flex items-center gap-1 select-none transition-all duration-base ${isMinimal
        ? (onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default')
        : 'px-1.5 py-1 min-h-[24px] bg-bg-secondary rounded-full border border-divider shadow-sm cursor-pointer hover:bg-bg-hover hover:border-primary/50 hover:shadow-md'
        } overflow-visible ${className}`}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick?.();
      }}
    >
      <div className={`flex items-center ${isMinimal ? '-space-x-1' : '-space-x-1'}`}>
        {sortedEmojis.map((emoji, index) => (
          <React.Fragment key={emoji}>
            <div 
              style={{ zIndex: 10 - index }} 
              className="flex-shrink-0 flex items-center justify-center overflow-visible"
            >
              {getReactionIcon(emoji as ReactionType, "overflow-visible", isMinimal ? 16 : 16)}
            </div>
          </React.Fragment>
        ))}
      </div>
      <span className={`${isMinimal ? 'text-[11px] ml-1' : 'text-[10px] sm:text-[11px]'} text-text-secondary font-bold flex items-center h-full`}>
        {reactionCount}
      </span>
    </div>
  );
};

export const ReactionDisplay = React.memo(ReactionDisplayInner);
