import React from 'react';
import { useNavigate } from 'react-router-dom';
import { parseTextWithMentions } from '../../../../utils/chatUtils';

import { extractFirstUrl } from '../../../../services/linkPreviewService';
import { LinkPreviewCard } from '../../../shared/LinkPreviewCard';

interface MessageTextContentProps {
  content: string;
  isMe: boolean;
  isEdited?: boolean;
}

/**
 * Thành phần hiển thị nội dung văn bản trong tin nhắn
 */
export const MessageTextContent: React.FC<MessageTextContentProps> = ({ content, isMe, isEdited }) => {
  const navigate = useNavigate();
  if (!content) return null;

  
  const parts = parseTextWithMentions(content);

  const renderContent = () => {
    return parts.map((part, index) => {
      if (part.startsWith('@[') && part.endsWith(']')) {
        const match = part.match(/@\[([^:]+):([^\]]+)\]/);
        if (match) {
          const [, userId, name] = match;
          return (
            <a key={index} href={`/profile/${userId}`}
              className={`font-bold hover:underline transition-all duration-200 text-primary`}
              onClick={(e) => e.stopPropagation()}
            >
              @{name}
            </a>
          );
        }
      }
      
      if (part.startsWith('@') && part.endsWith('\u200B')) {
        const name = part.slice(1, -1);
        return (
          <span key={index} className={`font-bold text-primary`}>
            @{name}
          </span>
        );
      }
      
      if (/^(https?:\/\/|www\.)/.test(part)) {
        const href = part.startsWith('www.') ? `https://${part}` : part;
        const isInternal = part.includes(window.location.host);
        
        return (
          <a key={index} href={href} 
            target={isInternal ? undefined : "_blank"} 
            rel={isInternal ? undefined : "noopener noreferrer"}
            className={`underline break-all transition-all duration-200 hover:opacity-80 text-primary`}
            onClick={(e) => {
              e.stopPropagation();
              if (isInternal) {
                e.preventDefault();
                const url = new URL(href);
                navigate(url.pathname + url.search);
              }
            }}

          >
            {part}
          </a>
        );
      }
      
      return <span key={index}>{part}</span>;
    });
  };

  const firstUrl = extractFirstUrl(content);

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
