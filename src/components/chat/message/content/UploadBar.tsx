import React from 'react';

interface UploadBarProps {
  progress: number;
  error?: boolean;
  light?: boolean;
}

/**
 * Thanh tiến trình tải lên dùng chung cho các loại media
 */
export const UploadBar: React.FC<UploadBarProps> = ({ progress, error, light }) => (
  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4" style={{ zIndex: 20 }}>
    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
      <div 
        className="bg-primary h-full transition-all duration-500 ease-out" 
        style={{ width: `${progress}%` }} 
      />
    </div>
    <span className={`text-xs font-bold ${light ? 'text-white' : 'text-text-secondary'} drop-shadow-sm`}>
      {error ? 'Lỗi tải lên' : `Đang tải ${Math.round(progress)}%`}
    </span>
  </div>
);
