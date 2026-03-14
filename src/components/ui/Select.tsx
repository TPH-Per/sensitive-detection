import React, { useState, useRef, useEffect } from 'react';
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
  openUp?: boolean;
  variant?: 'default' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  value,
  onChange,
  error,
  placeholder = 'Chọn một tùy chọn',
  disabled = false,
  className = '',
  openUp: forceOpenUp,
  variant = 'default',
  size = 'md'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    if (isOpen && containerRef.current && forceOpenUp === undefined) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 250);
    } else if (forceOpenUp !== undefined) {
      setOpenUp(forceOpenUp);
    }
  }, [isOpen, forceOpenUp]);

  useClickOutside([containerRef, dropdownRef], () => setIsOpen(false), isOpen);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const sizeClasses = {
    sm: 'min-h-[36px] px-3 text-sm',
    md: 'min-h-[44px] px-4 text-base',
    lg: 'min-h-[48px] px-6 text-base'
  };

  const variantClasses = {
    default: `bg-bg-primary border ${isOpen ? 'border-primary ring-4 ring-primary/20' : 'border-border-light hover:border-primary'}`,
    ghost: `bg-transparent border-none hover:bg-bg-hover`
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer">
          {label}
        </label>
      )}

      <div className="relative">
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`
            w-full flex items-center justify-between outline-none transition-all duration-base rounded-xl font-normal
            ${sizeClasses[size]}
            ${variantClasses[variant]}
            ${error ? 'border-error ring-4 ring-error/10' : 'border-border-light'}
            ${disabled ? 'opacity-50 cursor-not-allowed bg-bg-secondary' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            {selectedOption?.icon && <span className="flex-shrink-0 text-text-secondary">{selectedOption.icon}</span>}
            <span className={`whitespace-nowrap ${!selectedOption ? 'text-text-tertiary' : 'text-text-primary'}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <ChevronDown
            size={size === 'sm' ? 14 : 18}
            className={`text-text-tertiary transition-all duration-base flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>

        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            style={{
              top: openUp ? 'auto' : `calc(${containerRef.current?.getBoundingClientRect().bottom ?? 0}px + 6px)`,
              bottom: openUp ? `calc(${window.innerHeight - (containerRef.current?.getBoundingClientRect().top ?? 0)}px + 6px)` : 'auto',
              left: `${containerRef.current?.getBoundingClientRect().left ?? 0}px`,
              minWidth: `${containerRef.current?.getBoundingClientRect().width ?? 0}px`,
              width: 'max-content',
              maxWidth: 'calc(100vw - 32px)',
              position: 'fixed'
            }}
            className={`
              z-[var(--z-popover)] bg-bg-primary border border-border-light rounded-xl shadow-dropdown overflow-hidden transition-all animate-in fade-in zoom-in-95 duration-base
            `}
          >
            <div className="max-h-60 overflow-y-auto overflow-x-hidden custom-scrollbar rounded-inherit">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={`
                    w-full px-4 py-3 text-left text-sm flex items-center justify-between transition-colors duration-base font-normal hover:bg-bg-hover active:bg-bg-active
                    ${option.value === value
                      ? 'bg-primary-light text-primary font-medium'
                      : 'text-text-primary'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                    <span className="whitespace-nowrap">{option.label}</span>
                  </div>
                  {option.value === value && <Check size={16} className="ml-2 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
      </div>

      {error && (
        <p className="mt-0.5 ml-1 text-[11px] font-medium text-error flex items-center gap-1 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
};
