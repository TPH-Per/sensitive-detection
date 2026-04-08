import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Users, Search, Bell, ArrowUpDown, Sparkles, RefreshCw } from 'lucide-react';
import { useContacts } from '../hooks';
import { Button, Input, ConfirmDialog } from '../components/ui';
import { CONFIRM_MESSAGES } from '../constants';
import { FriendRequestItem, FriendItem, AddFriendModal, SuggestionItem } from '../components/contacts';

type Tab = 'all' | 'requests' | 'sent' | 'suggestions';

const ContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    friends, receivedRequests, sentRequests, filteredSuggestions,
    groupedFriends, userCache, isLoading, isSuggestionsLoading,
    activeTab, setActiveTab,
    searchTerm, setSearchTerm, sortOrder, toggleSortOrder,
    handleAcceptRequest, handleRejectRequest, handleCancelRequest,
    handleUnfriend, handleMessage, handleAddFriend,
    handleDismissSuggestion, handleRefreshSuggestions,
  } = useContacts();

  const [showAddModal, setShowAddModal] = useState(false);
  const [unfriendId, setUnfriendId] = useState<string | null>(null);

  const onUnfriendConfirm = async () => {
    if (!unfriendId) return;
    await handleUnfriend(unfriendId);
    setUnfriendId(null);
  };

  const onMessageClick = async (friendId: string) => {
    const convId = await handleMessage(friendId);
    if (convId) navigate(`/?conv=${convId}`);
  };

  const tabConfig: { id: Tab; label: string; icon: React.ReactNode; count?: number; badge?: boolean }[] = [
    { id: 'all', label: 'Tất cả bạn bè', icon: <Users size={18} />, count: friends.length },
    { id: 'suggestions', label: 'Gợi ý kết bạn', icon: <Sparkles size={18} /> },
    { id: 'requests', label: 'Lời mời kết bạn', icon: <Bell size={18} />, count: receivedRequests.length, badge: receivedRequests.length > 0 },
    { id: 'sent', label: 'Lời mời đã gửi', icon: <UserPlus size={18} />, count: sentRequests.length },
  ];

  return (
    <div className="flex h-full w-full bg-bg-secondary overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-[280px] lg:w-[320px] border-r border-border-light bg-bg-primary flex-shrink-0">
        <div className="p-4 border-b border-border-light">
          <Button
            fullWidth
            icon={<UserPlus size={17} />}
            onClick={() => setShowAddModal(true)}
          >
            Thêm bạn bè
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-text-tertiary uppercase tracking-widest">
            Danh sách
          </p>
          {tabConfig.map(({ id, label, icon, count, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl transition-all duration-200 text-sm font-medium
                ${activeTab === id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active'
                }`}
            >
              <span className="flex-shrink-0">{icon}</span>
              <span className="flex-1 text-left">{label}</span>
              {badge ? (
                <span className="text-[10px] font-bold bg-error text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {count}
                </span>
              ) : count !== undefined && count > 0 ? (
                <span className="text-[10px] text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded-full border border-border-light">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-primary md:bg-bg-secondary">

        {/* Header */}
        <div
          className="flex-shrink-0 p-4 border-b border-border-light bg-bg-primary sticky top-0"
          style={{ zIndex: 'var(--z-sticky)' }}
        >
          {/* Mobile tab switcher */}
          <div className="flex md:hidden bg-bg-secondary rounded-xl p-1 mb-3 border border-border-light">
            {tabConfig.map(({ id, label, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 relative py-2 min-h-[40px] text-xs font-semibold rounded-lg transition-all duration-200
                  ${activeTab === id
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary'
                  }`}
              >
                {id === 'all' ? 'Bạn bè' : id === 'suggestions' ? 'Gợi ý' : id === 'requests' ? 'Lời mời' : 'Đã gửi'}
                {badge && (
                  <span className="absolute top-1 right-2 w-1.5 h-1.5 bg-error rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">
              {activeTab === 'all' && `Bạn bè (${friends.length})`}
              {activeTab === 'suggestions' && `Gợi ý kết bạn (${filteredSuggestions.length})`}
              {activeTab === 'requests' && `Lời mời (${receivedRequests.length})`}
              {activeTab === 'sent' && `Đã gửi (${sentRequests.length})`}
            </h2>
            <Button
              size="sm"
              icon={<UserPlus size={15} />}
              onClick={() => setShowAddModal(true)}
              className="md:hidden"
            >
              Thêm
            </Button>
          </div>

          {/* Search + sort (friends tab only) */}
          {activeTab === 'all' && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Tìm kiếm..."
                icon={<Search size={16} />}
                className="bg-bg-secondary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                containerClassName="flex-1"
              />
              <Button
                variant="ghost"
                size="md"
                icon={<ArrowUpDown size={16} />}
                onClick={toggleSortOrder}
                className="flex-shrink-0"
              >
                {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
              </Button>
            </div>
          )}

          {/* Refresh button (suggestions tab only) */}
          {activeTab === 'suggestions' && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} className={isSuggestionsLoading ? 'animate-spin' : ''} />}
                onClick={handleRefreshSuggestions}
                disabled={isSuggestionsLoading}
              >
                Làm mới
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          {isLoading ? (
            <div className="space-y-5">
              {[...Array(2)].map((_, i) => (
                <div key={i}>
                  <div className="w-8 h-3 bg-bg-tertiary rounded mb-2 mx-1 animate-pulse" />
                  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                    {[...Array(3)].map((_, j) => <FriendItem.Skeleton key={j} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* All friends */}
              {activeTab === 'all' && (
                groupedFriends.length === 0 ? (
                  <EmptyState
                    icon={<Users size={32} className="text-text-tertiary" />}
                    title="Không tìm thấy bạn bè nào"
                  />
                ) : (
                  <div className="space-y-5">
                    {groupedFriends.map(group => (
                      <div key={group.letter}>
                        <p className="text-xs font-bold text-primary mb-2 px-1 uppercase tracking-widest">
                          {group.letter}
                        </p>
                        <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                          {group.friends.map(friend => (
                            <FriendItem
                              key={friend.id}
                              friend={friend}
                              onUnfriend={(id) => setUnfriendId(id)}
                              onMessage={onMessageClick}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Received requests */}
              {activeTab === 'requests' && (
                receivedRequests.length === 0 ? (
                  <EmptyState
                    icon={<Bell size={32} className="text-text-tertiary" />}
                    title="Không có lời mời kết bạn nào"
                  />
                ) : (
                  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                    {receivedRequests.map(request => {
                      const sender = userCache[request.senderId];
                      return sender ? (
                        <FriendRequestItem
                          key={request.id}
                          request={request}
                          user={sender}
                          type="received"
                          onAccept={handleAcceptRequest}
                          onReject={handleRejectRequest}
                        />
                      ) : null;
                    })}
                  </div>
                )
              )}

              {/* Sent requests */}
              {activeTab === 'sent' && (
                sentRequests.length === 0 ? (
                  <EmptyState
                    icon={<UserPlus size={32} className="text-text-tertiary" />}
                    title="Chưa gửi lời mời kết bạn nào"
                  />
                ) : (
                  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                    {sentRequests.map(request => {
                      const receiver = userCache[request.receiverId];
                      return receiver ? (
                        <FriendRequestItem
                          key={request.id}
                          request={request}
                          user={receiver}
                          type="sent"
                          onCancel={handleCancelRequest}
                        />
                      ) : null;
                    })}
                  </div>
                )
              )}

              {/* Suggestions */}
              {activeTab === 'suggestions' && (
                isSuggestionsLoading ? (
                  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                    {[...Array(5)].map((_, i) => <SuggestionItem.Skeleton key={i} />)}
                  </div>
                ) : filteredSuggestions.length === 0 ? (
                  <EmptyState
                    icon={<Sparkles size={32} className="text-text-tertiary" />}
                    title="Chưa có gợi ý kết bạn nào"
                    subtitle="Nhấn Làm mới để tạo gợi ý mới"
                  />
                ) : (
                  <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden">
                    {filteredSuggestions.map(user => (
                      <SuggestionItem
                        key={user.id}
                        user={user}
                        onAddFriend={handleAddFriend}
                        onDismiss={handleDismissSuggestion}
                      />
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      <AddFriendModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      <ConfirmDialog
        isOpen={!!unfriendId}
        onClose={() => setUnfriendId(null)}
        onConfirm={onUnfriendConfirm}
        title={CONFIRM_MESSAGES.FRIEND.UNFRIEND.TITLE}
        message={CONFIRM_MESSAGES.FRIEND.UNFRIEND.MESSAGE(
          userCache[unfriendId || '']?.fullName || 'người này'
        )}
        confirmLabel={CONFIRM_MESSAGES.FRIEND.UNFRIEND.CONFIRM}
        variant="danger"
      />
    </div>
  );
};

/* ── Reusable empty state ── */
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 bg-bg-secondary rounded-full flex items-center justify-center mb-4 border border-border-light">
      {icon}
    </div>
    <p className="text-sm font-medium text-text-secondary">{title}</p>
    {subtitle && <p className="text-xs text-text-tertiary mt-1">{subtitle}</p>}
  </div>
);

export default ContactsPage;
