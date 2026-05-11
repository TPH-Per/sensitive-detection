import React from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle, Info } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { useScrollLock } from '../../hooks/utils/useScrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  showHeader?: boolean;
  showCloseButton?: boolean;
  className?: string;
  bodyClassName?: string;
  fullScreen?: boolean | 'mobile';
}

const maxWidthClasses: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
  '2xl': 'max-w-2xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl', '7xl': 'max-w-7xl', full: 'max-w-full',
};

const paddingClasses: Record<NonNullable<ModalProps['padding']>, string> = {
  none: 'p-0', sm: 'p-2', md: 'p-4', lg: 'p-6',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, children, footer,
  maxWidth = 'md', padding = 'lg',
  showHeader = true, showCloseButton = true,
  className = '', bodyClassName = '', fullScreen = false,
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const isFullAlways = fullScreen === true;
  const isFullMobile = fullScreen === 'mobile';

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-hidden ${isFullAlways ? 'p-0' : isFullMobile ? 'max-md:p-0 p-4' : 'p-4'}`}
      style={{ zIndex: 'var(--z-modal)' }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-bg-overlay backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`
        relative bg-bg-primary w-full shadow-xl transition-theme overflow-hidden flex flex-col justify-between md:justify-start
        ${isFullAlways
          ? 'h-full max-h-screen rounded-none'
          : isFullMobile
            ? 'h-full md:h-auto max-md:max-h-screen md:max-h-[90vh] rounded-none md:rounded-2xl animate-slide-in-right md:animate-fade-in duration-slow'
            : 'rounded-2xl h-auto md:max-h-[90vh] animate-fade-in duration-base'
        }
        ${maxWidthClasses[maxWidth]} ${className}
      `}>
        {showHeader && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-light flex-shrink-0">
            <h3 className="text-base font-bold text-text-primary">{title || ''}</h3>
            {showCloseButton && (
              <IconButton onClick={onClose} icon={<X size={20} />} size="md" />
            )}
          </div>
        )}

        <div className={`overflow-y-auto flex-1 min-h-0 ${paddingClasses[padding]} ${bodyClassName}`}>
          {children}
        </div>

        {footer && (
          <div className="px-4 md:px-5 py-3 md:py-4 border-t border-border-light bg-bg-secondary/30 flex justify-end gap-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-4 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, onClose, onConfirm,
  title = 'Xác nhận', message,
  confirmLabel = 'Xác nhận', cancelLabel = 'Hủy',
  variant = 'primary',
}) => {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 'var(--z-dialog)' }}>
      <div className="fixed inset-0 bg-bg-overlay backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative bg-bg-primary w-full max-w-[320px] rounded-2xl shadow-xl p-5 border border-border-light animate-fade-in">
        <div className="flex flex-col items-center text-center mb-5">
          {variant === 'danger' && (
            <div className="w-12 h-12 bg-error-light text-error rounded-full flex items-center justify-center mb-3">
              <AlertTriangle size={22} />
            </div>
          )}
          {variant === 'primary' && (
            <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
              <Info size={22} />
            </div>
          )}
          <h3 className="text-base font-bold text-text-primary mb-2">{title}</h3>
          <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={onClose} variant="secondary" className="w-full">
            {cancelLabel}
          </Button>
          <Button onClick={() => { onConfirm(); onClose(); }} variant={variant} className="w-full font-bold">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};
