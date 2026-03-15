import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
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
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`
      w-full px-4 py-2.5 text-left text-sm flex items-center gap-3
      transition-colors duration-fast font-medium
      hover:bg-bg-hover active:bg-bg-active
      first:rounded-t-[inherit] last:rounded-b-[inherit]
      ${variant === 'danger' ? 'text-error' : 'text-text-primary'}
      ${className}
    `}
  >
    {icon && (
      <span className={`flex-shrink-0 ${variant === 'danger' ? 'text-error' : 'text-text-secondary'}`}>
        {icon}
      </span>
    )}
    <span className="truncate flex-1">{label}</span>
  </button>
);

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transformOrigin: string;
}

const MENU_GAP = 6;
const VIEWPORT_PADDING = 12;
const MIN_MENU_WIDTH = 180;

function calcPosition(
  triggerRect: DOMRect,
  menuWidth: number,
  menuHeight: number,
  align: 'left' | 'right'
): DropdownPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceBelow = vh - triggerRect.bottom - VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING;
  const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

  // Horizontal: start from align preference, then clamp
  let left = align === 'right'
    ? triggerRect.right - menuWidth
    : triggerRect.left;

  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - menuWidth - VIEWPORT_PADDING));

  if (openUp) {
    const bottom = vh - triggerRect.top + MENU_GAP;
    return {
      bottom,
      left,
      transformOrigin: align === 'right' ? 'bottom right' : 'bottom left',
    };
  }

  return {
    top: triggerRect.bottom + MENU_GAP,
    left,
    transformOrigin: align === 'right' ? 'top right' : 'top left',
  };
}

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
  menuClassName?: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  matchTriggerWidth?: boolean;
  /** Override z-index token, defaults to --z-popover */
  zIndex?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = 'right',
  className = '',
  menuClassName = '',
  isOpen: controlledIsOpen,
  onOpenChange,
  matchTriggerWidth = false,
  zIndex,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [position, setPosition] = useState<DropdownPosition | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | undefined>(undefined);

  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleOpenChange = useCallback((next: boolean) => {
    if (!isControlled) setInternalIsOpen(next);
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  useClickOutside([triggerRef, menuRef], () => handleOpenChange(false), isOpen);

  // Recalculate position after menu mounts so we know its real dimensions
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const mw = matchTriggerWidth ? triggerRect.width : Math.max(menuEl.offsetWidth, MIN_MENU_WIDTH);
    const mh = menuEl.offsetHeight;

    setMenuWidth(matchTriggerWidth ? triggerRect.width : undefined);
    setPosition(calcPosition(triggerRect, mw, mh, align));
  }, [isOpen, align, matchTriggerWidth]);

  // Reposition on scroll/resize while open
  useLayoutEffect(() => {
    if (!isOpen) return;

    const update = () => {
      if (!triggerRef.current || !menuRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const mw = matchTriggerWidth ? triggerRect.width : Math.max(menuRef.current.offsetWidth, MIN_MENU_WIDTH);
      const mh = menuRef.current.offsetHeight;
      setPosition(calcPosition(triggerRect, mw, mh, align));
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, align, matchTriggerWidth]);

  const zClass = zIndex ? `z-[${zIndex}]` : 'z-[var(--z-popover)]';

  return (
    <div className={`relative inline-block ${className}`} ref={triggerRef}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleOpenChange(!isOpen);
        }}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenChange(false);
          }}
          className={`
            fixed ${zClass}
            min-w-[${MIN_MENU_WIDTH}px] w-max max-w-[calc(100vw-24px)]
            bg-bg-primary border border-border-light rounded-xl
            shadow-dropdown overflow-hidden
            animate-in fade-in zoom-in-95 duration-fast
            ${menuClassName}
          `}
          style={{
            top: position?.top !== undefined ? `${position.top}px` : undefined,
            bottom: position?.bottom !== undefined ? `${position.bottom}px` : undefined,
            left: position?.left !== undefined ? `${position.left}px` : undefined,
            right: position?.right !== undefined ? `${position.right}px` : undefined,
            width: menuWidth ? `${menuWidth}px` : undefined,
            transformOrigin: position?.transformOrigin ?? (align === 'right' ? 'top right' : 'top left'),
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          {children}
        </div>,
        document.body
      )}
    </div>
  );
};
