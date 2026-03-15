import React, { useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { Button, ReactionSelector, ReactionDisplay } from '../../ui';
import { ReactionType } from '../../../../shared/types';
import { REACTION_LABELS } from '../../../constants';
import { getReactionIcon } from '../../chat/reactions/ReactionIcons';

interface ReactionActionsProps {
  reactionSummary: Partial<Record<ReactionType, number>>;
  reactionCount: number;
  myReaction: string | null;
  commentCount: number;
  onReact: (type: ReactionType | 'REMOVE') => void;
  onCommentClick?: () => void;
  onViewReactions?: () => void;
  showEmptyDivider?: boolean;
  className?: string;
  statsClassName?: string;
  actionClassName?: string;
  selectorClassName?: string;
  selectorPosition?: 'top' | 'bottom';
}

export const ReactionActions: React.FC<ReactionActionsProps> = ({
  reactionSummary,
  reactionCount,
  myReaction,
  commentCount,
  onReact,
  onCommentClick,
  onViewReactions,
  showEmptyDivider = false,
  className = '',
  statsClassName = 'px-4 py-3 flex justify-between items-center border-b border-border-light/60',
  actionClassName = 'flex p-1 relative',
  selectorClassName = '',
  selectorPosition = 'top',
}) => {
  const [showReactions, setShowReactions] = useState(false);

  const handleLikeClick = () => {
    onReact(myReaction ? 'REMOVE' : ReactionType.LIKE);
  };

  const hasInteractions = reactionCount > 0 || commentCount > 0;

  return (
    <div className={`flex flex-col select-none ${className}`}>
      {hasInteractions ? (
        <div className={statsClassName}>
          <div className="flex items-center">
            {reactionCount > 0 && (
              <button 
                onClick={onViewReactions}
                className="hover:opacity-80 transition-all active:scale-95"
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
              className="text-sm text-text-secondary hover:underline transition-all"
            >
              {commentCount} bình luận
            </button>
          )}
        </div>
      ) : showEmptyDivider && (
        <div className="mx-4 border-b border-border-light/40" />
      )}

      <div className={actionClassName}>
        <div 
          className="flex-1 relative group/reaction-btn" 
          onMouseLeave={() => setShowReactions(false)}
        >
          {showReactions && (
            <div className={`absolute ${selectorPosition === 'top' ? 'bottom-full pb-3' : 'top-full pt-3'} left-0 ml-2 z-[100] ${selectorClassName}`}>
              <ReactionSelector 
                onSelect={(type) => {
                  onReact(type);
                  setShowReactions(false);
                }} 
                className={`relative shadow-2xl animate-in fade-in ${selectorPosition === 'top' ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'} duration-200`}
              />
            </div>
          )}

          <Button
            variant="ghost"
            fullWidth
            className={`h-10 transition-all duration-200 ${
              myReaction ? 'text-primary bg-primary/5 font-bold' : 'text-text-secondary hover:bg-black/5'
            }`}
            onClick={handleLikeClick}
            onMouseEnter={() => setShowReactions(true)}
            icon={myReaction ? (
              <span className="animate-bounce-once">
                {getReactionIcon(myReaction as ReactionType, "w-5 h-5", 20)}
              </span>
            ) : (
              <Heart className="w-5 h-5 transition-transform group-hover/reaction-btn:scale-110" />
            )}
          >
            {myReaction ? REACTION_LABELS[myReaction as ReactionType] : 'Thích'}
          </Button>
        </div>

        {/* Nút Bình luận */}
        <Button
          variant="ghost"
          fullWidth
          className="flex-1 h-10 text-text-secondary transition-all hover:bg-black/5"
          onClick={onCommentClick}
          icon={<MessageCircle className="w-5 h-5" />}
        >
          Bình luận
        </Button>
      </div>
    </div>
  );
};

