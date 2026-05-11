import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, Users, Search, Bell, ArrowUpDown, Sparkles, RefreshCw } from 'lucide-react';
import { useContacts } from '../hooks';
import { Button, Input, ConfirmDialog, BlockOptionsModal } from '../components/ui';
import { CONFIRM_MESSAGES, TOAST_MESSAGES } from '../constants';
import { FriendRequestItem, FriendItem, AddFriendModal, SuggestionItem } from '../components/contacts';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { BlockOptions, User } from '../../shared/types';

type Tab = 'all' | 'requests' | 'sent' | 'suggestions';

const ContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    friends, receivedRequests, sentRequests, filteredReceivedRequests, filteredSentRequests, filteredSuggestions,
    groupedFriends, userCache, isLoading, isSuggestionsLoading,
    activeTab, setActiveTab,
    searchTerm, setSearchTerm, sortOrder, toggleSortOrder,
    handleAcceptRequest, handleRejectRequest, handleCancelRequest,
    handleUnfriend, handleMessage, handleAddFriend,
    handleDismissSuggestion, handleRefreshSuggestions,
    handleApplyBlock, handleUnblock,
  } = useContacts();

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab as Tab);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, setActiveTab, navigate, location.pathname]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [unfriendId, setUnfriendId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<User | null>(null);

  const blockedUsers = useAuthStore(state => state.blockedUsers);
  const currentBlockOptions = blockTarget ? blockedUsers[blockTarget.id] : undefined;

  const onUnfriendConfirm = async () => {
    if (!unfriendId) return;
    await handleUnfriend(unfriendId);
    setUnfriendId(null);
  };

  const onMessageClick = async (friendId: string) => {
    const convId = await handleMessage(friendId);
    if (convId) navigate(`/?conv=${convId}`);
  };

  const onApplyBlock = async (options: BlockOptions) => {
    if (!blockTarget) return;
    try {
      await handleApplyBlock(blockTarget.id, options);
      toast.success(TOAST_MESSAGES.BLOCK.BLOCK_SUCCESS);
      setBlockTarget(null);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.BLOCK_FAILED);
    }
  };

  const onUnblock = async () => {
    if (!blockTarget) return;
    try {
      await handleUnblock(blockTarget.id);
      toast.success(TOAST_MESSAGES.BLOCK.UNBLOCK_SUCCESS);
      setBlockTarget(null);
    } catch {
      toast.error(TOAST_MESSAGES.BLOCK.UNBLOCK_FAILED);
    }
  };

  const tabConfig: { id: Tab; label: string; mobileLabel: string; icon: React.ReactNode; count?: number; badge?: boolean }[] = [
    { id: 'all', label: 'Tất cả bạn bè', mobileLabel: 'Bạn bè', icon: <Users size={18} />, count: friends.length },
    { id: 'suggestions', label: 'Gợi ý kết bạn', mobileLabel: 'Gợi ý', icon: <Sparkles size={18} />, count: filteredSuggestions.length },
    { id: 'requests', label: 'Lời mời kết bạn', mobileLabel: 'Lời mời', icon: <Bell size={18} />, count: receivedRequests.length, badge: receivedRequests.length > 0 },
    { id: 'sent', label: 'Lời mời đã gửi', mobileLabel: 'Đã gửi', icon: <UserPlus size={18} />, count: sentRequests.length },
  ];


  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex flex-col w-[280px] lg:w-[320px] border-r border-border-light bg-bg-primary flex-shrink-0">
        <div className="p-4 border-b border-border-light">
          <Button
            fullWidth
            icon={<UserPlus size={17} />}
            onClick={() => setShowAddModal(true)}
            className="btn-gradient"
          >
            Thêm bạn bè
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <p className="px-3 pt-2 pb-2 text-[10px] font-bold text-text-tertiary uppercase tracking-[0.1em] opacity-80">
            Danh mục
          </p>
          {tabConfig.map(({ id, label, icon, count, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl transition-all duration-200 text-sm font-medium
                ${activeTab === id
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`}
            >
              <span className={`flex-shrink-0 transition-colors ${activeTab === id ? 'text-primary' : 'text-text-tertiary'}`}>
                {icon}
              </span>
              <span className="flex-1 text-left">{label}</span>
              {badge ? (
                <span className="text-[10px] font-bold bg-error text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-sm">
                  {count}
                </span>
              ) : count !== undefined && count > 0 ? (
                <span className="text-[10px] font-semibold text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded-full border border-border-light">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-bg-primary bg-app-pattern">

        {/* Header */}
        <div
          className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-border-light bg-bg-primary/80 backdrop-blur-md sticky top-0"
          style={{ zIndex: 'var(--z-sticky)' }}
        >
          {/* Mobile tab switcher */}
          <div className="flex md:hidden bg-bg-secondary rounded-xl p-1 mb-4 border border-border-light">
            {tabConfig.map(({ id, mobileLabel, count, badge }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 relative py-2.5 min-h-[40px] text-[11px] font-bold rounded-lg transition-all duration-200 flex flex-col items-center justify-center gap-0.5
                  ${activeTab === id
                    ? 'bg-bg-primary text-primary shadow-sm ring-1 ring-black/5'
                    : 'text-text-tertiary hover:text-text-secondary'
                  }`}
              >
                <span>{mobileLabel}</span>
                {count !== undefined && count > 0 && (
                  <span className={`text-[9px] ${badge ? 'text-error' : 'text-text-tertiary opacity-70'}`}>
                    {count}
                  </span>
                )}
                {badge && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-error rounded-full ring-2 ring-bg-secondary" />
                )}
              </button>
            ))}
          </div>

          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-col">
              <h2 className="text-xl font-bold text-text-primary tracking-tight">
                {tabConfig.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-text-tertiary font-medium">
                {activeTab === 'all' && `${friends.length} người bạn`}
                {activeTab === 'suggestions' && `${filteredSuggestions.length} gợi ý`}
                {activeTab === 'requests' && `${receivedRequests.length} lời mời chờ xác nhận`}
                {activeTab === 'sent' && `Đã gửi ${sentRequests.length} lời mời`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'suggestions' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw size={14} className={isSuggestionsLoading ? 'animate-spin' : ''} />}
                  onClick={handleRefreshSuggestions}
                  disabled={isSuggestionsLoading}
                  className="text-primary hover:bg-primary/5 hidden md:flex"
                >
                  Làm mới
                </Button>
              )}
              <Button
                size="sm"
                icon={<UserPlus size={15} />}
                onClick={() => setShowAddModal(true)}
                className="md:hidden btn-gradient"
              >
                Thêm
              </Button>
            </div>
          </div>

          {/* Action Row - Now Standardized for all tabs */}
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <Input
                placeholder={`Tìm kiếm trong ${tabConfig.find(t => t.id === activeTab)?.mobileLabel.toLowerCase()}...`}
                icon={<Search size={16} />}
                className="bg-bg-secondary border-none focus:ring-1 focus:ring-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                containerClassName="flex-1"
              />
              {activeTab === 'all' && (
                <Button
                  variant="ghost"
                  size="md"
                  icon={<ArrowUpDown size={16} />}
                  onClick={toggleSortOrder}
                  className="flex-shrink-0 text-text-secondary hover:text-primary hover:bg-primary/5"
                >
                  {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                </Button>
              )}
              {activeTab === 'suggestions' && (
                <Button
                  variant="ghost"
                  size="md"
                  icon={<RefreshCw size={16} className={isSuggestionsLoading ? 'animate-spin' : ''} />}
                  onClick={handleRefreshSuggestions}
                  disabled={isSuggestionsLoading}
                  className="flex-shrink-0 text-text-secondary hover:text-primary hover:bg-primary/5 md:hidden"
                />
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="w-full">
            {/* All friends */}
            {activeTab === 'all' && (
              isLoading ? (
                <div className="space-y-6">
                  {[...Array(2)].map((_, i) => (
                    <div key={i}>
                      <div className="w-12 h-4 bg-bg-tertiary rounded mb-3 mx-1 animate-pulse" />
                      <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                        {[...Array(3)].map((_, j) => <FriendItem.Skeleton key={j} />)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : groupedFriends.length === 0 ? (
                <EmptyState
                  icon={<Users size={32} className="text-text-tertiary" />}
                  title="Không tìm thấy bạn bè nào"
                  subtitle="Thử tìm kiếm với tên khác hoặc thêm bạn mới"
                />
              ) : (
                <div className="space-y-6">
                  {groupedFriends.map(group => (
                    <div key={group.letter}>
                      <p className="text-xs font-bold text-primary mb-3 px-2 uppercase tracking-widest opacity-80">
                        {group.letter}
                      </p>
                      <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                        {group.friends.map(friend => (
                          <FriendItem
                            key={friend.id}
                            friend={friend}
                            onUnfriend={(id) => setUnfriendId(id)}
                            onMessage={onMessageClick}
                            onBlock={(id) => setBlockTarget(friend)}
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
              isLoading ? (
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                  {[...Array(3)].map((_, i) => <FriendRequestItem.Skeleton key={i} />)}
                </div>
              ) : filteredReceivedRequests.length === 0 ? (
                <EmptyState
                  icon={<Bell size={32} className="text-text-tertiary" />}
                  title="Không có lời mời kết bạn nào"
                  subtitle={searchTerm ? "Không tìm thấy lời mời nào khớp với tìm kiếm" : "Những lời mời bạn nhận được sẽ hiển thị ở đây"}
                />
              ) : (
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                  {filteredReceivedRequests.map(request => {
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
              isLoading ? (
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                  {[...Array(3)].map((_, i) => <FriendRequestItem.Skeleton key={i} />)}
                </div>
              ) : filteredSentRequests.length === 0 ? (
                <EmptyState
                  icon={<UserPlus size={32} className="text-text-tertiary" />}
                  title="Chưa gửi lời mời kết bạn nào"
                  subtitle={searchTerm ? "Không tìm thấy lời mời nào khớp với tìm kiếm" : "Tìm kiếm bạn bè để gửi lời mời kết bạn"}
                />
              ) : (
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                  {filteredSentRequests.map(request => {
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
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
                  {[...Array(5)].map((_, i) => <SuggestionItem.Skeleton key={i} />)}
                </div>
              ) : filteredSuggestions.length === 0 ? (
                <EmptyState
                  icon={<Sparkles size={32} className="text-text-tertiary" />}
                  title="Chưa có gợi ý kết bạn nào"
                  subtitle="Nhấn Làm mới để cập nhật danh sách gợi ý"
                />
              ) : (
                <div className="bg-bg-primary rounded-xl border border-border-light overflow-hidden shadow-sm">
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
          </div>
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

      {blockTarget && (
        <BlockOptionsModal
          isOpen
          targetName={blockTarget.fullName}
          initialOptions={currentBlockOptions}
          onApply={onApplyBlock}
          onUnblock={onUnblock}
          onClose={() => setBlockTarget(null)}
        />
      )}

    </div>
  );
};

/* ── Reusable empty state ── */
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
    <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mb-6 border border-border-light shadow-inner relative">
      <div className="absolute inset-0 bg-primary/5 rounded-full animate-pulse" />
      <div className="relative z-10">{icon}</div>
    </div>
    <h3 className="text-base font-bold text-text-primary mb-2">{title}</h3>
    {subtitle && <p className="text-sm text-text-tertiary max-w-xs leading-relaxed">{subtitle}</p>}
  </div>
);

export default ContactsPage;
