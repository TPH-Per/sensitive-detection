import React, { useState, useCallback } from 'react';
import { Users, Archive } from 'lucide-react';
import { RtdbConversation, RtdbUserChat, User } from '../../../../shared/types';
import { ConversationItem } from './ConversationItem';
import { SearchResults } from './SearchResults';
import { Skeleton } from '../../ui/Skeleton';
import { useConversationGroups } from '../../../hooks/chat/useConversationGroups';
import { ConversationHeader } from './ConversationHeader';
import { ConversationFilters, FilterType } from './ConversationFilters';

interface ConversationListProps {
  conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
  selectedId: string | null;
  currentUserId: string;
  currentUserFriendIds?: string[];
  blockedUserIds?: string[];
  isLoading: boolean;
  isSearching?: boolean;
  onSelectConversation: (id: string) => void;
  onSearch: (term: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onMute: (id: string, muted: boolean) => void;
  onDelete: (id: string) => void;
  onBlock?: (partnerId: string, partnerName: string) => void;
  onArchive?: (id: string, archived: boolean) => void;
  onMarkUnread?: (id: string, markedUnread: boolean) => void;
  onViewProfile?: (userId: string) => void;
  onNewChat?: () => void;
  onNewGroup?: () => void;
  viewMode?: 'normal' | 'archived';
  archivedCount?: number;
  onViewModeChange?: (mode: 'normal' | 'archived') => void;
  isSearchFocused?: boolean;
  onSearchFocus?: (focused: boolean) => void;
  onSelectUser?: (user: User) => void;
  searchResults?: {
    conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
    users: User[];
  };
  searchHistory?: (User | { id: string; data: RtdbConversation; userChat: RtdbUserChat })[];
  onRemoveFromHistory?: (id: string) => void;
  onClearHistory?: () => void;
  onMarkAllRead?: () => void;
}

export const ConversationList = React.memo<ConversationListProps>(({
  conversations, selectedId, currentUserId,
  currentUserFriendIds = [], blockedUserIds = [],
  isLoading, onSelectConversation, onSearch,
  onPin, onMute, onDelete, onBlock, onArchive, onMarkUnread,
  onViewProfile, onNewChat, onNewGroup,
  viewMode = 'normal', archivedCount = 0, onViewModeChange,
  isSearchFocused = false, onSearchFocus, onSelectUser,
  searchResults = { conversations: [], users: [] },
  searchHistory = [], onRemoveFromHistory, onClearHistory, onMarkAllRead,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const { friendConversations, requestConversations, displayConversations } = useConversationGroups({
    conversations, currentUserId, currentUserFriendIds, blockedUserIds,
    viewMode: (viewMode || 'normal') as 'normal' | 'archived',
    activeFilter,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearch(value);
  };

  const handleCancelSearch = () => {
    setSearchTerm('');
    onSearch('');
    onSearchFocus?.(false);
  };

  const renderConversationItem = useCallback((
    conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat }
  ) => {
    const participantIds = Object.keys(conversation.data.members);
    const partnerId = conversation.data.isGroup
      ? null
      : participantIds.find(id => id !== currentUserId);

    return (
      <ConversationItem
        key={conversation.id}
        conversation={conversation}
        isActive={conversation.id === selectedId}
        currentUserId={currentUserId}
        currentUserFriendIds={currentUserFriendIds}
        showMessageRequestBadge={false}
        onClick={() => onSelectConversation(conversation.id)}
        onPin={onPin}
        onMute={onMute}
        onDelete={() => onDelete(conversation.id)}
        onBlock={partnerId && onBlock ? onBlock : undefined}
        onArchive={onArchive}
        onMarkUnread={onMarkUnread}
        onViewProfile={partnerId && onViewProfile ? () => onViewProfile(partnerId) : undefined}
      />
    );
  }, [
    currentUserId, selectedId, currentUserFriendIds,
    onSelectConversation, onPin, onMute, onDelete,
    onBlock, onArchive, onMarkUnread, onViewProfile,
  ]);

  return (
    <div className="flex flex-col h-full w-full bg-bg-primary border-r border-border-light transition-theme">
      <ConversationHeader
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        onClearSearch={() => { setSearchTerm(''); onSearch(''); }}
        isSearchFocused={isSearchFocused}
        onSearchFocus={(focused) => onSearchFocus?.(focused)}
        onCancelSearch={handleCancelSearch}
        onNewGroup={onNewGroup}
        onNewChat={onNewChat}
        viewMode={viewMode || 'normal'}
        onViewModeChange={onViewModeChange}
        archivedCount={archivedCount}
        onMarkAllRead={onMarkAllRead}
      />

      {/* Filter bar / archive label */}
      {!isSearchFocused && !searchTerm && (
        viewMode === 'normal' ? (
          <ConversationFilters
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onMarkAllRead={onMarkAllRead}
            strangerCount={requestConversations.length}
          />
        ) : (
          <div className="flex-shrink-0 flex items-center px-4 h-10 bg-bg-secondary border-b border-border-light">
            <span className="text-xs font-semibold text-text-secondary flex items-center gap-2">
              <Archive size={14} />
              Hội thoại đã lưu trữ
            </span>
          </div>
        )
      )}

      <div className="flex-1 overflow-y-auto scroll-hide">
        {isLoading && conversations.length === 0 ? (
          <div className="p-1 pt-2">
            {[...Array(6)].map((_, i) => (
              <ConversationItem.Skeleton key={i} />
            ))}
          </div>
        ) : isSearchFocused ? (
          <SearchResults
            searchTerm={searchTerm}
            results={searchResults}
            currentUserId={currentUserId}
            selectedId={selectedId}
            history={searchHistory}
            onSelectConversation={(id) => { onSelectConversation(id); onSearchFocus?.(false); }}
            onSelectUser={(user) => { onSelectUser?.(user); onSearchFocus?.(false); }}
            onRemoveFromHistory={onRemoveFromHistory}
            onClearHistory={onClearHistory}
            isLoading={isLoading && searchTerm !== ''}
            conversations={conversations}
          />
        ) : (friendConversations.length === 0 && requestConversations.length === 0) ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4 border border-border-light">
              <Users size={26} className="text-text-tertiary" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-1">
              {searchTerm ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
            </h3>
            <p className="text-xs text-text-secondary">
              {searchTerm ? 'Thử tìm kiếm với từ khóa khác' : 'Bắt đầu trò chuyện với bạn bè'}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {/* Stranger tab */}
            {activeFilter === 'stranger' ? (
              requestConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 mt-8">
                  <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
                    <Users size={22} className="text-text-tertiary" />
                  </div>
                  <p className="text-sm text-text-secondary">Không có tin nhắn từ người lạ</p>
                </div>
              ) : (
                requestConversations.map(renderConversationItem)
              )
            ) : (
              displayConversations.map(renderConversationItem)
            )}
          </div>
        )}
      </div>
    </div>
  );
});
