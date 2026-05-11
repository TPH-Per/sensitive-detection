import React from 'react';
import { PostType, MediaObject } from '../../../../shared/types';
import { LazyImage } from '../../ui';

interface SystemPostMediaProps {
  type: PostType.AVATAR_UPDATE | PostType.COVER_UPDATE;
  media: MediaObject[];
  variant?: 'feed' | 'cinema';
  onClick?: () => void;
}

export const SystemPostMedia: React.FC<SystemPostMediaProps> = ({
  type,
  media,
  variant = 'feed',
  onClick
}) => {
  const mainMedia = media[0];
  if (!mainMedia) return null;

  const isAvatar = type === PostType.AVATAR_UPDATE;
  const isCinema = variant === 'cinema';

  return (
    <div
      className={`relative w-full overflow-hidden cursor-pointer ${isCinema ? 'h-full flex items-center justify-center bg-black' : 'bg-bg-secondary/30 border-y border-border-light'}`}
      onClick={onClick}
    >
      {/* Nền mờ chỉ xuất hiện ở chế độ Cinema để lấp đầy không gian trống */}
      {isCinema && (
        <div
          className="absolute inset-0 z-0 blur-3xl opacity-40 scale-110 pointer-events-none"
          style={{
            backgroundImage: `url(${mainMedia.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      <div className={`relative z-10 w-full flex items-center justify-center ${isAvatar ? (isCinema ? 'p-12' : 'py-8 md:py-12') : ''}`}>
        {isAvatar ? (
          <div className={`relative rounded-full border-[8px] border-bg-primary shadow-xl overflow-hidden ${isCinema ? 'w-64 h-64 sm:w-80 sm:h-80 md:w-[450px] md:h-[450px]' : 'w-60 h-60 sm:w-80 sm:h-80'}`}>
            <LazyImage
              src={mainMedia.url}
              alt="Avatar update"
              className="w-full h-full object-cover"
              wrapperClassName="w-full h-full"
            />
          </div>
        ) : (
          <div className={`relative w-full overflow-hidden ${isCinema ? 'aspect-video md:aspect-[21/9] max-w-5xl shadow-2xl' : 'aspect-video sm:aspect-[21/9]'}`}>
            <LazyImage
              src={mainMedia.url}
              alt="Cover update"
              className="w-full h-full object-cover"
              wrapperClassName="w-full h-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};
