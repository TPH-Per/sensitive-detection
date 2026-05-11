import React, { useState } from 'react';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface SensitiveMediaGuardProps {
  isSensitive?: boolean;
  children: React.ReactNode;
  className?: string;
  onReveal?: () => void;
  onHide?: () => void;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Thành phần bảo vệ nội dung nhạy cảm bằng lớp phủ làm mờ.
 */
export const SensitiveMediaGuard: React.FC<SensitiveMediaGuardProps> = ({
  isSensitive = false,
  children,
  className = '',
  onReveal,
  onHide,
  size = 'md'
}) => {
  const [isRevealed, setIsRevealed] = useState(false);

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRevealed(true);
    if (onReveal) onReveal();
  };

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRevealed(false);
    if (onHide) onHide();
  };

  const showContent = !isSensitive || isRevealed;
  const isXs = size === 'xs';
  const isSm = size === 'sm';
  const isTiny = isXs || isSm;

  return (
    <div className={`relative group/sensitive overflow-hidden ${className}`}>
      {/* Nội dung gốc */}
      <div className={`w-full h-full transition-all duration-300 ${!showContent ? 'blur-2xl select-none pointer-events-none' : ''}`}>
        {children}
      </div>

      {/* Nút Ẩn lại */}
      {isSensitive && isRevealed && (
        <button
          onClick={handleHide}
          className="absolute top-2 right-2 z-30 p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white rounded-full transition-all duration-200 md:opacity-0 md:group-hover/sensitive:opacity-100 opacity-100"
          title="Ẩn nội dung nhạy cảm"
        >
          <EyeOff size={14} />
        </button>
      )}

      {/* Lớp phủ cảnh báo */}
      {!showContent && (
        <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300 ${isTiny ? 'px-1 py-2' : 'px-2 py-3'}`}>
          <div className={`flex flex-col items-center flex-1 justify-center ${isTiny ? 'gap-1' : 'gap-3'} text-center w-full`}>
            
            {!isTiny && (
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-lg mb-1">
                <AlertTriangle className="text-yellow-400/80" size={24} />
              </div>
            )}
            
            <div className={isTiny ? 'flex flex-col items-center gap-0.5' : 'space-y-1'}>
              <h4 className={`
                text-white/90 font-bold tracking-tight uppercase px-1 truncate max-w-full
                ${isXs ? 'text-[9px]' : isSm ? 'text-[11px]' : 'text-sm'}
              `}>
                {isXs ? 'Nhạy cảm' : 'Nội dung nhạy cảm'}
              </h4>
              {!isTiny && (
                <p className="text-white/60 text-[10px] sm:text-xs">
                  Ảnh này có thể chứa nội dung không phù hợp.
                </p>
              )}
            </div>

            <button
              onClick={handleReveal}
              className={`flex items-center justify-center gap-1 bg-white text-neutral-900 rounded-full font-extrabold transition-all active:scale-95 shadow-md
                ${isXs ? 'px-2 py-0.5 text-[8px]' : isSm ? 'px-3 py-1 text-[10px]' : 'mt-4 px-5 py-2 text-xs hover:bg-neutral-100'}
              `}
            >
              <Eye size={isXs ? 8 : isSm ? 11 : 14} />
              <span>{isXs ? 'Xem' : 'Xem nội dung'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
