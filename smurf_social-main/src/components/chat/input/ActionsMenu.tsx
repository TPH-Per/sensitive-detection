import React from 'react';
import { Paperclip, Mic, Plus } from 'lucide-react';
import { IconButton } from '../../ui';

interface ActionsMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onAction: (type: 'media' | 'voice') => void;
  disabled?: boolean;
}

export const ActionsMenu: React.FC<ActionsMenuProps> = ({
  isOpen, onToggle, onAction, disabled,
}) => (
  <div className="relative flex-shrink-0">
    <IconButton
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`transition-all duration-200 ${isOpen ? 'rotate-45' : ''}`}
      variant={isOpen ? 'primary' : 'ghost'}
      icon={<Plus size={18} />}
      size="md"
      disabled={disabled}
    />
    {isOpen && (
      <div
        className="absolute bottom-full left-0 mb-2 flex items-center gap-1.5 p-1.5 bg-bg-primary rounded-xl shadow-dropdown border border-border-light animate-fade-in"
        style={{ zIndex: 'var(--z-dropdown)' }}
      >
        <IconButton
          type="button"
          onClick={() => onAction('media')}
          title="Đính kèm tệp"
          icon={<Paperclip size={17} />}
          size="md"
          variant="ghost"
        />
        <IconButton
          type="button"
          onClick={() => onAction('voice')}
          title="Ghi âm"
          icon={<Mic size={17} />}
          size="md"
          variant="ghost"
          disabled={disabled}
        />
      </div>
    )}
  </div>
);
