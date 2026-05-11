import React from 'react';
import { MediaObject } from '../../../shared/types';
import { SensitiveMediaGuard } from '../ui';

interface ProfileMediaPreviewProps {
  media: MediaObject[];
  isBlocked: boolean;
  onSeeAll: () => void;
}

export const ProfileMediaPreview: React.FC<ProfileMediaPreviewProps> = ({ media, isBlocked, onSeeAll }) => {
  return (
    <div className="bg-bg-primary rounded-2xl border border-border-light p-4 hidden md:block">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-base text-text-primary">Ảnh/Video</h3>
        <button
          onClick={onSeeAll}
          className="text-xs text-primary font-semibold hover:underline transition-colors"
        >
          Xem tất cả
        </button>
      </div>

      {media.length > 0 && !isBlocked ? (
        <div className="grid grid-cols-3 gap-1.5">
          {media.map((item, idx) => (
            <div
              key={idx}
              className="aspect-square rounded-xl overflow-hidden bg-bg-secondary cursor-pointer group"
              onClick={onSeeAll}
            >
              <SensitiveMediaGuard isSensitive={item.isSensitive} size="xs" className="w-full h-full">
                {item.url.includes('.mp4') || item.url.includes('video') ? (
                  <video src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <img
                    src={item.url} alt=""
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </SensitiveMediaGuard>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary text-center py-2">
          Chưa có ảnh hoặc video nào
        </p>
      )}
    </div>
  );
};
