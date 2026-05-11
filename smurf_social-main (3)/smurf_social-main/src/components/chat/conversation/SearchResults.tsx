import React from 'react';
import { Search, X, Clock } from 'lucide-react';
import { Skeleton, Avatar, UserAvatar } from '../../ui';
import { RtdbConversation, User, UserStatus, RtdbUserChat } from '../../../../shared/types';
import { useConversationParticipants } from '../../../hooks/chat/useConversationParticipants';

interface SearchResultsProps {
  searchTerm: string;
  results: {
    conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
    users: User[];
  };
  conversations: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat }>;
  currentUserId: string;
  selectedId: string | null;
  history: Array<{ id: string; data: RtdbConversation; userChat: RtdbUserChat } | User>;
  onSelectConversation: (id: string) => void;
  onSelectUser: (user: User) => void;
  onRemoveFromHistory?: (id: string) => void;
  onClearHistory?: () => void;
  isLoading?: boolean;
}

/** Kết quả tìm kiếm hội thoại và bạn bè */
export const SearchResults: React.FC<SearchResultsProps> & { Skeleton: React.FC } = ({
  searchTerm, results, currentUserId, selectedId,
  history, onSelectConversation, onSelectUser,
  onRemoveFromHistory, onClearHistory, isLoading, conversations,
}) => {
  if (isLoading) return <SearchResults.Skeleton />;

  /* History View */
  if (!searchTerm) {
    if (history.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 mt-8">
          <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
            <Search size={22} className="text-text-tertiary" />
          </div>
          <p className="text-sm text-text-secondary">Tìm kiếm cuộc trò chuyện hoặc bạn bè</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col py-2">
        <div className="flex items-center justify-between px-4 py-2 mb-1">
          <span className="text-xs font-semibold text-text-tertiary flex items-center gap-1.5">
            <Clock size={12} />
            Tìm kiếm gần đây
          </span>
          <button
            onClick={onClearHistory}
            className="text-xs font-semibold text-primary hover:underline transition-colors"
          >
            Xóa lịch sử
          </button>
        </div>

        <div>
          {history
            .filter(item => !('status' in item) || item.status !== UserStatus.BANNED)
            .map((item) => {
              const isConversation = 'data' in item;
              if (isConversation) {
                const latestConv = conversations.find(c => c.id === item.id) ||
                  item as { id: string; data: RtdbConversation; userChat: RtdbUserChat };
                return (
                  <HistoryConversationItem
                    key={item.id}
                    conversation={latestConv}
                    currentUserId={currentUserId}
                    onSelect={() => onSelectConversation(item.id)}
                    onRemove={() => onRemoveFromHistory?.(item.id)}
                  />
                );
              }
              const user = item as User;
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 px-3 py-2.5 mx-1 hover:bg-bg-hover active:bg-bg-active cursor-pointer transition-colors duration-200 rounded-xl"
                  onClick={() => onSelectUser(user)}
                >
                  <UserAvatar userId={user.id} size="md" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
                    {user.fullName}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemoveFromHistory?.(item.id); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:bg-bg-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  /* Results View */
  const hasConversations = results.conversations.length > 0;
  const hasUsers = results.users.length > 0;

  if (!hasConversations && !hasUsers) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] text-center p-8">
        <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
          <Search size={22} className="text-text-tertiary" />
        </div>
        <p className="text-sm text-text-secondary">Không tìm thấy kết quả phù hợp</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-2">
      {/* Conversations Section */}
      {hasConversations && (
        <div className="mb-4">
          <div className="flex items-center px-4 py-2 mb-1">
            <span className="text-xs font-semibold text-text-tertiary flex items-center gap-1.5">
              <Search size={12} />
              Hội thoại
            </span>
          </div>
          <div>
            {results.conversations.map((conv) => (
              <HistoryConversationItem
                key={conv.id}
                conversation={conv}
                currentUserId={currentUserId}
                onSelect={() => onSelectConversation(conv.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Users Section */}
      {hasUsers && (
        <div>
          <div className="flex items-center px-4 py-2 mb-1">
            <span className="text-xs font-semibold text-text-tertiary flex items-center gap-1.5">
              <Search size={12} />
              Bạn bè
            </span>
          </div>
          <div>
            {results.users
              .filter(u => u.status !== UserStatus.BANNED)
              .map((user) => (
                <div
                  key={user.id}
                  onClick={() => onSelectUser(user)}
                  className="flex items-center gap-3 px-3 py-2.5 mx-1 hover:bg-bg-hover active:bg-bg-active cursor-pointer transition-colors duration-200 rounded-xl"
                >
                  <UserAvatar userId={user.id} size="md" />
                  <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
                    {user.fullName}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Item hội thoại trong lịch sử tìm kiếm */
interface HistoryConversationItemProps {
  conversation: { id: string; data: RtdbConversation; userChat: RtdbUserChat };
  currentUserId: string;
  onSelect: () => void;
  onRemove?: () => void;
}

const HistoryConversationItem: React.FC<HistoryConversationItemProps> = ({
  conversation, currentUserId, onSelect, onRemove,
}) => {
  const participants = useConversationParticipants(Object.keys(conversation.data.members));
  const partner = participants.find(p => p.id !== currentUserId);
  const displayName = conversation.data.isGroup ? conversation.data.name : partner?.fullName;
  const avatar = conversation.data.isGroup ? conversation.data.avatar : partner?.avatar;

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 mx-1 hover:bg-bg-hover active:bg-bg-active cursor-pointer transition-colors duration-200 rounded-xl"
      onClick={onSelect}
    >
      <Avatar
        src={avatar?.url}
        name={displayName || ''}
        size="md"
        isGroup={conversation.data.isGroup}
        members={participants}
      />
      <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">
        {displayName}
      </span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-7 h-7 flex items-center justify-center rounded-full text-text-tertiary hover:bg-bg-tertiary opacity-0 group-hover:opacity-100 transition-all duration-200"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
};

SearchResults.Skeleton = () => (
  <div className="flex flex-col py-2 px-1 space-y-1">
    <div className="px-3 py-2">
      <Skeleton width={100} height={11} />
    </div>
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
        <Skeleton variant="circle" width={40} height={40} />
        <Skeleton width="55%" height={14} />
      </div>
    ))}
  </div>
);
