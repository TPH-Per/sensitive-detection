import React from 'react';
import { X, Check } from 'lucide-react';

interface CircularProgressProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  showPercentage?: boolean;
  showCancel?: boolean;
  onCancel?: () => void;
  className?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 48,
  strokeWidth = 3,
  showPercentage = true,
  showCancel = false,
  onCancel,
  className = '',
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  const isComplete = progress >= 100;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg className="absolute -rotate-90" width={size} height={size}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={isComplete ? 'var(--color-success)' : 'white'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-slow"
        />
      </svg>

      <div className="relative z-10 flex items-center justify-center">
        {isComplete ? (
          <Check size={size * 0.35} className="text-white" strokeWidth={2.5} />
        ) : showCancel && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full hover:bg-white/20 active:bg-white/30 transition-colors p-0.5"
            aria-label="Hủy tải lên"
          >
            <X size={size * 0.32} className="text-white" />
          </button>
        ) : showPercentage ? (
          <span className="text-white font-semibold" style={{ fontSize: size * 0.24 }}>
            {Math.round(progress)}%
          </span>
        ) : null}
      </div>
    </div>
  );
};

// Overlay dùng trên media item (ảnh/video đang upload)
interface CircularProgressOverlayProps extends CircularProgressProps {
  isVisible: boolean;
}

export const CircularProgressOverlay: React.FC<CircularProgressOverlayProps> = ({
  isVisible,
  ...props
}) => {
  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] z-10">
      <CircularProgress {...props} />
    </div>
  );
};
