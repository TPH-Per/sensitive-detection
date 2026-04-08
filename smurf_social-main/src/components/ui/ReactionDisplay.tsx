import React, { useMemo } from 'react';
import { ReactionType } from '../../../shared/types';
import { getReactionIcon } from '../chat/reactions/ReactionIcons';

interface ReactionDisplayProps {
  reactionSummary?: Record<string, number>;
  reactionCount?: number;
  className?: string;
  onClick?: () => void;
  variant?: 'xs' | 'sm' | 'md' | 'minimal';
}

const ReactionDisplayInner: React.FC<ReactionDisplayProps> = ({
  reactionSummary = {},
  reactionCount = 0,
  className = '',
  onClick,
  variant = 'sm'
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
  const isXS = variant === 'xs';
  const isMD = variant === 'md';

  const iconSize = isXS ? 14 : (isMD ? 18 : 16);
  const fontSize = isXS ? 'text-xs' : (isMD ? 'text-xs' : 'text-xs');

  return (
    <div
      className={`flex items-center gap-1 select-none transition-all duration-200 ${isMinimal
        ? (onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default')
        : `px-1.5 py-0.5 bg-bg-secondary rounded-full border border-border-light shadow-sm cursor-pointer hover:bg-bg-hover hover:border-primary/30`
        } overflow-visible ${className}`}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick?.();
      }}
    >
      <div className="flex items-center -space-x-1.5">
        {sortedEmojis.map((emoji, index) => (
          <div
            key={emoji}
            style={{ zIndex: 10 - index }}
            className="flex-shrink-0 flex items-center justify-center bg-bg-secondary rounded-full ring-1 ring-bg-secondary"
          >
            {getReactionIcon(emoji as ReactionType, "overflow-visible", iconSize)}
          </div>
        ))}
      </div>
      <span className={`${fontSize} text-text-secondary font-semibold ml-0.5`}>
        {reactionCount}
      </span>
    </div>
  );
};

export const ReactionDisplay = React.memo(ReactionDisplayInner);
