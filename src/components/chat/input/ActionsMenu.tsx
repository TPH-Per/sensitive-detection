import React from 'react';
import { Image as ImageIcon, Paperclip, Mic, Plus } from 'lucide-react';
import { IconButton } from '../../ui';

interface ActionsMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onAction: (type: 'media' | 'voice') => void;
  disabled?: boolean;
}

export const ActionsMenu: React.FC<ActionsMenuProps> = ({
  isOpen,
  onToggle,
  onAction,
  disabled
}) => {
  return (
    <div className="relative">
      <IconButton
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`transition-all ${isOpen ? 'rotate-45' : ''}`}
        variant={isOpen ? 'primary' : 'ghost'}
        icon={<Plus size={18} />}
        size="md"
        disabled={disabled}
      />

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 flex items-center gap-2 p-2 bg-bg-secondary rounded-xl shadow-lg border border-border-light animate-fade-in z-50">
          <IconButton
            type="button"
            onClick={() => onAction('media')}
            title="Đính kèm tệp"
            icon={<Paperclip size={18} />}
            size="md"
          />
          <IconButton
            type="button"
            onClick={() => onAction('voice')}
            title="Ghi âm"
            icon={<Mic size={18} />}
            size="md"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
};
