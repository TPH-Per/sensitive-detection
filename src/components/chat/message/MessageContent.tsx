import React from 'react';
import { FileText, Download, Image as ImageIcon, Play, Pause, Mic, PhoneIncoming, Phone, PhoneMissed, Video, FileVideo } from 'lucide-react';

import { RtdbMessage, MessageType } from '../../../../shared/types';
import { IconButton, LazyVideo, LazyImage } from '../../ui';
import { downloadFile } from '../../../utils';


interface MessageContentProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress: Record<string, { progress: number; error?: boolean }>;
  isPlaying: boolean;
  onToggleVoice: (e: React.MouseEvent) => void;
  onOpenImage: (index: number) => void;
  onCall?: () => void;
}

const MessageContentInner: React.FC<MessageContentProps> = ({
  message,
  isMe,
  uploadProgress,
  isPlaying,
  onToggleVoice,
  onOpenImage,
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
      const imageMedia = message.data.media && message.data.media.length > 0
        ? message.data.media
        : message.data.content
          ? [{ url: message.data.content, fileName: '', mimeType: '', size: 0, isSensitive: false }]
          : [];
      const mediaCount = imageMedia.length;
      const imageUrls = imageMedia.map(m => m.url).filter(Boolean);
      const isAlbum = mediaCount > 1;
      const isUploading = isMe && uploadProgress[message.id] && imageUrls.length === 0 && mediaCount > 0;

      if (mediaCount === 0 && imageUrls.length === 0) return null;

      if (isUploading) {
        if (isAlbum) {
          const placeholderCount = Math.min(4, mediaCount);
          return (
            <div className="relative rounded-xl overflow-hidden grid gap-0.5 grid-cols-2 border border-border-light shadow-sm bg-bg-secondary w-full max-w-full">
              {Array.from({ length: placeholderCount }).map((_, index) => (
                <div
                  key={`${message.id}-ph-${index}`}
                  className={`bg-bg-tertiary/60 ${mediaCount === 3 && index === 0 ? 'col-span-2 row-span-2 aspect-video' : 'aspect-square'}`}
                />
              ))}
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
            </div>
          );
        }

        return (
          <div className="relative rounded-lg overflow-hidden max-w-[280px] bg-bg-tertiary/60 aspect-square">
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
          </div>
        );
      }

      if (isAlbum) {
        const count = mediaCount;
        return (
          <div className="relative rounded-xl overflow-hidden grid gap-0.5 grid-cols-2 border border-border-light shadow-sm bg-bg-secondary w-full max-w-[320px]">
            {imageUrls.slice(0, 4).map((url, index) => {
              const isOverlay = index === 3 && count > 4;
              return (
                <div
                  key={`${message.id}-img-${index}`}
                  className={`relative overflow-hidden cursor-pointer ${count === 3 && index === 0 ? 'col-span-2 row-span-2 aspect-video' : 'aspect-square'}`}
                  onClick={() => onOpenImage(index)}
                >
                  <LazyImage
                    src={url}
                    alt="sent"
                    className="w-full h-full object-cover transition-all duration-base"
                  />
                  {isOverlay && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-bold">
                      +{count - 3}
                    </div>
                  )}
                </div>
              );
            })}
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
          </div>
        );
      }

      const imageUrl = imageUrls[0] || '';
      return (
        <div
          className="rounded-lg overflow-hidden max-w-[280px] cursor-pointer group relative"
          onClick={() => onOpenImage(0)}
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
      const fileData = message.data.media?.[0];
      const fileUrl = fileData?.url || '';
      const fileName = fileData?.fileName || 'Tài liệu';
      const fileMime = fileData?.mimeType || '';
      const fileSize = fileData?.size
        ? `${(fileData.size / 1024).toFixed(1)} KB`
        : 'N/A';
      const isFileUploading = isMe && uploadProgress[message.id] && !fileUrl;
      
      const isImageFile = fileMime.startsWith('image/');
      const isVideoFile = fileMime.startsWith('video/');

      if (isFileUploading) {
        return (
          <div className={`relative flex items-center gap-3 p-3 rounded-lg border w-full max-w-xs ${isMe ? 'bg-primary-light border-primary' : 'bg-bg-primary border-border-light'
            }`}>
            <div className={`p-2 rounded ${isMe ? 'bg-primary-light' : 'bg-secondary'}`}>
              <FileText size={24} className={isMe ? 'text-primary' : 'text-text-secondary'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate text-sm">{fileName}</div>
              <div className="text-xs opacity-70">{fileSize}</div>
            </div>
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
          </div>
        );
      }

      return (
        <div className={`flex flex-col gap-2 p-2 rounded-xl border max-w-[300px] ${isMe ? 'bg-primary-light/30 border-primary/20' : 'bg-bg-secondary border-border-light'}`}>
          {(isImageFile || isVideoFile) && fileUrl && (
            <div className="rounded-lg overflow-hidden cursor-pointer bg-black/5 aspect-video flex items-center justify-center" onClick={() => isImageFile ? onOpenImage(0) : null}>
               {isImageFile ? (
                 <LazyImage src={fileUrl} alt={fileName} className="w-full h-full object-cover" />
               ) : (
                 <div className="relative w-full h-full">
                    <LazyVideo src={fileUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                       <FileVideo size={32} className="text-white shadow-sm" />
                    </div>
                 </div>
               )}
            </div>
          )}
          
          <div className="flex items-center gap-3 p-1">
            <div className={`p-2 rounded-lg ${isMe ? 'bg-primary text-white' : 'bg-bg-tertiary text-text-secondary'}`}>
              <FileText size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate text-[13px]">{fileName}</div>
              <div className="text-[11px] opacity-60">{fileSize}</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadFile(fileUrl, fileName);
              }}
              className={`p-2 rounded-full transition-all duration-base ${isMe ? 'hover:bg-primary/10 text-primary' : 'hover:bg-black/5 text-text-secondary'}`}
              title="Tải về"
            >
              <Download size={18} />
            </button>
          </div>
          
          {isMe && uploadProgress[message.id] && (
            <div className="absolute inset-0 bg-bg-primary/80 flex flex-col items-center justify-center p-2 rounded-lg z-10">
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
      const videoUrl = message.data.media?.[0]?.url || '';
      const isVideoUploading = isMe && uploadProgress[message.id] && !videoUrl;

      if (isVideoUploading) {
        return (
          <div className="relative rounded-lg overflow-hidden max-w-[300px] border border-border-light shadow-sm bg-bg-tertiary/60 aspect-video">
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
          </div>
        );
      }

      return (
        <div className="rounded-lg overflow-hidden max-w-[300px] border border-border-light shadow-sm">
          <LazyVideo
            src={videoUrl}
            className="w-full h-auto max-h-[400px] object-contain"
          />
        </div>
      );

    case MessageType.CALL: {
      let parsed: { callType: 'voice' | 'video'; status: 'ended' | 'missed' | 'rejected' | 'started'; duration?: number };
      try { parsed = JSON.parse(message.data.content); }
      catch { parsed = { callType: 'voice', status: 'missed' }; }

      const { callType, status, duration } = parsed;
      const isVideo = callType === 'video';

      // Nhãn tiêu đề
      let title = '';
      if (status === 'started') {
        title = isVideo ? 'Cuộc gọi video đang diễn ra' : 'Cuộc gọi thoại đang diễn ra';
      } else if (status === 'ended') {
        const typeStr = isVideo ? 'video' : 'thoại';
        title = isMe ? `Cuộc gọi ${typeStr} đi` : `Cuộc gọi ${typeStr} đến`;
      } else if (status === 'missed') {
        title = isVideo ? 'Cuộc gọi video nhỡ' : 'Cuộc gọi thoại nhỡ';
      } else {
        title = isVideo ? 'Cuộc gọi video bị từ chối' : 'Cuộc gọi thoại bị từ chối';
      }


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
          {status === 'started' ? (
            <button
              onClick={() => {
                const event = new CustomEvent('join-active-call', {
                  detail: {
                    senderId: message.data.senderId,
                    msgId: message.id
                  }
                });
                window.dispatchEvent(event);
              }}
              className={`mt-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${isMe
                ? 'bg-white text-primary hover:bg-white/90'
                : 'bg-primary text-white hover:bg-primary-dark'
                }`}
            >
              Tham gia
            </button>
          ) : (
            onCall && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCall();
                }}
                className={`mt-2 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all outline-none ${isMe
                  ? 'bg-white/20 text-white hover:bg-white/30'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
              >
                {isVideo ? <Video size={12} /> : <Phone size={12} />}
                <span>{isVideo ? 'Gọi video lại' : 'Gọi lại'}</span>
              </button>
            )
          )}
        </div>
      );
    }

    case 'voice':
      const voiceUrl = message.data.media?.[0]?.url || '';
      const isVoiceUploading = isMe && uploadProgress[message.id] && !voiceUrl;
      if (isVoiceUploading) {
        return (
          <div
            className={`flex items-center gap-3 p-3 rounded-2xl min-w-[200px] transition-all duration-base ${isMe
              ? 'bg-bg-message-sent text-text-on-primary shadow-md'
              : 'bg-bg-message-received text-text-primary border border-border-light'
              }`}
          >
            <div className={`p-2.5 rounded-full shadow-sm transition-all duration-base ${isMe ? 'bg-bg-primary text-primary' : 'bg-primary text-white'
              }`}>
              <Pause size={18} />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-bold mb-0.5">Tin nhắn thoại</div>
              <div className={`flex items-center gap-1.5 opacity-80 ${isMe ? 'text-text-on-primary' : 'text-text-tertiary'}`}>
                <Mic size={12} />
                <span className="text-[11px]">{uploadProgress[message.id].error ? 'Lỗi tải lên' : `Đang tải ${Math.round(uploadProgress[message.id].progress)}%`}</span>
              </div>
            </div>
          </div>
        );
      }

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
        const combinedRegex = /(@\[[^:]+:[^\]]+\]|(?:https?:\/\/|www\.)[^\s]+)/g;
        const parts = text.split(combinedRegex);

        return parts.map((part, index) => {
          if (part.startsWith('@[') && part.endsWith(']')) {
            const match = part.match(/@\[([^:]+):([^\]]+)\]/);
            if (match) {
              const [_, userId, name] = match;
              return (
                <a
                  key={index}
                  href={`/profile/${userId}`}
                  className={`font-bold hover:underline transition-all duration-base ${isMe ? 'text-white' : 'text-primary'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Prevent default if you use a router link instead of a tag
                  }}
                >
                  @{name}
                </a>
              );
            }
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
