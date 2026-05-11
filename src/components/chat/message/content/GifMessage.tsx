import React from 'react';
import { RtdbMessage } from '../../../../../shared/types';
import { LazyImage } from '../../../ui';

interface GifMessageProps {
  message: { id: string; data: RtdbMessage };
}

/**
 * Hiển thị tin nhắn GIF từ Giphy
 */
export const GifMessage: React.FC<GifMessageProps> = ({ message }) => {
  const gifUrl = message.data.content;
  
  return (
    <div className="rounded-xl overflow-hidden max-w-[280px] shadow-md bg-bg-secondary border border-border-light animate-fade-in hover:shadow-lg transition-shadow duration-300">
      <LazyImage 
        src={gifUrl} 
        alt="GIF" 
        className="w-full h-auto object-contain"
        wrapperClassName="w-full h-full"
      />
    </div>
  );
};
