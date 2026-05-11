import React from 'react';

interface RecalledMessageProps {
  isMe: boolean;
}

/**
 * Hiển thị thông báo tin nhắn đã bị thu hồi
 */
export const RecalledMessage: React.FC<RecalledMessageProps> = ({ isMe }) => (
  <div className={`italic text-[13px] font-medium py-0.5 opacity-70 ${
    isMe ? 'text-text-primary' : 'text-text-tertiary'
  }`}>
    Tin nhắn đã thu hồi
  </div>
);
