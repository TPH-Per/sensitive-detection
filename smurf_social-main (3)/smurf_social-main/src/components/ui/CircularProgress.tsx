import React from 'react';
import { X, Check } from 'lucide-react';

export type CircularProgressSize = 'xs' | 'sm' | 'md' | 'lg' | number;

interface CircularProgressProps {
  progress: number;
  size?: CircularProgressSize;
  strokeWidth?: number;
  showPercentage?: boolean;
  showCancel?: boolean;
  onCancel?: () => void;
  className?: string;
  status?: 'loading' | 'error' | 'success';
}

const SIZE_MAP: Record<string, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
};

/**
 * Vòng tròn tiến trình chuẩn hóa.
 */
export const CircularProgress: React.FC<CircularProgressProps> = ({
  progress,
  size = 'md',
  strokeWidth: customStrokeWidth,
  showPercentage = true,
  showCancel = false,
  onCancel,
  className = '',
  status = 'loading',
}) => {
  const numericSize = typeof size === 'string' ? SIZE_MAP[size] : size;
  const strokeWidth = customStrokeWidth || (numericSize <= 28 ? 2.5 : 3);
  
  const radius = (numericSize - strokeWidth * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const pct = Math.min(Math.max(0, progress), 100);
  const offset = circumference - (pct / 100) * circumference;
  
  const isComplete = pct >= 100 || status === 'success';
  const isError = status === 'error';

  return (
    <div
      className={`relative inline-flex items-center justify-center transition-theme ${className}`}
      style={{ width: numericSize, height: numericSize }}
    >
      <svg className="absolute -rotate-90" width={numericSize} height={numericSize}>
        {/* Nền vòng tròn */}
        <circle 
          cx={numericSize / 2} cy={numericSize / 2} r={radius} 
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="opacity-20 text-text-tertiary" 
        />
        {/* Vòng tiến trình */}
        <circle
          cx={numericSize / 2} cy={numericSize / 2} r={radius} fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-slow ${
            isError ? 'text-error' : isComplete ? 'text-success' : 'text-primary'
          }`}
        />
      </svg>

      <div className="relative z-10 flex items-center justify-center w-full h-full">
        {isComplete ? (
          <Check size={numericSize * 0.45} className="text-success animate-scale-in" strokeWidth={3} />
        ) : isError ? (
          <span className="text-error font-bold" style={{ fontSize: numericSize * 0.4 }}>!</span>
        ) : showCancel && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full hover:bg-black/5 active:bg-black/10 transition-colors p-0.5"
            aria-label="Hủy"
          >
            <X size={numericSize * 0.4} className="text-text-secondary" />
          </button>
        ) : showPercentage && numericSize > 32 ? (
          <span 
            className="text-text-primary font-bold tracking-tighter" 
            style={{ fontSize: numericSize * 0.28 }}
          >
            {Math.round(pct)}%
          </span>
        ) : null}
      </div>
    </div>
  );
};

interface CircularProgressOverlayProps extends CircularProgressProps {
  isVisible: boolean;
  blur?: boolean;
}

/**
 * Overlay hiển thị vòng tròn tiến trình đè lên media.
 */
export const CircularProgressOverlay: React.FC<CircularProgressOverlayProps> = ({
  isVisible, blur = true, ...props
}) => {
  if (!isVisible) return null;
  return (
    <div className={`absolute inset-0 flex items-center justify-center bg-black/20 z-10 animate-fade-in rounded-[inherit] ${blur ? 'backdrop-blur-[2px]' : ''}`}>
      <CircularProgress {...props} className="bg-bg-primary/90 p-1 rounded-full shadow-lg" />
    </div>
  );
};
