import React from 'react';
import { X, Play, Pause, Paperclip, Video } from 'lucide-react';
import { CircularProgressOverlay } from '../../ui/CircularProgress';

export interface FilePreviewItem {
  id: string;
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  uploadProgress?: number;
  duration?: number;
}

interface FilePreviewProps {
  files: FilePreviewItem[];
  onRemove: (index: number) => void;
  onPlayVoice: (url: string, index: number) => void;
  playingIndex: number | null;
  isSending: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  files, onRemove, onPlayVoice, playingIndex, isSending,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="px-3 pt-3 pb-2 border-b border-border-light bg-bg-primary overflow-x-auto scroll-hide">
      <div className="flex gap-2">
        {files.map((item, index) => (
          <div
            key={item.id}
            className="relative flex-shrink-0 group w-[68px] h-[68px] bg-bg-secondary rounded-xl border border-border-light overflow-hidden"
          >
            {item.preview ? (
              item.type === 'video' ? (
                <div className="w-full h-full relative">
                  <video src={item.preview} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Video size={16} className="text-white drop-shadow" />
                  </div>
                </div>
              ) : item.type === 'voice' ? (
                <button
                  type="button"
                  className="w-full h-full flex flex-col items-center justify-center gap-1"
                  onClick={() => item.preview && onPlayVoice(item.preview, index)}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200
                    ${playingIndex === index ? 'bg-primary text-white' : 'bg-bg-tertiary text-primary'}`}
                  >
                    {playingIndex === index
                      ? <Pause size={13} fill="currentColor" />
                      : <Play size={13} fill="currentColor" className="ml-0.5" />
                    }
                  </div>
                  <span className="text-[10px] text-text-tertiary font-medium">Voice</span>
                </button>
              ) : (
                <img src={item.preview} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary gap-1 p-1">
                <Paperclip size={16} />
                <span className="text-[10px] truncate w-full text-center font-medium">
                  {item.file.name.split('.').pop()?.toUpperCase()}
                </span>
              </div>
            )}

            {isSending && (item.type === 'image' || item.type === 'video') && (
              <CircularProgressOverlay
                isVisible
                progress={item.uploadProgress ?? 0}
                size={28}
                showPercentage={false}
              />
            )}

            {!isSending && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
