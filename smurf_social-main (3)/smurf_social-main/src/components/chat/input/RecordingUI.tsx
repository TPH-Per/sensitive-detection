import React from 'react';
import { Square, Mic } from 'lucide-react';

interface RecordingUIProps {
  duration: number;
  onCancel: () => void;
  onStop: () => void;
}

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/** Giao diện khi đang ghi âm tin nhắn thoại */
export const RecordingUI: React.FC<RecordingUIProps> = ({ duration, onCancel, onStop }) => (
  <div className="flex-1 flex items-center justify-between bg-bg-secondary rounded-xl px-4 py-2.5 border border-primary/30 animate-fade-in">
    <div className="flex items-center gap-2.5">
      {/* Pulsing Mic Indicator */}
      <div className="relative flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-error/15 flex items-center justify-center">
          <Mic size={14} className="text-error" />
        </div>
        <span className="absolute inset-0 rounded-full bg-error/20 animate-pulse-dot" />
      </div>
      <span className="text-sm font-semibold text-primary tabular-nums">
        {formatTime(duration)}
      </span>
    </div>

    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="text-xs font-semibold text-text-secondary hover:text-error transition-colors duration-200 px-2 py-1"
      >
        Hủy
      </button>
      <button
        type="button"
        onClick={onStop}
        className="w-9 h-9 rounded-full btn-gradient flex items-center justify-center text-white shadow-accent hover:brightness-110 transition-colors duration-200 active:brightness-95"
      >
        <Square size={14} fill="currentColor" />
      </button>
    </div>
  </div>
);
