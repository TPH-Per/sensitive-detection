import React from 'react';
import { RtdbMessage } from '../../../../../shared/types';
import { MessageTextContent } from './MessageTextContent';

interface TextMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
}

/**
 * Hiển thị nội dung tin nhắn văn bản
 */
export const TextMessage: React.FC<TextMessageProps> = ({ message, isMe }) => {
  const { content, isEdited } = message.data;

  return (
    <MessageTextContent 
      content={content} 
      isMe={isMe} 
      isEdited={!!isEdited} 
    />
  );
};
