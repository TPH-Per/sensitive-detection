import React, { useState, useCallback } from 'react';
import { Users, ChevronDown, MessageCircle, Archive } from 'lucide-react';
import { RtdbConversation, RtdbUserChat, User } from '../../../types';
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
  onBlock?: (partnerId: string) => void;
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

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  currentUserId,
  currentUserFriendIds = [],
  blockedUserIds = [],
  isLoading,
  onSelectConversation,
  onSearch,
  onPin,
  onMute,
  onDelete,
  onBlock,
  onArchive,
  onMarkUnread,
  onViewProfile,
  onNewChat,
  onNewGroup,
  viewMode = 'normal',
  archivedCount = 0,
  onViewModeChange,
  isSearchFocused = false,
  onSearchFocus,
  onSelectUser,
  searchResults = { conversations: [], users: [] },
  searchHistory = [],
  onRemoveFromHistory,
  onClearHistory,
  onMarkAllRead
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [requestsExpanded, setRequestsExpanded] = useState(true);

  // Phân nhóm và lọc hội thoại
  const {
    friendConversations,
    requestConversations,
    displayConversations
  } = useConversationGroups({
    conversations,
    currentUserId,
    currentUserFriendIds,
    blockedUserIds,
    viewMode: (viewMode || 'normal') as 'normal' | 'archived',
    activeFilter
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

  const renderConversationItem = useCallback((conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat }) => {
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
        onBlock={partnerId && onBlock ? () => onBlock(partnerId) : undefined}
        onArchive={onArchive}
        onMarkUnread={onMarkUnread}
        onViewProfile={partnerId && onViewProfile ? () => onViewProfile(partnerId) : undefined}
      />
    );
  }, [
    currentUserId,
    selectedId,
    currentUserFriendIds,
    onSelectConversation,
    onPin,
    onMute,
    onDelete,
    onBlock,
    onArchive,
    onMarkUnread
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

      {!isSearchFocused && !searchTerm && (
        viewMode === 'normal' ? (
          <ConversationFilters
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
          />
        ) : (
          <div className="flex-shrink-0 flex items-center px-4 h-12 bg-bg-secondary border-b border-border-light">
            <span className="text-sm font-bold text-text-secondary flex items-center gap-2">
              <Archive size={16} />
              Hội thoại đã lưu trữ
            </span>
          </div>
        )
      )}

      {/* List Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && conversations.length === 0 ? (
          <div className="p-2 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                <Skeleton variant="circle" width={48} height={48} />
                <div className="flex-1 space-y-2">
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="80%" height={14} />
                </div>
              </div>
            ))}
          </div>
        ) : isSearchFocused ? (
          <SearchResults
            searchTerm={searchTerm}
            results={searchResults}
            currentUserId={currentUserId}
            selectedId={selectedId}
            history={searchHistory}
            onSelectConversation={(id) => {
              onSelectConversation(id);
              onSearchFocus?.(false);
            }}
            onSelectUser={(user) => {
              onSelectUser?.(user);
              onSearchFocus?.(false);
            }}
            onRemoveFromHistory={onRemoveFromHistory || (() => { })}
            onClearHistory={onClearHistory || (() => { })}
            isLoading={isLoading && searchTerm !== ''}
            conversations={conversations}
          />
        ) : (friendConversations.length === 0 && requestConversations.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-4">
              <Users size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {searchTerm ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
            </h3>
            <p className="text-sm text-text-secondary">
              {searchTerm ? 'Thử tìm kiếm với từ khóa khác' : 'Bắt đầu trò chuyện với bạn bè'}
            </p>
          </div>
        ) : (
          <div>
            {/* Người lạ Section */}
            {viewMode === 'normal' && activeFilter === 'all' && requestConversations.length > 0 && (
              <>
                <button
                  onClick={() => setRequestsExpanded(!requestsExpanded)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-bg-tertiary border-b border-border-light hover:bg-bg-hover active:bg-bg-active transition-all duration-base"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <MessageCircle size={16} className="text-primary" />
                    Người lạ
                    <span className="text-[10px] bg-primary text-text-on-primary px-1.5 py-0.5 rounded-full min-w-[18px]">
                      {requestConversations.length}
                    </span>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-text-secondary transition-transform duration-base ${requestsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {requestsExpanded && (
                  <div>{requestConversations.map(renderConversationItem)}</div>
                )}
              </>
            )}

            {/* Main List */}
            {displayConversations.map(renderConversationItem)}
          </div>
        )}
      </div>
    </div>
  );
};
