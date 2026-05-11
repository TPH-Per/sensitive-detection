import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { UserAvatar } from '../../ui';
import ringSound from '../../../assets/sounds/ring.mp3';

interface IncomingCallDialogProps {
  callerName: string;
  callerId: string;
  callType: 'voice' | 'video';
  isGroupCall?: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallDialog: React.FC<IncomingCallDialogProps> = ({
  callerName, callerId, callType, isGroupCall, onAccept, onReject,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    audioRef.current?.play().catch(() => { });
  }, []);

  const callLabel = callType === 'video'
    ? (isGroupCall ? 'Cuộc gọi nhóm video đến' : 'Cuộc gọi video đến')
    : (isGroupCall ? 'Cuộc gọi nhóm thoại đến' : 'Cuộc gọi thoại đến');

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
      style={{ zIndex: 'var(--z-dialog)' }}
    >
      <audio ref={audioRef} src={ringSound} loop />

      <div className="w-full sm:w-auto flex flex-col items-center gap-6 px-10 py-8 bg-[#1a1f2e] rounded-t-3xl sm:rounded-3xl shadow-2xl sm:min-w-[300px] border border-white/10">
        {/* Label */}
        <p className="text-white/50 text-xs font-medium tracking-widest uppercase">
          {callLabel}
        </p>

        {/* Avatar with pulse ring */}
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <span className="absolute -inset-2 rounded-full bg-primary/10 animate-pulse" />
          <UserAvatar userId={callerId} name={callerName} size="xl" />
        </div>

        {/* Name */}
        <div className="text-center">
          <h3 className="text-white text-xl font-semibold">{callerName}</h3>
          <p className="text-white/50 text-sm mt-1">đang gọi cho bạn</p>
        </div>

        {/* Actions */}
        <div className="flex gap-10 mt-1">
          <CallButton
            onClick={onReject}
            color="bg-red-500 hover:bg-red-600"
            label="Từ chối"
            icon={<PhoneOff size={24} className="text-white" />}
          />
          <CallButton
            onClick={onAccept}
            color="bg-green-500 hover:bg-green-600"
            label="Chấp nhận"
            icon={callType === 'video'
              ? <Video size={24} className="text-white" />
              : <Phone size={24} className="text-white" />
            }
          />
        </div>
      </div>
    </div>
  );
};

const CallButton: React.FC<{
  onClick: () => void;
  color: string;
  label: string;
  icon: React.ReactNode;
}> = ({ onClick, color, label, icon }) => (
  <div className="flex flex-col items-center gap-2">
    <button
      onClick={onClick}
      className={`w-16 h-16 rounded-full ${color} flex items-center justify-center transition-all duration-200 shadow-lg active:scale-95`}
    >
      {icon}
    </button>
    <span className="text-white/60 text-xs font-medium">{label}</span>
  </div>
);
