import React from 'react';
import { X, Play, Pause, Paperclip, Video } from 'lucide-react';
import { IconButton } from '../../ui';
import { CircularProgressOverlay } from '../../ui/CircularProgress';

export interface FilePreviewItem {
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  uploadProgress?: number;
}

interface FilePreviewProps {
  files: FilePreviewItem[];
  onRemove: (index: number) => void;
  onPlayVoice: (url: string, index: number) => void;
  playingIndex: number | null;
  isSending: boolean;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  files,
  onRemove,
  onPlayVoice,
  playingIndex,
  isSending,
}) => {
  if (files.length === 0) return null;

  return (
    <div className="px-3 pt-3 pb-2 border-b border-border-light bg-bg-primary overflow-x-auto">
      <div className="flex gap-2">
        {files.map((item, index) => (
          <div
            key={index}
            className="relative flex-shrink-0 group w-[72px] h-[72px] bg-bg-secondary rounded-xl border border-border-light overflow-hidden"
          >
            {item.preview ? (
              item.type === 'video' ? (
                <div className="w-full h-full relative">
                  <video src={item.preview} className="w-full h-full object-cover" playsInline muted />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Video size={18} className="text-white drop-shadow" />
                  </div>
                </div>
              ) : item.type === 'voice' ? (
                <div
                  className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer"
                  onClick={() => item.preview && onPlayVoice(item.preview, index)}
                >
                  <div className={`p-1.5 rounded-full transition-colors ${playingIndex === index ? 'bg-primary text-white' : 'bg-bg-tertiary text-primary'}`}>
                    {playingIndex === index
                      ? <Pause size={14} fill="currentColor" />
                      : <Play size={14} fill="currentColor" />
                    }
                  </div>
                  <span className="text-[9px] text-text-tertiary font-medium">Voice</span>
                </div>
              ) : (
                <img src={item.preview} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary gap-1 p-1">
                <Paperclip size={18} />
                <span className="text-[9px] truncate w-full text-center font-medium">
                  {item.file.name.split('.').pop()?.toUpperCase()}
                </span>
              </div>
            )}

            {isSending && (item.type === 'image' || item.type === 'video') && (
              <CircularProgressOverlay
                isVisible={true}
                progress={item.uploadProgress ?? 0}
                size={32}
                showPercentage={false}
              />
            )}

            {!isSending && (
              <IconButton
                onClick={() => onRemove(index)}
                className="absolute top-1 right-1 !w-5 !h-5 !min-w-0 !min-h-0 bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20 !rounded-full !p-0"
                icon={<X size={11} />}
                size="sm"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
