import React, { useState } from 'react';

interface TruncatedTextProps {
  content: string;
  threshold?: number;
  className?: string;
  expandClassName?: string;
}

const URL_SPLIT_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+)/gi;

function renderWithLinks(text: string): React.ReactNode[] {
  const parts = text.split(URL_SPLIT_PATTERN);
  return parts.map((part, i) => {
    if (/^(?:https?:\/\/|www\.)/i.test(part)) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export const TruncatedText: React.FC<TruncatedTextProps> = ({
  content,
  threshold = 300,
  className = '',
  expandClassName = 'text-primary font-semibold cursor-pointer hover:underline ml-1.5 text-sm transition-colors duration-200',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = content.length > threshold;
  const displayContent = !shouldTruncate || isExpanded
    ? content
    : content.slice(0, threshold) + '…';

  return (
    <span className={className}>
      {renderWithLinks(displayContent)}
      {shouldTruncate && (
        <span onClick={() => setIsExpanded(!isExpanded)} className={expandClassName}>
          {isExpanded ? 'Thu gọn' : 'Xem thêm'}
        </span>
      )}
    </span>
  );
};
