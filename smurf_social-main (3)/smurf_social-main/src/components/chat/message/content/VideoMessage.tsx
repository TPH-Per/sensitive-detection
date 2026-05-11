import React from 'react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyVideo, CircularProgressOverlay } from '../../../ui';

interface VideoMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress?: { progress: number; error?: boolean; localUrls?: string[] };
  onLoad?: () => void;
}

export const VideoMessage: React.FC<VideoMessageProps> = ({ 
  message, isMe, uploadProgress, onLoad 
}) => {
  const isUploading = isMe && uploadProgress && uploadProgress.progress < 100;
  
  // Ưu tiên dùng Blob URL khi đang upload để thấy preview ngay lập tức
  const videoUrl = (isUploading && uploadProgress?.localUrls?.[0]) 
    ? uploadProgress.localUrls[0] 
    : message.data.media?.[0]?.url || message.data.content;
    
  const thumbnailUrl = message.data.media?.[0]?.thumbnailUrl;

  React.useEffect(() => {
    if (videoUrl && onLoad) {
      onLoad(); // Ensure timestamp shows immediately for videos since they might not trigger native image onLoad
    }
  }, [videoUrl, onLoad]);

  if (!videoUrl) return null;

  return (
    <div className="rounded-xl overflow-hidden max-w-[320px] max-h-[420px] bg-black/5 relative shadow-sm border border-border-light w-fit">
      <LazyVideo
        src={videoUrl}
        thumbnail={thumbnailUrl}
        className="max-w-full max-h-[420px] object-contain"
        autoPlay={!isUploading} 
        muted
        loop
        controls={!isUploading} 
      />
      
      <CircularProgressOverlay isVisible={isUploading} progress={uploadProgress?.progress || 0} size="md" />
    </div>
  );
};
