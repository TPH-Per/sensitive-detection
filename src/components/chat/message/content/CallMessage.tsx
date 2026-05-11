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

/**
 * Hiển thị thông tin cuộc gọi (kết thúc, nhỡ, đang diễn ra)
 */
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
    : (isMe ? 'text-black dark:text-white' : 'text-primary');

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

  const btnBaseClass = "mt-2 px-4 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 transition-all outline-none shadow-sm active:scale-95 border";
  const btnClass = isMe 
    ? `${btnBaseClass} bg-primary/10 text-primary hover:bg-primary/20 border-primary/20` 
    : `${btnBaseClass} bg-primary text-white hover:bg-primary/90 border-transparent`;

  return (
    <div className={`flex flex-col gap-1 w-full max-w-[260px] p-1 ${isMe ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-center gap-2.5 text-sm font-bold ${isMissedOrRejected ? 'text-red-500' : (isMe ? 'text-black dark:text-white' : 'text-text-primary')}`}>
        {isMissedOrRejected 
          ? <PhoneMissed size={18} className={iconColor} strokeWidth={2.5} /> 
          : (isVideo ? <VideoIcon size={18} className={iconColor} strokeWidth={2.5} /> : <PhoneIncoming size={18} className={iconColor} strokeWidth={2.5} />)
        }
        <span className="tracking-tight">{title}</span>
      </div>
      
      {durationStr && (
        <div className={`flex items-center gap-2 text-[11px] font-medium opacity-60 ${isMe ? 'text-black dark:text-white' : 'text-text-tertiary'}`}>
          <div className="w-1 h-1 rounded-full bg-current opacity-40" />
          <span>{durationStr}</span>
        </div>
      )}
      
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
