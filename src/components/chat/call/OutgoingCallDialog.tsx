import React, { useEffect, useState, useRef } from 'react';
import { PhoneOff, PhoneMissed, X } from 'lucide-react';
import { UserAvatar } from '../../ui';
import { CallEndReason } from '../../../store/callStore';
import waitRingSound from '../../../assets/sounds/wait_ring.mp3';

interface OutgoingCallDialogProps {
  calleeName: string;
  calleeId: string;
  calleeAvatar?: string;
  callType: 'voice' | 'video';
  endReason: CallEndReason;
  onCancel: () => void;
  onDismiss: () => void;
}

const endReasonConfig = {
  busy: {
    icon: <PhoneMissed size={26} className="text-white" />,
    label: 'Đang bận',
    subtitle: 'Người dùng đang trong cuộc gọi khác',
    btnColor: 'bg-orange-500 hover:bg-orange-600',
  },
  rejected: {
    icon: <PhoneOff size={26} className="text-white" />,
    label: 'Từ chối',
    subtitle: 'Cuộc gọi bị từ chối',
    btnColor: 'bg-red-500 hover:bg-red-600',
  },
} as const;

export const OutgoingCallDialog: React.FC<OutgoingCallDialogProps> = ({
  calleeName, calleeId, calleeAvatar, callType, endReason, onCancel, onDismiss,
}) => {
  const [dots, setDots] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (endReason) audioRef.current?.pause();
    else audioRef.current?.play().catch(() => { });
  }, [endReason]);

  const config = endReason
    ? endReasonConfig[endReason as keyof typeof endReasonConfig]
    : null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in"
      style={{ zIndex: 'var(--z-dialog)' }}
    >
      <audio ref={audioRef} src={waitRingSound} loop />

      <div className="w-full sm:w-auto flex flex-col items-center gap-6 px-10 py-10 bg-[#1a1f2e] rounded-3xl shadow-2xl sm:min-w-[300px] border border-white/10">
        {/* Label */}
        <p className="text-white/50 text-xs font-medium tracking-widest uppercase">
          {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
        </p>

        {/* Avatar */}
        <UserAvatar userId={calleeId} name={calleeName} src={calleeAvatar} size="xl" />

        {/* Name + status */}
        <div className="text-center">
          <h3 className="text-white text-xl font-semibold">{calleeName}</h3>
          {config ? (
            <div className="mt-2 space-y-0.5">
              <p className="text-sm font-semibold text-white/80">{config.label}</p>
              <p className="text-xs text-white/40">{config.subtitle}</p>
            </div>
          ) : (
            <p className="text-white/50 text-sm mt-1 tabular-nums">
              Đang gọi{dots}
            </p>
          )}
        </div>

        {/* Action button */}
        {config ? (
          <button
            onClick={onDismiss}
            className={`w-16 h-16 rounded-full ${config.btnColor} flex items-center justify-center transition-all duration-200 shadow-lg active:scale-95`}
            title="Đóng"
          >
            <X size={24} className="text-white" />
          </button>
        ) : (
          <button
            onClick={onCancel}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 shadow-lg active:scale-95"
            title="Hủy cuộc gọi"
          >
            <PhoneOff size={24} className="text-white" />
          </button>
        )}
      </div>
    </div>
  );
};
