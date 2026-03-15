import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange: (value: string | any) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const MENU_GAP = 6;
const VIEWPORT_PADDING = 12;
const MAX_MENU_HEIGHT = 240;

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = 'Chọn một tùy chọn',
  disabled = false,
  className = '',
  variant = 'default',
  size = 'md'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{
    top?: number; bottom?: number; left: number; width: number; openUp: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  const calcPos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openUp = spaceBelow < MAX_MENU_HEIGHT && spaceAbove > spaceBelow;

    const width = Math.max(rect.width, 160);
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, vw - width - VIEWPORT_PADDING));

    setPos(openUp
      ? { bottom: window.innerHeight - rect.top + MENU_GAP, left, width, openUp: true }
      : { top: rect.bottom + MENU_GAP, left, width, openUp: false }
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) { setPos(null); return; }
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [isOpen, calcPos]);

  useClickOutside([containerRef, menuRef], () => setIsOpen(false), isOpen);

  const sizeClasses = {
    sm: 'min-h-[36px] px-3 text-sm',
    md: 'min-h-[44px] px-4 text-base',
    lg: 'min-h-[48px] px-6 text-base'
  };

  const variantClasses = {
    default: `bg-bg-primary border ${isOpen ? 'border-primary ring-4 ring-primary/20' : 'border-border-light hover:border-primary'}`,
    ghost: 'bg-transparent border-none hover:bg-bg-hover'
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer">
          {label}
        </label>
      )}

      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`
          w-full flex items-center justify-between outline-none transition-all duration-base rounded-xl font-normal
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${error ? 'border-error ring-4 ring-error/10' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-bg-secondary' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedOption?.icon && (
            <span className="flex-shrink-0 text-text-secondary">{selectedOption.icon}</span>
          )}
          <span className={`truncate ${!selectedOption ? 'text-text-tertiary' : 'text-text-primary'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          size={size === 'sm' ? 14 : 18}
          className={`text-text-tertiary transition-transform duration-base flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[var(--z-popover)] bg-bg-primary border border-border-light rounded-xl shadow-dropdown overflow-hidden animate-in fade-in zoom-in-95 duration-fast"
          style={{
            top: pos?.top !== undefined ? `${pos.top}px` : undefined,
            bottom: pos?.bottom !== undefined ? `${pos.bottom}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: pos ? `${pos.width}px` : undefined,
            maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
            transformOrigin: pos?.openUp ? 'bottom left' : 'top left',
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <div className="max-h-60 overflow-y-auto overflow-x-hidden custom-scrollbar">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                className={`
                  w-full px-4 py-2.5 text-left text-sm flex items-center justify-between
                  transition-colors duration-fast font-normal hover:bg-bg-hover active:bg-bg-active
                  ${option.value === value ? 'bg-primary-light text-primary font-medium' : 'text-text-primary'}
                `}
              >
                <div className="flex items-center gap-2">
                  {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                  <span className="truncate">{option.label}</span>
                </div>
                {option.value === value && <Check size={16} className="ml-2 flex-shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {error && (
        <p className="mt-0.5 ml-1 text-[11px] font-medium text-error animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
};
