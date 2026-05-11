import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { IconButton, LazyImage, SensitiveMediaGuard } from '../../ui';
import { MediaObject } from '../../../../shared/types';

interface MediaItem {
  url: string;
  type: string;
  thumbnailUrl?: string;
  isSensitive?: boolean;
}

interface PostMediaGridProps {
  media: MediaObject[];
  onClick?: () => void;
  onItemClick?: (index: number) => void;
}

const PostMediaGridInner: React.FC<PostMediaGridProps> = ({
  media, onClick, onItemClick
}) => {
  const allMedia = useMemo<MediaItem[]>(() =>
    media.map(m => ({
      url: m.url,
      type: m.mimeType.startsWith('video') ? 'video' : 'image',
      thumbnailUrl: m.thumbnailUrl,
      isSensitive: m.isSensitive
    }))
    , [media]);

  if (allMedia.length === 0) return null;

  const count = allMedia.length;

  const renderMediaItem = (item: MediaItem, index: number, className: string = '', overlay?: React.ReactNode) => {
    const isBlob = item.url.startsWith('blob:');

    return (
      <SensitiveMediaGuard
        isSensitive={item.isSensitive}
        className={`relative group overflow-hidden bg-bg-tertiary cursor-pointer ${className}`}
      >
        <div
          className="w-full h-full"
          onClick={(e) => {
            if (onItemClick) {
              e.stopPropagation();
              onItemClick(index);
            }
          }}
        >
          {item.type === 'video' ? (
            <video
              src={item.url}
              poster={item.thumbnailUrl}
              className={`w-full h-full object-cover ${isBlob ? 'blur-[2px] opacity-70' : ''}`}
              controls={!isBlob}
              playsInline
              muted={isBlob}
              preload="none"
            />
          ) : (
            <LazyImage
              src={item.url}
              placeholder={item.thumbnailUrl}
              alt=""
              className={`w-full h-full object-cover ${isBlob ? 'blur-[2px] opacity-70' : ''}`}
              wrapperClassName="w-full h-full"
            />
          )}



          {!isBlob && item.type === 'video' && (
            <div className="absolute top-2 right-2 p-1 bg-black/20 backdrop-blur-md rounded-full text-white pointer-events-none group-hover:opacity-0 transition-opacity">
              <IconButton icon={<ChevronRight size={14} fill="white" className="pointer-events-none" />} size="sm" className="!bg-transparent" />
            </div>
          )}

          {overlay}
        </div>
      </SensitiveMediaGuard>
    );
  };

  if (count === 1) {
    const item = allMedia[0];
    const isBlob = item.url.startsWith('blob:');

    return (
      <div className="bg-bg-secondary relative select-none overflow-hidden">
        <SensitiveMediaGuard isSensitive={item.isSensitive}>
          <div
            className="relative group cursor-pointer bg-black/5 flex items-center justify-center overflow-hidden max-h-[600px]"
            onClick={(e) => {
              if (onItemClick) {
                e.stopPropagation();
                onItemClick(0);
              } else if (onClick) {
                onClick();
              }
            }}
          >
            <div
              className={`absolute inset-0 blur-2xl grayscale pointer-events-none transition-opacity duration-700 ${isBlob ? 'opacity-10' : 'opacity-20'}`}
              style={{ backgroundImage: `url(${item.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />

            {item.type === 'video' ? (
              <video
                src={item.url}
                poster={item.thumbnailUrl}
                className={`relative z-10 w-full h-auto max-h-[600px] object-contain transition-all duration-300 ${isBlob ? 'blur-[2px] opacity-70' : ''}`}
                controls={!isBlob}
                playsInline
                muted={isBlob}
                preload="none"
              />
            ) : (
              <LazyImage
                src={item.url}
                placeholder={item.thumbnailUrl}
                alt=""
                className={`relative z-10 w-full h-auto max-h-[600px] object-contain transition-all duration-300 ${isBlob ? 'blur-[2px] opacity-70' : ''}`}
              />
            )}


          </div>
        </SensitiveMediaGuard>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary relative select-none overflow-hidden">
      <div
        className={`grid gap-0.5 aspect-[4/3] sm:aspect-video cursor-pointer ${count === 2 ? 'grid-cols-2' :
          count === 3 ? 'grid-cols-2 grid-rows-2' :
            'grid-cols-2 grid-rows-2'
          }`}
        onClick={onClick}
      >
        {allMedia.slice(0, 4).map((item, idx) => {
          const isLarge = count === 3 && idx === 0;
          const isLast = idx === 3 && count > 4;

          const overlay = isLast ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-white z-10 group-hover:bg-black/30 transition-all">
              <span className="text-3xl font-bold drop-shadow-lg">+{count - 4}</span>
              <span className="text-xs uppercase tracking-wider font-semibold opacity-80">Xem thêm</span>
            </div>
          ) : null;

          return (
            <React.Fragment key={idx}>
              {renderMediaItem(item, idx, isLarge ? 'row-span-2' : '', overlay)}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export const PostMediaGrid = React.memo(PostMediaGridInner);
