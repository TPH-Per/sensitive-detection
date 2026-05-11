import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Ban, MessageCircle, Phone, EyeOff, X, ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { BlockOptions } from '../../../shared/types';
import { useScrollLock } from '../../hooks/utils/useScrollLock';

interface BlockOptionsModalProps {
  isOpen: boolean;
  targetName: string;
  initialOptions?: Partial<BlockOptions>;
  onApply: (options: BlockOptions) => Promise<void>;
  onUnblock?: () => Promise<void>;
  onClose: () => void;
}

const DEFAULT_OPTIONS: BlockOptions = {
  blockMessages: false,
  blockCalls: false,
  blockViewMyActivity: false,
  hideTheirActivity: false,
};

export const BlockOptionsModal: React.FC<BlockOptionsModalProps> = ({
  isOpen,
  targetName,
  initialOptions,
  onApply,
  onUnblock,
  onClose,
}) => {
  const [options, setOptions] = useState<BlockOptions>(DEFAULT_OPTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOptions({
        blockMessages: initialOptions?.blockMessages ?? false,
        blockCalls: initialOptions?.blockCalls ?? false,
        blockViewMyActivity: initialOptions?.blockViewMyActivity ?? false,
        hideTheirActivity: initialOptions?.hideTheirActivity ?? false,
      });
      setIsActivityExpanded(
        (initialOptions?.blockViewMyActivity ?? false) || (initialOptions?.hideTheirActivity ?? false)
      );
    }
  }, [isOpen, initialOptions]);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const toggleOption = (key: keyof BlockOptions) => {
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApply = async () => {
    setIsLoading(true);
    try {
      const allFalse = !options.blockMessages && !options.blockCalls && !options.blockViewMyActivity && !options.hideTheirActivity;
      if (allFalse && onUnblock) {
        await onUnblock();
      } else {
        await onApply(options);
      }
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const renderOption = (
    key: keyof BlockOptions,
    icon: React.ReactNode,
    label: string,
    desc: string,
    isNested = false
  ) => {
    const isActive = options[key];
    return (
      <div
        key={key}
        className={`flex items-start gap-4 p-4 cursor-pointer transition-all duration-200 ${
          isNested ? '' : 'rounded-2xl border-2'
        } ${
          isActive
            ? isNested ? 'bg-error/5' : 'bg-error/5 border-error/40 ring-1 ring-error/20'
            : isNested ? 'hover:bg-bg-secondary/50' : 'border-bg-secondary hover:border-border-light'
        }`}
        onClick={() => toggleOption(key)}
      >
        <div className="pt-0.5">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
            isActive ? 'border-error bg-error' : 'border-border-strong'
          }`}>
            {isActive && (
              <svg viewBox="0 0 12 10" width="10" height="10" fill="none">
                <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`flex items-center gap-2 font-bold text-sm ${isActive ? 'text-error' : 'text-text-primary'}`}>
            {icon}
            <span>{label}</span>
          </div>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            {desc}
          </p>
        </div>
      </div>
    );
  };

  const content = (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center sm:p-4"
      style={{ zIndex: 'var(--z-modal)' }}
    >
      <div
        className="fixed inset-0 bg-bg-overlay backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative bg-bg-primary w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-error/10 flex items-center justify-center flex-shrink-0">
              <Ban size={18} className="text-error" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-base">Quản lý chặn {targetName}</h3>
              <p className="text-xs text-text-tertiary">Chọn các hạn chế muốn áp dụng</p>
            </div>
          </div>
          <IconButton icon={<X size={20} />} onClick={onClose} size="lg" />
        </div>

        <div className="px-5 py-4 space-y-2.5 max-h-[60vh] overflow-y-auto overscroll-contain">
          {renderOption('blockMessages', <MessageCircle size={15} />, 'Chặn tin nhắn', 'Người này không thể gửi tin nhắn cho bạn.')}
          {renderOption('blockCalls', <Phone size={15} />, 'Chặn cuộc gọi', 'Người này không thể gọi điện cho bạn.')}

          <div className={`border-2 rounded-2xl overflow-hidden transition-all duration-200 ${
            options.blockViewMyActivity || options.hideTheirActivity
              ? 'border-error/40 ring-1 ring-error/20'
              : 'border-bg-secondary hover:border-border-light'
          }`}>
            <div 
              className={`flex items-start gap-4 p-4 cursor-pointer transition-colors ${
                options.blockViewMyActivity && options.hideTheirActivity ? 'bg-error/5' : 'bg-bg-primary hover:bg-bg-secondary/50'
              }`}
              onClick={() => {
                const newValue = !(options.blockViewMyActivity && options.hideTheirActivity);
                setOptions(prev => ({
                  ...prev,
                  blockViewMyActivity: newValue,
                  hideTheirActivity: newValue
                }));
                if (newValue) setIsActivityExpanded(true);
              }}
            >
              <div className="pt-0.5">
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  (options.blockViewMyActivity && options.hideTheirActivity) ? 'border-error bg-error' : 'border-border-strong'
                }`}>
                  {(options.blockViewMyActivity && options.hideTheirActivity) && (
                    <svg viewBox="0 0 12 10" width="10" height="10" fill="none">
                      <path d="M1 5l3.5 3.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {(!options.blockViewMyActivity || !options.hideTheirActivity) && (options.blockViewMyActivity || options.hideTheirActivity) && (
                    <div className="w-2 h-0.5 bg-error rounded-full" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-2 font-bold text-sm ${options.blockViewMyActivity || options.hideTheirActivity ? 'text-error' : 'text-text-primary'}`}>
                  <EyeOff size={15} />
                  <span>Chặn và ẩn nhật ký</span>
                </div>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  Quản lý quyền xem bài viết và hoạt động
                </p>
              </div>
              <div 
                className="pt-1 px-2 -mr-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsActivityExpanded(!isActivityExpanded);
                }}
              >
                <ChevronDown size={18} className={`text-text-tertiary transition-transform duration-200 ${isActivityExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
            
            {isActivityExpanded && (
              <div className="border-t border-border-light bg-bg-primary">
                {renderOption(
                  'blockViewMyActivity',
                  <EyeOff size={15} />,
                  'Chặn xem bài đăng của tôi',
                  'Người này sẽ không xem được bài đăng của bạn.',
                  true
                )}
                <div className="h-px bg-border-light mx-4" />
                {renderOption(
                  'hideTheirActivity',
                  <EyeOff size={15} />,
                  'Ẩn hoạt động của người này',
                  'Bạn sẽ không thấy bài đăng của người này.',
                  true
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-5 border-t border-divider flex gap-3 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-6">
          <Button variant="secondary" onClick={onClose} className="flex-1 font-semibold h-11">
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={handleApply}
            isLoading={isLoading}
            className="flex-1 font-bold h-11 shadow-sm transition-all"
          >
            Xác nhận
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
