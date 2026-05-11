import React from 'react';
import { PhoneIncoming, Phone, PhoneMissed, Video as VideoIcon } from 'lucide-react';
import { RtdbMessage } from '../../../../../shared/types';

interface CallMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  isGroup?: boolean;
  onCall?: () => void;
  onJoinCall?: (callType: 'voice' | 'video') => void;
}

export const CallMessage: React.FC<CallMessageProps> = ({ 
  message, isMe, isGroup = false, onCall, onJoinCall 
}) => {
  let parsed: { 
    callType: 'voice' | 'video'; 
    status: 'ended' | 'missed' | 'rejected' | 'started'; 
    duration?: number 
  };
  
  try { 
    parsed = JSON.parse(message.data.content); 
  } catch { 
    parsed = { callType: 'voice', status: 'missed' }; 
  }

  const { callType, status, duration } = parsed;
  const isVideo = callType === 'video';
  const isMissedOrRejected = !isGroup && (status === 'missed' || status === 'rejected');
  
  const iconColor = isMissedOrRejected 
    ? 'text-red-500' 
    : (isMe ? 'text-text-primary' : 'text-primary');

  let title = '';
  if (isGroup) {
    title = status === 'started' 
      ? 'Cuộc gọi nhóm đang diễn ra' 
      : status === 'ended' 
        ? 'Cuộc gọi nhóm' 
        : 'Cuộc gọi nhóm đã kết thúc';
  } else {
    if (status === 'ended') title = isMe ? 'Cuộc gọi đi' : 'Cuộc gọi đến';
    else if (status === 'missed') title = 'Cuộc gọi nhỡ';
    else if (status === 'rejected') title = isMe ? 'Cuộc gọi bị từ chối' : 'Cuộc gọi';
    else title = 'Cuộc gọi';
  }

  let durationStr = '';
  if (duration && duration > 0) {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    durationStr = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
  }

  const btnBaseClass = "w-full py-1.5 rounded-lg text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all outline-none shadow-sm active:scale-[0.98] border";
  const btnClass = isMe 
    ? `${btnBaseClass} bg-bg-primary text-text-primary border-border-light hover:bg-bg-secondary` 
    : `${btnBaseClass} bg-primary/10 text-primary border-primary/20 hover:bg-primary/20`;

  return (
    <div className="flex flex-col gap-2.5 min-w-[180px] w-full max-w-[240px]">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center ${isMissedOrRejected ? 'bg-red-500/10' : (isMe ? 'bg-black/5 dark:bg-white/10' : 'bg-primary/10')}`}>
          {isMissedOrRejected 
            ? <PhoneMissed size={20} className={iconColor} strokeWidth={2} /> 
            : (isVideo ? <VideoIcon size={20} className={iconColor} strokeWidth={2} /> : <PhoneIncoming size={20} className={iconColor} strokeWidth={2} />)
          }
        </div>
        
        <div className="flex flex-col flex-1 min-w-0">
          <span className={`text-[13px] font-bold leading-tight truncate ${isMissedOrRejected ? 'text-red-500' : 'text-text-primary'}`}>
            {title}
          </span>
          {durationStr && (
            <span className={`text-[11px] font-semibold mt-0.5 truncate ${isMe ? 'text-text-primary opacity-70' : 'text-text-tertiary'}`}>
              {durationStr}
            </span>
          )}
        </div>
      </div>
      
      {status === 'started' ? (
        <button onClick={() => onJoinCall?.(callType)} className={btnClass}>
          {isVideo ? <VideoIcon size={14} fill="currentColor" /> : <Phone size={14} fill="currentColor" />}
          <span>Tham gia ngay</span>
        </button>
      ) : onCall && (
        <button onClick={(e) => { e.stopPropagation(); onCall(); }} className={btnClass}>
          {isVideo ? <VideoIcon size={14} /> : <Phone size={14} />}
          <span>{isVideo ? 'Gọi video lại' : 'Gọi lại'}</span>
        </button>
      )}
    </div>
  );
};
