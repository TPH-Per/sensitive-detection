import React, { useRef, useEffect } from 'react';
import { ReactionType } from '../../../shared/types';
import { IconCancel } from '../chat/reactions/ReactionIcons';
import { REACTIONS } from '../../constants';
import { getReactionIcon } from '../chat/reactions/ReactionIcons';

interface ReactionSelectorProps {
  onSelect: (emoji: ReactionType | 'REMOVE') => void;
  onClose?: () => void;
  className?: string;
  currentReaction?: string | ReactionType | null;
  size?: 'xs' | 'sm' | 'md';
  autoClose?: boolean;
}

const ReactionSelectorInner: React.FC<ReactionSelectorProps> = ({ 
  onSelect, onClose, className = '', currentReaction, size = 'sm', autoClose = true 
}) => {
  const isXs = size === 'xs';
  const isSmall = size === 'sm';
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseLeave = () => {
    if (onClose) {
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 500);
    }
  };

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);
  
  return (
    <div
      className={`absolute z-[var(--z-popover)] bg-bg-primary border border-border-light rounded-full shadow-dropdown cursor-pointer 
      ${isXs ? 'p-1 gap-1' : isSmall ? 'p-1.5 gap-1.5' : 'p-2 gap-2'} flex items-center animate-in fade-in zoom-in duration-fast
      ${className}`}
      onMouseLeave={autoClose ? handleMouseLeave : undefined}
      onMouseEnter={autoClose ? handleMouseEnter : undefined}
    >
      {currentReaction && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect('REMOVE');
            onClose?.();
          }}
          className={`${isXs ? 'w-8 h-8' : isSmall ? 'w-10 h-10' : 'w-12 h-12'} flex items-center justify-center transition-all duration-fast rounded-full hover:bg-bg-hover active:scale-90`}
          title="Gỡ cảm xúc"
        >
          <IconCancel size={isXs ? 22 : isSmall ? 28 : 32} className="opacity-60 hover:opacity-100 transition-opacity" />
        </button>
      )}
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(emoji);
            onClose?.();
          }}
          className={`${isXs ? 'w-8 h-8' : isSmall ? 'w-10 h-10' : 'w-12 h-12'} flex items-center justify-center transition-all duration-fast rounded-full hover:bg-bg-hover hover:-translate-y-1 hover:scale-110 active:scale-95 origin-bottom`}
        >
          {getReactionIcon(emoji, undefined, isXs ? 24 : isSmall ? 34 : 42)}
        </button>
      ))}
    </div>
  );
};

export const ReactionSelector = React.memo(ReactionSelectorInner);
