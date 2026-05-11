import React from 'react';
import { Play, Image as ImageIcon } from 'lucide-react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyImage } from '../../../ui';
import { UploadBar } from './UploadBar';

interface ImageMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
  uploadProgress?: { progress: number; error?: boolean };
  onOpenImage: (index: number) => void;
}

/**
 * Hiển thị album ảnh hoặc ảnh đơn lẻ
 */
export const ImageMessage: React.FC<ImageMessageProps> = ({ 
  message, isMe, uploadProgress, onOpenImage 
}) => {
  const { media, content } = message.data;
  
  const mediaItems = media?.length
    ? media
    : content
      ? [{ url: content, fileName: '', mimeType: '', size: 0, isSensitive: false }]
      : [];
  
  const count = mediaItems.length;
  const validUrls = mediaItems.map(m => m.url).filter(Boolean);
  const isUploading = isMe && uploadProgress && validUrls.length === 0 && count > 0;

  if (count === 0 && validUrls.length === 0) return null;

  // Render thanh tải lên cho ảnh đơn đang upload
  if (isUploading && count === 1) {
    return (
      <div className="relative rounded-2xl overflow-hidden max-w-[280px] bg-bg-secondary aspect-square border border-border-light shadow-sm">
        <UploadBar progress={uploadProgress.progress} error={uploadProgress.error} light />
      </div>
    );
  }

  // Render album ảnh (nhiều hơn 1 ảnh)
  if (count > 1) {
    const renderItem = (item: any, idx: number) => {
      const isVid = item.mimeType?.startsWith('video/');
      return (
        <div
          key={`${message.id}-media-${idx}`}
          className="relative overflow-hidden cursor-pointer border border-border-light/30 aspect-square group"
          onClick={() => onOpenImage(idx)}
        >
          {isVid ? (
            item.thumbnailUrl
              ? <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              : <video src={item.url} className="w-full h-full object-cover" preload="metadata" playsInline muted />
          ) : (
            <LazyImage 
              src={item.url} 
              alt="media item" 
              className="w-full h-full object-cover" 
              wrapperClassName="w-full h-full" 
            />
          )}
          {isVid && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <Play size={14} className="text-text-primary ml-0.5 fill-current" />
              </div>
            </div>
          )}
        </div>
      );
    };

    const rowLayouts: Record<number, number[]> = {
      5: [3, 2],
      7: [4, 3],
      10: [4, 3, 3],
    };
    
    const singleGrid: Record<number, string> = {
      2: 'grid-cols-2',
      3: 'grid-cols-3',
      4: 'grid-cols-2',
      6: 'grid-cols-3',
      8: 'grid-cols-4',
      9: 'grid-cols-3',
    };

    const wrapperClass = "relative rounded-2xl overflow-hidden flex flex-col gap-0.5 w-full max-w-[320px] border border-border-light bg-bg-secondary shadow-sm";

    if (rowLayouts[count]) {
      const rows = rowLayouts[count];
      let offset = 0;
      return (
        <div className={wrapperClass}>
          {rows.map((cols, rowIdx) => {
            const start = offset;
            offset += cols;
            return (
              <div key={rowIdx} className={`grid grid-cols-${cols} gap-0.5`}>
                {mediaItems.slice(start, offset).map((item, i) => renderItem(item, start + i))}
              </div>
            );
          })}
          {isUploading && <UploadBar progress={uploadProgress.progress} error={uploadProgress.error} light />}
        </div>
      );
    }

    const cols = singleGrid[count] ?? 'grid-cols-3';
    return (
      <div className={`relative rounded-2xl overflow-hidden grid gap-0.5 ${cols} shadow-sm bg-bg-secondary w-full max-w-[320px] border border-border-light`}>
        {mediaItems.map((item, idx) => renderItem(item, idx))}
        {isUploading && <UploadBar progress={uploadProgress.progress} error={uploadProgress.error} light />}
      </div>
    );
  }

  // Render ảnh đơn lẻ đã upload xong
  const first = mediaItems[0];
  return (
    <div className="rounded-2xl overflow-hidden max-w-[280px] cursor-pointer group relative shadow-sm border border-border-light" onClick={() => onOpenImage(0)}>
      <LazyImage 
        src={first.url} 
        alt="sent image" 
        className="w-full h-auto object-cover" 
      />
      
      {isUploading && <UploadBar progress={uploadProgress.progress} error={uploadProgress.error} light />}
      
      <div className="absolute inset-0 bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/20 p-3 rounded-full backdrop-blur-sm">
          <ImageIcon className="text-white drop-shadow-md" size={24} />
        </div>
      </div>
    </div>
  );
};
