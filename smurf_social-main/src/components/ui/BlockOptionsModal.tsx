import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, MessageCircle, Phone, Eye, EyeOff, ChevronDown, ChevronRight, X } from 'lucide-react';
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

const OptionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  indent?: boolean;
}> = ({ icon, label, description, checked, onChange, indent }) => (
  <label
    className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer hover:bg-bg-hover transition-colors duration-200 ${indent ? 'ml-6' : ''}`}
  >
    <div className="pt-0.5 flex-shrink-0">
      <div
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${checked ? 'btn-gradient border-primary' : 'border-border-medium bg-bg-primary'
          }`}
        onClick={() => onChange(!checked)}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </div>
    <div className="flex-1 min-w-0" onClick={() => onChange(!checked)}>
      <div className="flex items-center gap-2">
        <span className="text-text-secondary">{icon}</span>
        <span className="font-medium text-text-primary text-sm">{label}</span>
      </div>
      <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>
    </div>
  </label>
);

// Modal chọn options block user
export const BlockOptionsModal: React.FC<BlockOptionsModalProps> = ({
  isOpen,
  targetName,
  initialOptions,
  onApply,
  onUnblock,
  onClose,
}) => {
  const [options, setOptions] = useState<BlockOptions>(DEFAULT_OPTIONS);
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      const mergedOptions = {
        ...DEFAULT_OPTIONS,
        blockMessages: initialOptions?.blockMessages ?? DEFAULT_OPTIONS.blockMessages,
        blockCalls: initialOptions?.blockCalls ?? DEFAULT_OPTIONS.blockCalls,
        blockViewMyActivity: initialOptions?.blockViewMyActivity ?? DEFAULT_OPTIONS.blockViewMyActivity,
        hideTheirActivity: initialOptions?.hideTheirActivity ?? DEFAULT_OPTIONS.hideTheirActivity,
      };
      setOptions(mergedOptions);
      setActivityExpanded(!!(mergedOptions.blockViewMyActivity || mergedOptions.hideTheirActivity));
    }
  }, [isOpen, initialOptions]);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const set = (key: keyof BlockOptions, val: boolean) =>
    setOptions(prev => ({ ...prev, [key]: val }));

  const activityActive = options.blockViewMyActivity || options.hideTheirActivity;

  const handleToggleActivity = () => {
    const next = !activityExpanded;
    setActivityExpanded(next);
    if (!next) {
      setOptions(prev => ({ ...prev, blockViewMyActivity: false, hideTheirActivity: false }));
    }
  };

  const handleApply = async () => {
    setIsLoading(true);
    try {
      const hasAnyOption = options.blockMessages ||
        options.blockCalls ||
        options.blockViewMyActivity ||
        options.hideTheirActivity;

      if (!hasAnyOption && onUnblock) {
        await onUnblock();
      } else {
        await onApply(options);
      }
      onClose();
    } finally {
      setIsLoading(false);
    }
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-error/10 flex items-center justify-center flex-shrink-0">
              <Ban size={18} className="text-error" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary text-base">Quản lý chặn {targetName}</h3>
              <p className="text-xs text-text-tertiary">Chọn những gì bạn muốn chặn</p>
            </div>
          </div>
          <IconButton icon={<X size={20} />} onClick={onClose} size="lg" />
        </div>

        {/* Options */}
        <div className="px-3 py-3 space-y-1">
          <OptionRow
            icon={<MessageCircle size={16} />}
            label="Chặn tin nhắn"
            description="Người này không thể gửi tin nhắn cho bạn"
            checked={options.blockMessages}
            onChange={(val) => set('blockMessages', val)}
          />

          <OptionRow
            icon={<Phone size={16} />}
            label="Chặn gọi điện"
            description="Người này không thể gọi điện cho bạn"
            checked={options.blockCalls}
            onChange={(val) => set('blockCalls', val)}
          />

          {/* Nhóm Ẩn nhật ký */}
          <div className="rounded-xl border border-border-light overflow-hidden">
            <button
              className="w-full flex items-center gap-3 p-3 hover:bg-bg-hover transition-colors duration-200 text-left"
              onClick={handleToggleActivity}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${activityActive ? 'btn-gradient border-primary' : 'border-border-medium bg-bg-primary'
                  }`}
              >
                {activityActive && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <EyeOff size={16} className="text-text-secondary flex-shrink-0" />
                  <span className="font-medium text-text-primary text-sm">Chặn và ẩn khỏi nhật ký</span>
                </div>
                <p className="text-xs text-text-tertiary mt-0.5">Quản lý khả năng hiển thị hoạt động</p>
              </div>
              {activityExpanded
                ? <ChevronDown size={16} className="text-text-secondary flex-shrink-0" />
                : <ChevronRight size={16} className="text-text-secondary flex-shrink-0" />
              }
            </button>

            {activityExpanded && (
              <div className="border-t border-border-light bg-bg-secondary/30 space-y-0.5 py-2">
                <OptionRow
                  icon={<Eye size={15} />}
                  label="Chặn xem hoạt động của tôi"
                  description="Người bị chặn không thể xem bài đăng của bạn"
                  checked={options.blockViewMyActivity}
                  onChange={(val) => set('blockViewMyActivity', val)}
                  indent
                />
                <OptionRow
                  icon={<EyeOff size={15} />}
                  label="Ẩn hoạt động của người này"
                  description="Bạn sẽ không thấy bài đăng của họ trong nhật ký"
                  checked={options.hideTheirActivity}
                  onChange={(val) => set('hideTheirActivity', val)}
                  indent
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-light flex gap-3 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Hủy
          </Button>
          <Button
            variant="danger"
            onClick={handleApply}
            isLoading={isLoading}
            className="flex-1 font-semibold"
          >
            Áp dụng
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
