import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import EmojiPickerReact, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Smile } from 'lucide-react';
import { IconButton } from './IconButton';
import { useThemeStore } from '../../store/themeStore';
import { useIsMobile } from '../../hooks/utils/useMediaQuery';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  size?: number;
  buttonSize?: 'sm' | 'md' | 'lg';
  iconClassName?: string;
  showOverlay?: boolean;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onEmojiSelect,
  className = '',
  buttonClassName = '',
  disabled = false,
  size = 16,
  buttonSize = 'sm',
  iconClassName = '',
  showOverlay = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, right: 0, bottom: 0 });
  const [isReverse, setIsReverse] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { mode } = useThemeStore();
  const isMobile = useIsMobile();

  const updateCoords = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setIsReverse(spaceBelow < 400 && rect.top > 400);
    setCoords({ top: rect.top, left: rect.left, right: window.innerWidth - rect.right, bottom: rect.bottom });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  useClickOutside([containerRef, pickerRef], () => setIsOpen(false), isOpen);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <IconButton
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={buttonClassName}
        title="Emoji"
        icon={<Smile size={size} className={iconClassName} />}
        size={buttonSize}
      />

      {isOpen && createPortal(
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 'var(--z-popover)' }}>
          {showOverlay && (
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-sm md:hidden pointer-events-auto"
              onClick={() => setIsOpen(false)}
            />
          )}
          <div
            ref={pickerRef}
            className="pointer-events-auto"
            style={{
              position: 'fixed',
              top: isReverse ? 'auto' : (isMobile ? 'auto' : coords.bottom + 8),
              bottom: isMobile ? 0 : (isReverse ? window.innerHeight - coords.top + 8 : 'auto'),
              left: isMobile ? 0 : 'auto',
              right: isMobile ? 0 : (window.innerWidth - coords.right > 350 ? coords.right : 16),
            }}
          >
            <div className="w-full md:w-auto shadow-dropdown rounded-t-2xl md:rounded-xl overflow-hidden bg-bg-primary border border-border-light pb-safe md:pb-0 animate-fade-in">
              <EmojiPickerReact
                onEmojiClick={(data: EmojiClickData) => onEmojiSelect(data.emoji)}
                autoFocusSearch={false}
                theme={mode === 'dark' ? Theme.DARK : Theme.LIGHT}
                lazyLoadEmojis
                searchPlaceholder="Tìm kiếm emoji..."
                width={isMobile ? '100%' : 350}
                height={isMobile ? 350 : 400}
                previewConfig={{ showPreview: false }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
