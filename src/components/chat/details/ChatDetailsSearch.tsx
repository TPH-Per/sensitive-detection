import React, { useState, useMemo } from 'react';
import { RtdbMessage, User, MessageType } from '../../../../shared/types';
import { Search, X, MessageCircle } from 'lucide-react';
import { formatTimeOnly } from '../../../utils/dateUtils';
import { Input, IconButton } from '../../ui';
import { PAGINATION } from '../../../constants';
import { parseSharedPostMessage } from '../../../utils/postShareMessage';

interface ChatDetailsSearchProps {
  messages: Array<{ id: string; data: RtdbMessage }>;
  usersMap: Record<string, User>;
  onMessageClick?: (messageId: string) => void;
}

const highlightText = (text: string, term: string): React.ReactNode => {
  if (!term.trim()) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="bg-warning/30 text-text-primary rounded px-0.5">{part}</mark>
      : part
  );
};

export const ChatDetailsSearch: React.FC<ChatDetailsSearchProps> = ({
  messages, usersMap, onMessageClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return messages
      .filter((msg) => {
        if (
          msg.data.type === MessageType.SYSTEM ||
          msg.data.type === MessageType.CALL ||
          msg.data.isRecalled
        ) {
          return false;
        }

        const sharedPostPayload = msg.data.type === MessageType.SHARE_POST
          ? parseSharedPostMessage(msg.data.content)
          : null;

        const contentToSearch = sharedPostPayload
          ? `${sharedPostPayload.authorName} ${sharedPostPayload.snippet}`.toLowerCase()
          : msg.data.content?.toLowerCase();

        const contentMatch = contentToSearch?.includes(term);
        const fileNameMatch = msg.data.type === MessageType.FILE &&
          (msg.data.media || []).some(m => m.fileName?.toLowerCase().includes(term));
        return contentMatch || fileNameMatch;
      })
      .sort((a, b) => b.data.createdAt - a.data.createdAt)
      .slice(0, PAGINATION.MESSAGES);
  }, [messages, searchTerm]);

  return (
    <div className="py-3">
      <p className="px-4 py-2 text-xs font-semibold text-text-tertiary uppercase tracking-wide">
        Tìm kiếm tin nhắn
      </p>

      {/* Search input */}
      <div className="px-4 mb-3">
        <Input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm trong cuộc trò chuyện..."
          icon={<Search size={15} />}
          rightElement={
            searchTerm ? (
              <IconButton
                onClick={() => setSearchTerm('')}
                icon={<X size={14} />}
                size="sm"
              />
            ) : undefined
          }
        />
      </div>

      {searchTerm ? (
        searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
            <MessageCircle size={28} className="mb-2 opacity-40" />
            <p className="text-sm">Không tìm thấy tin nhắn</p>
          </div>
        ) : (
          <div className="px-2 pb-4">
            <p className="px-2 text-xs text-text-tertiary mb-2">
              Tìm thấy {searchResults.length} tin nhắn
            </p>
            <div className="space-y-0.5">
              {searchResults.map((msg) => {
                const sender = usersMap[msg.data.senderId];
                return (
                  <button
                    key={msg.id}
                    onClick={() => onMessageClick?.(msg.id)}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-bg-hover active:bg-bg-active transition-colors duration-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-text-secondary">
                        {sender?.fullName || 'Unknown'}
                      </span>
                      <span className="text-[10px] text-text-tertiary">
                        {formatTimeOnly(msg.data.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-text-primary line-clamp-2 leading-relaxed">
                      {msg.data.type === 'file' ? (
                        <span className="flex items-center gap-1">
                          <span className="text-primary font-semibold shrink-0">[File]</span>
                          {highlightText(
                            msg.data.media?.find(m => m.fileName)?.fileName || msg.data.content,
                            searchTerm
                          )}
                        </span>
                      ) : msg.data.type === MessageType.SHARE_POST ? (
                        (() => {
                          const payload = parseSharedPostMessage(msg.data.content);
                          const text = payload
                            ? `[Chia sẻ bài viết] ${payload.authorName}: ${payload.snippet}`
                            : '[Chia sẻ bài viết]';
                          return highlightText(text, searchTerm);
                        })()
                      ) : (
                        highlightText(msg.data.content, searchTerm)
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
          <Search size={24} className="mb-2 opacity-40" />
          <p className="text-sm">Nhập từ khóa để tìm kiếm</p>
        </div>
      )}
    </div>
  );
};
