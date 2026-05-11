import React, { useState } from 'react';
import { Heart, MessageCircle, Send } from 'lucide-react';
import { Button, ReactionSelector, ReactionDisplay } from '../../ui';
import { ReactionType } from '../../../../shared/types';
import { REACTION_LABELS } from '../../../constants';
import { getReactionIcon } from '../../chat/reactions/ReactionIcons';
import { getReactionColorClass, getReactionBgClass } from '../../../utils';

interface InteractionActionsProps {
  reactionSummary: Partial<Record<ReactionType, number>>;
  reactionCount: number;
  myReaction: string | null;
  commentCount: number;
  onReact: (type: ReactionType | 'REMOVE') => void;
  onCommentClick?: () => void;
  onShareClick?: () => void;
  onViewReactions?: () => void;
  showEmptyDivider?: boolean;
  className?: string;
  statsClassName?: string;
  actionClassName?: string;
  selectorClassName?: string;
  selectorPosition?: 'top' | 'bottom';
}

export const InteractionActions: React.FC<InteractionActionsProps> = ({
  reactionSummary, reactionCount, myReaction, commentCount,
  onReact, onCommentClick, onShareClick, onViewReactions,
  showEmptyDivider = false,
  className = '',
  statsClassName = 'px-4 py-2.5 flex justify-between items-center border-b border-border-light/50',
  actionClassName = 'flex px-1 py-1 gap-0.5',
  selectorClassName = '',
  selectorPosition = 'top',
}) => {
  const [showReactions, setShowReactions] = useState(false);
  const hasInteractions = reactionCount > 0 || commentCount > 0;

  return (
    <div className={`flex flex-col select-none ${className}`}>
      {/* Stats row */}
      {hasInteractions ? (
        <div className={statsClassName}>
          <div className="flex items-center">
            {reactionCount > 0 && (
              <button
                onClick={onViewReactions}
                className="hover:opacity-75 transition-opacity duration-200"
              >
                <ReactionDisplay
                  reactionSummary={reactionSummary}
                  reactionCount={reactionCount}
                  variant="md"
                />
              </button>
            )}
          </div>
          {commentCount > 0 && (
            <button
              onClick={onCommentClick}
              className="text-xs text-text-tertiary hover:text-text-secondary hover:underline transition-colors duration-200 font-medium"
            >
              {commentCount} bình luận
            </button>
          )}
        </div>
      ) : showEmptyDivider && (
        <div className="mx-4 border-t border-border-light/40" />
      )}

      {/* Action buttons */}
      <div className={actionClassName}>
        {/* React button with hover selector */}
        <div
          className="flex-1 relative group/reaction-btn"
          onMouseLeave={() => setShowReactions(false)}
        >
          {showReactions && (
            <div
              className={`absolute ${selectorPosition === 'top' ? 'bottom-full pb-2.5' : 'top-full pt-2.5'} left-0 ml-1 ${selectorClassName}`}
              style={{ zIndex: 'var(--z-popover)' }}
            >
              <ReactionSelector
                onSelect={(type) => { onReact(type); setShowReactions(false); }}
                className="relative shadow-xl animate-fade-in"
              />
            </div>
          )}
          <Button
            variant="ghost"
            fullWidth
            className={`h-10 rounded-xl text-sm font-semibold transition-all duration-200
              ${myReaction
                ? `${getReactionColorClass(myReaction)} hover:bg-bg-hover`
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            onClick={() => onReact(myReaction ? 'REMOVE' : ReactionType.LIKE)}
            onMouseEnter={() => setShowReactions(true)}
            icon={
              myReaction
                ? getReactionIcon(myReaction as ReactionType, 'w-[18px] h-[18px]', 18)
                : <Heart size={18} className="transition-transform duration-200" />
            }
          >
            {myReaction ? REACTION_LABELS[myReaction as ReactionType] : 'Thích'}
          </Button>
        </div>

        {/* Comment button */}
        <Button
          variant="ghost"
          fullWidth
          className="flex-1 h-10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-200"
          onClick={onCommentClick}
          icon={<MessageCircle size={18} />}
        >
          Bình luận
        </Button>

        {onShareClick && (
          <Button
            variant="ghost"
            fullWidth
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-all duration-200"
            onClick={onShareClick}
            icon={<Send size={18} />}
          >
            Chia sẻ
          </Button>
        )}
      </div>
    </div>
  );
};
