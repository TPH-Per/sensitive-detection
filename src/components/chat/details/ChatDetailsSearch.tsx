import React, { useState, useMemo } from 'react';
import { RtdbMessage, User } from '../../../types';
import { Search, X, MessageCircle } from 'lucide-react';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { Input, IconButton } from '../../ui';
import { PAGINATION } from '../../../constants';

interface ChatDetailsSearchProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  usersMap: Record<string, User>;
  onMessageClick?: (messageId: string) => void;
}

export const ChatDetailsSearch: React.FC<ChatDetailsSearchProps> = ({
  messages,
  usersMap,
  onMessageClick
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    return messages
      .filter((msg) => {
        const contentMatch = msg.data.content?.toLowerCase().includes(term);
        const fileNameMatch = msg.data.type === 'file' && msg.data.media?.[0]?.fileName?.toLowerCase().includes(term);
        return contentMatch || fileNameMatch;
      })
      .sort((a, b) => b.data.createdAt - a.data.createdAt)
      .slice(0, PAGINATION.MESSAGES);
  }, [messages, searchTerm]);

  const highlightText = (text: string, term: string) => {
    if (!term.trim()) return text;

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase()
        ? <mark key={i} className="bg-warning-light dark:bg-warning/30 rounded px-0.5">{part}</mark>
        : part
    );
  };

  return (
    <div className="py-4">
      <h3 className="px-4 text-sm font-semibold text-text-secondary mb-3">
        Tìm kiếm tin nhắn
      </h3>

      {/* Search Input */}
      <div className="px-4 mb-3">
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setIsSearching(true)}
          placeholder="Tìm trong cuộc trò chuyện..."
          icon={<Search size={16} />}
          rightElement={searchTerm ? (
            <IconButton
              onClick={() => setSearchTerm('')}
              icon={<X size={16} />}
              size="sm"
            />
          ) : undefined}
        />
      </div>

      {/* Search Results */}
      {isSearching && searchTerm && (
        <div className="flex flex-col">
          {searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
              <MessageCircle size={32} className="mb-2 opacity-50" />
              <p className="text-sm">Không tìm thấy tin nhắn</p>
            </div>
          ) : (
            <div className="space-y-1 px-2 pb-4">
              <p className="px-2 text-xs text-text-tertiary mb-2">
                Tìm thấy {searchResults.length} tin nhắn
              </p>
              {searchResults.map((msg) => {
                const sender = usersMap[msg.data.senderId];
                return (
                  <button
                    key={msg.id}
                    onClick={() => onMessageClick?.(msg.id)}
                    className="w-full text-left p-3 rounded-lg hover:bg-bg-hover active:bg-bg-active transition-all duration-base"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-text-secondary">
                        {sender?.fullName || 'Unknown'}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {formatTimeOnly(msg.data.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-text-primary line-clamp-2">
                      {msg.data.type === 'file' ? (
                        <span className="flex items-center gap-1">
                          <span className="text-primary font-medium shrink-0">[File]</span>
                          {highlightText(msg.data.media?.[0]?.fileName || msg.data.content, searchTerm)}
                        </span>
                      ) : (
                        highlightText(msg.data.content, searchTerm)
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!isSearching && !searchTerm && (
        <div className="flex flex-col items-center justify-center py-6 text-text-tertiary">
          <Search size={24} className="mb-2 opacity-50" />
          <p className="text-sm">Nhập từ khóa để tìm kiếm</p>
        </div>
      )}
    </div>
  );
};
