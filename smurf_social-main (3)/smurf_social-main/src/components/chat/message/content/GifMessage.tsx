import React from 'react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyImage } from '../../../ui';

interface GifMessageProps {
  message: { id: string; data: RtdbMessage };
  onLoad?: () => void;
}

/**
 * Hiển thị tin nhắn GIF từ Giphy
 */
export const GifMessage: React.FC<GifMessageProps> = ({ message, onLoad }) => {
  const gifUrl = message.data.content;
  
  return (
    <div className="rounded-xl overflow-hidden max-w-[320px] max-h-[420px] shadow-md bg-bg-secondary border border-border-light animate-fade-in hover:shadow-lg transition-shadow duration-300 w-fit">
      <LazyImage 
        src={gifUrl} 
        alt="GIF" 
        className="max-w-full max-h-[420px] object-contain"
        wrapperClassName="w-full h-full"
        onLoad={onLoad}
      />
    </div>
  );
};
