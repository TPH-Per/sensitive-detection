import React from 'react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyVideo } from '../../../ui';
import { UploadBar } from './UploadBar';

interface VideoMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress?: { progress: number; error?: boolean };
}

/**
 * Hiển thị tin nhắn video
 */
export const VideoMessage: React.FC<VideoMessageProps> = ({ 
  message, isMe, uploadProgress 
}) => {
  const videoUrl = message.data.media?.[0]?.url || '';
  const isUploading = isMe && uploadProgress && !videoUrl;

  if (isUploading) {
    return (
      <div className="relative rounded-2xl overflow-hidden max-w-[300px] border border-border-light shadow-sm bg-bg-secondary aspect-video">
        <UploadBar progress={uploadProgress.progress} error={uploadProgress.error} light />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden max-w-[300px] shadow-sm border border-border-light bg-black/5">
      <LazyVideo 
        src={videoUrl} 
        thumbnail={message.data.media?.[0]?.thumbnailUrl} 
        className="w-full h-auto max-h-[400px] object-contain flex" 
      />
    </div>
  );
};
