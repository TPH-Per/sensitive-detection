import React from 'react';
import { FileText, Download, Image as ImageIcon, Play, Pause, Mic, PhoneIncoming, Phone, PhoneMissed, Video } from 'lucide-react';

import { RtdbMessage, MessageType } from '../../../types';
import { IconButton, LazyVideo, LazyImage } from '../../ui';


interface MessageContentProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress: Record<string, { progress: number; error?: boolean }>;
  isPlaying: boolean;
  onToggleVoice: (e: React.MouseEvent) => void;
  setShowFullImage: (show: boolean) => void;
  onCall?: () => void;
}

const MessageContentInner: React.FC<MessageContentProps> = ({
  message,
  isMe,
  uploadProgress,
  isPlaying,
  onToggleVoice,
  setShowFullImage,
  onCall,
}) => {
  if (message.data.isRecalled) {
    return (
      <div className={`italic text-sm ${isMe ? 'text-white/80' : 'text-text-tertiary'}`}>
        Tin nhắn đã thu hồi
      </div>
    );
  }

  switch (message.data.type) {
    case 'image':
      const imageUrl = message.data.media?.[0]?.url || message.data.content;
      return (
        <div
          className="rounded-lg overflow-hidden max-w-[280px] cursor-pointer group relative"
          onClick={() => setShowFullImage(true)}
        >
          <LazyImage
            src={imageUrl}
            alt="sent"
            className="w-full h-auto"
          />
          {isMe && uploadProgress[message.id] && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4">
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden mb-2">
                <div
                  className="bg-primary h-full transition-all duration-slow"
                  style={{ width: `${uploadProgress[message.id].progress}%` }}
                />
              </div>
              <span className="text-[10px] text-white font-medium">
                {uploadProgress[message.id].error ? 'Lỗi tải lên' : `Đang tải ${Math.round(uploadProgress[message.id].progress)}%`}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 md:group-hover:bg-black/10 transition-all duration-base flex items-center justify-center">
            <ImageIcon className="opacity-0 md:group-hover:opacity-100 text-white transition-all duration-base" size={32} />
          </div>
        </div>
      );

    case 'file':
      const fileUrl = message.data.media?.[0]?.url || message.data.content;
      const fileName = message.data.media?.[0]?.fileName || 'Tài liệu';
      const fileSize = message.data.media?.[0]?.size
        ? `${(message.data.media[0].size / 1024).toFixed(1)} KB`
        : 'N/A';

      return (
        <div className={`flex items-center gap-3 p-3 rounded-lg border min-w-[220px] ${isMe ? 'bg-primary-light border-primary' : 'bg-bg-primary border-border-light'
          }`}>
          <div className={`p-2 rounded ${isMe ? 'bg-primary-light' : 'bg-secondary'}`}>
            <FileText size={24} className={isMe ? 'text-primary' : 'text-text-secondary'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate text-sm">{fileName}</div>
            <div className="text-xs opacity-70">{fileSize}</div>
          </div>
          <a
            href={fileUrl}
            download={fileName}
            className="p-1 hover:bg-black/10 active:bg-black/20 rounded-full transition-all duration-base"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={18} />
          </a>
          {isMe && uploadProgress[message.id] && (
            <div className="absolute inset-0 bg-bg-primary/80 flex flex-col items-center justify-center p-2 rounded-lg">
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mb-1">
                <div
                  className="bg-primary h-full transition-all duration-slow"
                  style={{ width: `${uploadProgress[message.id].progress}%` }}
                />
              </div>
              <span className="text-[10px] text-text-secondary">
                {uploadProgress[message.id].error ? 'Lỗi' : `${Math.round(uploadProgress[message.id].progress)}%`}
              </span>
            </div>
          )}
        </div>
      );

    case 'video':
      const videoUrl = message.data.media?.[0]?.url || message.data.content;
      return (
        <div className="rounded-lg overflow-hidden max-w-[300px] border border-border-light shadow-sm">
          <LazyVideo
            src={videoUrl}
            className="w-full h-auto max-h-[400px] object-contain"
          />
        </div>
      );

    case MessageType.CALL: {
      let parsed: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected'; duration?: number };
      try { parsed = JSON.parse(message.data.content); }
      catch { parsed = { callType: 'voice', status: 'missed' }; }

      const { callType, status, duration } = parsed;
      const isVideo = callType === 'video';

      // Nhãn tiêu đề
      let title = '';
      if (status === 'ended') title = isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
      else if (status === 'missed') title = isVideo ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ';
      else title = isVideo ? 'Cuộc gọi video bị từ chối' : 'Cuộc gọi thoại bị từ chối';

      // Thời lượng
      let durationStr = '';
      if (duration && duration > 0) {
        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        durationStr = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
      }

      const isMissedOrRejected = status === 'missed' || status === 'rejected';
      const iconColor = isMissedOrRejected ? 'text-red-500' : (isMe ? 'text-white' : 'text-primary');

      return (
        <div className={`flex flex-col gap-1 w-fit max-w-[260px] ${isMe ? 'items-end' : 'items-start'
          }`}>
          <div className={`flex items-center gap-2 text-sm font-semibold ${isMe ? 'text-white' : (isMissedOrRejected ? 'text-red-500' : 'text-text-primary')
            }`}>
            {isMissedOrRejected
              ? <PhoneMissed size={16} className={iconColor} />
              : (isVideo ? <Video size={16} className={iconColor} /> : <PhoneIncoming size={16} className={iconColor} />)
            }
            <span>{title}</span>
          </div>
          {durationStr && (
            <div className={`flex items-center gap-1.5 text-xs ${isMe ? 'text-white/70' : 'text-text-tertiary'
              }`}>
              <Phone size={12} />
              <span>{durationStr}</span>
            </div>
          )}
        </div>
      );
    }

    case 'voice':
      return (
        <div
          className={`flex items-center gap-3 p-3 rounded-2xl min-w-[200px] cursor-pointer transition-all duration-base ${isMe
            ? 'bg-bg-message-sent text-text-on-primary shadow-md'
            : 'bg-bg-message-received text-text-primary border border-border-light'
            }`}
          onClick={onToggleVoice}
        >
          <div className={`p-2.5 rounded-full shadow-sm transition-all duration-base ${isMe ? 'bg-bg-primary text-primary' : 'bg-primary text-white'
            }`}>
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-bold mb-0.5">Tin nhắn thoại</div>
            <div className={`flex items-center gap-1.5 opacity-80 ${isMe ? 'text-text-on-primary' : 'text-text-tertiary'}`}>
              <Mic size={12} />
              <span className="text-[11px]">Click để nghe</span>
            </div>
          </div>
        </div>
      );

    default:
      const renderTextWithMentions = (text: string) => {
        const combinedRegex = /(@\[[^\]]+\]|(?:https?:\/\/|www\.)[^\s]+)/g;
        const parts = text.split(combinedRegex);

        return parts.map((part, index) => {
          if (part.startsWith('@[') && part.endsWith(']')) {
            const name = part.slice(2, -1);
            return (
              <span key={index} className={`font-bold ${isMe ? 'text-white' : 'text-primary'}`}>
                @{name}
              </span>
            );
          }

          if (/^(https?:\/\/|www\.)/.test(part)) {
            const href = part.startsWith('www.') ? `https://${part}` : part;
            return (
              <a
                key={index}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`underline break-all transition-all duration-base hover:opacity-80 ${isMe ? 'text-white/90' : 'text-primary'}`}
                onClick={(e) => e.stopPropagation()}
              >
                {part}
              </a>
            );
          }

          return <span key={index}>{part}</span>;
        });
      };

      return (
        <div className="flex flex-col">
          <div className="whitespace-pre-wrap break-all">
            {renderTextWithMentions(message.data.content)}
          </div>
          {message.data.isEdited && !message.data.isRecalled && (
            <span className="text-[10px] opacity-70 mt-0.5">(đã chỉnh sửa)</span>
          )}
        </div>
      );
  }
};

export const MessageContent = React.memo(MessageContentInner);