import React, { useState, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  code?: string;
}

interface SearchableSelectProps {
  label?: string;
  options: SearchableOption[];
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  allowCustomValue?: boolean;
}

const MENU_GAP = 6;
const VIEWPORT_PADDING = 12;
const MAX_MENU_HEIGHT = 256;

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label, options, value, onChange, error,
  placeholder = 'Chọn một tùy chọn',
  searchPlaceholder = 'Tìm kiếm...',
  disabled = false, className = '', size = 'md',
  allowCustomValue = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{
    top?: number; bottom?: number; left: number; width: number; openUp: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find(o => o.value === value);

  // Tìm theo label hoặc code
  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, 50);
    const q = query.toLowerCase().trim();
    return options
      .filter(o =>
        o.label.toLowerCase().includes(q) ||
        (o.code && o.code.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [query, options]);

  const calcPos = useCallback(() => {
    if (!containerRef.current || !menuRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - MENU_GAP;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openUp = spaceBelow < MAX_MENU_HEIGHT && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 200);
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, vw - width - VIEWPORT_PADDING));
    setPos(openUp
      ? { bottom: vh - rect.top + MENU_GAP, left, width, openUp: true }
      : { top: rect.bottom + MENU_GAP, left, width, openUp: false }
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) { setPos(null); return; }
    calcPos();
    setTimeout(() => inputRef.current?.focus(), 0);
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [isOpen, calcPos]);

  useClickOutside([containerRef, menuRef], () => {
    setIsOpen(false);
    setQuery('');
  }, isOpen);

  const handleOpen = () => {
    if (!disabled) setIsOpen(prev => !prev);
  };

  const handleSelect = (option: SearchableOption) => {
    onChange(option.value);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setIsOpen(false); setQuery(''); }
    if (e.key === 'Enter' && allowCustomValue && query) {
      onChange(query);
      setIsOpen(false);
      setQuery('');
    }
  };

  const sizeClasses: Record<NonNullable<SearchableSelectProps['size']>, string> = {
    sm: 'min-h-[36px] px-3 text-sm',
    md: 'min-h-[44px] px-4 text-base',
    lg: 'min-h-[48px] px-6 text-base',
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary ml-1">
          {label}
        </label>
      )}

      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={handleOpen}
        className={`
          w-full flex items-center justify-between outline-none transition-all duration-200
          rounded-xl font-normal bg-bg-primary border cursor-pointer
          ${sizeClasses[size]}
          ${isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border-light hover:border-border-medium'}
          ${error ? 'border-error ring-2 ring-error/10' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-bg-secondary' : ''}
        `}
      >
        <span className={`truncate flex-1 ${!selectedOption && !value ? 'text-text-tertiary' : 'text-text-primary'}`}>
          {selectedOption ? selectedOption.label : (value || placeholder)}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Xóa"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={size === 'sm' ? 14 : 18}
            className={`text-text-tertiary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          onKeyDown={handleKeyDown}
          className="fixed bg-bg-primary border border-border-light rounded-xl shadow-dropdown overflow-hidden animate-fade-in flex flex-col"
          style={{
            zIndex: 'var(--z-popover)',
            top: pos?.top !== undefined ? `${pos.top}px` : undefined,
            bottom: pos?.bottom !== undefined ? `${pos.bottom}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: pos ? `${pos.width}px` : undefined,
            maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
            maxHeight: `${MAX_MENU_HEIGHT + 52}px`,
            transformOrigin: pos?.openUp ? 'bottom left' : 'top left',
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border-light flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-7 pr-3 py-1.5 text-sm bg-bg-secondary rounded-lg border-none outline-none text-text-primary placeholder:text-text-tertiary"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="overflow-y-auto scroll-hide flex-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-text-tertiary text-center">
                Không tìm thấy kết quả
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full px-4 py-2.5 text-left text-sm flex items-center justify-between gap-2
                    transition-colors duration-fast hover:bg-bg-hover active:bg-bg-active
                    ${option.value === value ? 'bg-primary/5 text-primary font-medium' : 'text-text-primary font-normal'}
                  `}
                >
                  <span className="truncate">{option.label}</span>
                  {option.value === value && <Check size={15} className="flex-shrink-0 text-primary" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {error && (
        <p className="mt-0.5 ml-1 text-xs font-medium text-error animate-fade-in">{error}</p>
      )}
    </div>
  );
};
