import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';

interface DropdownItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  className?: string;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  icon,
  label,
  onClick,
  variant = 'default',
  className = ''
}) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`
      w-full px-4 py-2.5 text-left text-sm flex items-center justify-start gap-3 transition-all duration-base
      hover:bg-bg-hover active:bg-bg-active font-medium
      first:rounded-t-[inherit] last:rounded-b-[inherit]
      ${variant === 'danger'
        ? 'text-error hover:text-error'
        : 'text-text-primary'
      }
      ${className}
    `}
  >
    {icon && <span className={`flex-shrink-0 transition-colors ${variant === 'danger' ? 'text-error' : 'text-text-secondary group-hover:text-text-primary'}`}>{icon}</span>}
    <span className="truncate flex-1">{label}</span>
  </button>
);

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  menuClassName?: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  disableTriggerScale?: boolean;
  matchTriggerWidth?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'right',
  className = '',
  menuClassName = '',
  isOpen: controlledIsOpen,
  onOpenChange,
  disableTriggerScale = false,
  matchTriggerWidth = false
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  useClickOutside([containerRef, dropdownRef], () => handleOpenChange(false), isOpen);

  const rect = containerRef.current?.getBoundingClientRect();
  const top = rect ? rect.bottom : 0;
  const left = rect ? rect.left : 0;
  const width = rect ? rect.width : 0;

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleOpenChange(!isOpen);
        }}
        className={`cursor-pointer ${disableTriggerScale ? '' : ''}`}
      >
        {trigger}
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          className={`
            fixed z-[var(--z-dropdown)] mt-1.5
            min-w-[180px] w-max max-w-[calc(100vw-32px)]
            bg-bg-primary border-2 border-border-light rounded-xl 
            shadow-dropdown overflow-hidden
            animate-in fade-in zoom-in-95 duration-base
            ${align === 'right' ? 'origin-top-right' : 'origin-top-left'}
            ${menuClassName}
          `}
          style={{
            top: `${top}px`,
            left: align === 'right'
              ? `${left + width - (dropdownRef.current?.offsetWidth || 180)}px`
              : `${left}px`,
            width: matchTriggerWidth ? `${width}px` : undefined,
          }}
          onClick={() => handleOpenChange(false)}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
};
