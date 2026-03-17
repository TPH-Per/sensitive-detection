import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { UserAvatar } from '../../ui';
import waitRingSound from '../../../assets/sounds/wait_ring.mp3';

interface OutgoingCallDialogProps {
  calleeName: string;
  calleeId: string;
  calleeAvatar?: string;
  callType: 'voice' | 'video';
  onCancel: () => void;
  onTimeout?: () => void;
}

export const OutgoingCallDialog: React.FC<OutgoingCallDialogProps> = ({
  calleeName,
  calleeId,
  calleeAvatar,
  callType,
  onCancel,
  onTimeout,
}) => {
  const [dots, setDots] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => {
        console.warn("Trình duyệt chặn autoplay âm thanh chờ:", e);
      });
    }
  }, []);

  useEffect(() => {
    if (onTimeout) {
      const timeoutId = setTimeout(() => {
        onTimeout();
      }, 30000); // 30 seconds
      return () => clearTimeout(timeoutId);
    }
  }, [onTimeout]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <audio ref={audioRef} src={waitRingSound} loop />
      <div className="flex flex-col items-center gap-6 px-10 py-10 bg-gray-900 rounded-3xl shadow-2xl min-w-[300px]">
        <p className="text-gray-400 text-sm tracking-wide">
          {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
        </p>

        <UserAvatar userId={calleeId} name={calleeName} src={calleeAvatar} size="xl" />

        <div className="text-center">
          <h3 className="text-white text-xl font-semibold">{calleeName}</h3>
          <p className="text-gray-400 text-sm mt-1">Đang gọi{dots}</p>
        </div>

        {/* Nút kết thúc */}
        <button
          onClick={onCancel}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
          title="Hủy cuộc gọi"
        >
          <PhoneOff size={28} className="text-white" />
        </button>
      </div>
    </div>
  );
};
