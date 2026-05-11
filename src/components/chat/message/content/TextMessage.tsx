import React from 'react';
import { MessageType, RtdbMessage } from '../../../../../shared/types';
import { LinkPreviewCard } from '../../../shared/LinkPreviewCard';
import { extractFirstUrl } from '../../../../services/linkPreviewService';
import { parseTextWithMentions } from '../../../../utils/chatUtils';
import { parseSharedPostMessage } from '../../../../utils/postShareMessage';
import { SharedPostMessage } from './SharedPostMessage';

interface TextMessageProps {
  message: { id: string; data: RtdbMessage };
  isMe: boolean;
}

/**
 * Hiển thị nội dung tin nhắn văn bản, bao gồm Mentions và Link Preview
 */
export const TextMessage: React.FC<TextMessageProps> = ({ message, isMe }) => {
  const { content, isEdited } = message.data;
  const isSharedPost = message.data.type === MessageType.SHARE_POST;
  const sharedPostPayload = isSharedPost ? parseSharedPostMessage(content) : null;

  if (sharedPostPayload) {
    const hasReactions = !!(message.data.reactions && Object.keys(message.data.reactions).length > 0);
    return (
      <SharedPostMessage
        payload={sharedPostPayload}
        isMe={isMe}
        isEdited={!!isEdited}
        timestamp={message.data.createdAt}
        hasReactions={hasReactions}
      />
    );
  }

  if (isSharedPost) {
    return (
      <div className="text-xs italic opacity-70">
        Nội dung chia sẻ bài viết không hợp lệ
      </div>
    );
  }

  const parts = parseTextWithMentions(content);

  const renderContent = () => {
    return parts.map((part, index) => {
      // Handlers cho Mentions @[userId:Name]
      if (part.startsWith('@[') && part.endsWith(']')) {
        const match = part.match(/@\[([^:]+):([^\]]+)\]/);
        if (match) {
          const [, userId, name] = match;
          return (
            <a key={index} href={`/profile/${userId}`}
              className="font-bold hover:underline transition-all duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              @{name}
            </a>
          );
        }
      }
      
      // Handlers cho plain text mentions (kết thúc bằng zero-width space)
      if (part.startsWith('@') && part.endsWith('\u200B')) {
        const name = part.slice(1, -1);
        return (
          <span key={index} className="font-bold">
            @{name}
          </span>
        );
      }
      
      // Handlers cho URLs
      if (/^(https?:\/\/|www\.)/.test(part)) {
        const href = part.startsWith('www.') ? `https://${part}` : part;
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer"
            className={`underline break-all transition-all duration-200 hover:opacity-80 ${isMe ? 'text-black/80 dark:text-white/90' : 'text-primary'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      
      return <span key={index}>{part}</span>;
    });
  };

  const firstUrl = isSharedPost ? null : extractFirstUrl(content);

  return (
    <div className="flex flex-col min-w-0 w-full">
      <div className="whitespace-pre-wrap break-words leading-snug">
        {renderContent()}
      </div>
      
      {isEdited && (
        <span className="text-[10px] opacity-60 mt-1 italic">(đã chỉnh sửa)</span>
      )}
      
      {firstUrl && (
        <LinkPreviewCard
          url={firstUrl}
          compact
          className="mt-2 shadow-sm border border-border-light/50"
        />
      )}
    </div>
  );
};
