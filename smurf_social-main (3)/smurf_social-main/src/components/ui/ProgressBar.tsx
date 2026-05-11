import React from 'react';

interface ProgressBarProps {
  progress: number;
  status?: 'loading' | 'error' | 'success';
  label?: string;
  metadata?: string;
  className?: string;
  showPercentage?: boolean;
}

/**
 * Thanh tiến trình ngang chuẩn hóa cho toàn dự án.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  status = 'loading',
  label,
  metadata,
  className = '',
  showPercentage = false,
}) => {
  const pct = Math.min(Math.max(0, Math.round(progress)), 100);
  const isComplete = pct >= 100 || status === 'success';
  const isError = status === 'error';

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {(label || showPercentage || metadata) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          {label && (
            <span className="text-xs font-semibold text-text-secondary truncate">
              {label}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {metadata && (
              <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-tight">
                {metadata}
              </span>
            )}
            {showPercentage && (
              <span className={`text-xs font-bold ${isError ? 'text-error' : isComplete ? 'text-success' : 'text-primary'}`}>
                {isError ? 'Lỗi' : isComplete ? 'Hoàn tất' : `${pct}%`}
              </span>
            )}
          </div>
        </div>
      )}
      
      <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-base ${
            isError ? 'bg-error' : isComplete ? 'bg-success' : 'btn-gradient'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
