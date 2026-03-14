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
  size?: 'sm' | 'md';
  autoClose?: boolean;
}

const ReactionSelectorInner: React.FC<ReactionSelectorProps> = ({ 
  onSelect, onClose, className = '', currentReaction, size = 'sm', autoClose = true 
}) => {
  const isSmall = size === 'sm';
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseLeave = () => {
    if (onClose) {
      closeTimerRef.current = setTimeout(() => {
        onClose();
      }, 300);
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
      className={`absolute z-[var(--z-popover)] bg-bg-primary border border-divider rounded-full shadow-dropdown cursor-pointer ${isSmall ? 'p-1 flex gap-1.5' : 'p-2 flex gap-2'} animate-in fade-in zoom-in duration-base 
      before:content-[''] before:absolute before:-top-4 before:-bottom-4 before:-left-4 before:-right-4 before:bg-transparent before:pointer-events-none before:-z-10
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
          className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center transition-all duration-base relative group hover:scale-125 origin-bottom`}
          title="Gỡ cảm xúc"
        >
          <IconCancel size={isSmall ? 26 : 34} className="opacity-70 group-hover:opacity-100 transition-opacity" />
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
          className={`${isSmall ? 'w-8 h-8' : 'w-10 h-10'} flex items-center justify-center transition-all duration-base relative group hover:scale-125 origin-bottom`}
        >
          {getReactionIcon(emoji, undefined, isSmall ? 28 : 36)}
        </button>
      ))}
    </div>
  );
};

export const ReactionSelector = React.memo(ReactionSelectorInner);
