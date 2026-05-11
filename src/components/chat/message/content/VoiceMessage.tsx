import React from 'react';
import { Pause, Play, Mic } from 'lucide-react';
import { RtdbMessage } from '../../../../../shared/types';

interface VoiceMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  isPlaying: boolean;
  onToggleVoice: (e: React.MouseEvent) => void;
  uploadProgress?: { progress: number; error?: boolean };
}

/**
 * Hiển thị tin nhắn thoại với trình phát đơn giản
 */
export const VoiceMessage: React.FC<VoiceMessageProps> = ({ 
  message, isMe, isPlaying, onToggleVoice, uploadProgress 
}) => {
  const voiceUrl = message.data.media?.[0]?.url || '';
  const rawDuration = message.data.content ? parseInt(message.data.content) : 0;
  
  const durationStr = rawDuration > 0
    ? (rawDuration >= 60
      ? `${Math.floor(rawDuration / 60)}:${String(rawDuration % 60).padStart(2, '0')}`
      : `0:${String(rawDuration).padStart(2, '0')}`)
    : null;

  const voiceClass = `flex flex-col gap-2 p-2.5 rounded-2xl border max-w-[260px] shadow-sm transition-all duration-200 ${
    isMe 
      ? 'bg-bg-message-sent text-text-primary border border-primary/10' 
      : 'bg-bg-message-received text-text-primary border border-border-light'
  }`;

  const btnClass = `w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-all duration-200 border ${
    isPlaying 
      ? 'bg-primary text-white border-primary shadow-md scale-95' 
      : (isMe ? 'bg-primary/10 text-primary border-primary/20' : 'bg-bg-secondary text-primary border-border-light')
  }`;

  if (isMe && uploadProgress && !voiceUrl) {
    return (
      <div className={voiceClass}>
        <div className="p-2.5 rounded-full bg-primary/20 text-primary/40"><Pause size={20} /></div>
        <div className="flex-1">
          <div className="text-sm font-bold mb-0.5">Tin nhắn thoại</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-primary/10 rounded-full overflow-hidden">
               <div className="bg-primary/40 h-full transition-all" style={{ width: `${uploadProgress.progress}%` }} />
            </div>
            <span className="text-[10px] font-bold text-primary italic">
               {uploadProgress.error ? 'Lỗi' : `${Math.round(uploadProgress.progress)}%`}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${voiceClass} cursor-pointer group`} onClick={onToggleVoice}>
      <div className="flex items-center gap-3.5">
        <div className={btnClass}>
          {isPlaying 
            ? <Pause size={18} fill="currentColor" /> 
            : <Play size={18} className="ml-0.5" fill="currentColor" />
          }
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-text-primary mb-1 transition-colors group-hover:text-primary">
            Tin nhắn thoại
          </div>
          <div className="flex items-center gap-2">
            {/* Waveform placeholder */}
            <div className="flex items-center gap-0.5 h-3 flex-1">
              {[...Array(isPlaying ? 16 : 10)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-0.5 rounded-full transition-all duration-300 ${
                    isPlaying ? 'bg-primary' : (isMe ? 'bg-primary/40' : 'bg-text-tertiary/40')
                  }`}
                  style={{ 
                    height: isPlaying ? `${30 + Math.random() * 70}%` : '20%',
                    animationDelay: `${i * 0.05}s`
                  }}
                />
              ))}
            </div>
            
            <div className={`flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider ${
              isMe ? 'text-primary/70' : 'text-text-tertiary'
            }`}>
              <Mic size={10} strokeWidth={3} />
              <span>{durationStr ?? '0:00'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Timestamp integrated inside card */}
      <div className={`flex justify-end text-[10px] font-bold tracking-tight opacity-40 px-1 ${isMe ? 'text-primary' : 'text-text-tertiary'}`}>
        {new Date(message.data.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};
