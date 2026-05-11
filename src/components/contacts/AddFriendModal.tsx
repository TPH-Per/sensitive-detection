import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, MessageCircle, User as UserIcon, Clock, Check, XCircle } from 'lucide-react';
import { Button, Input, Loading, Modal, UserAvatar } from '../ui';
import { useContactStore } from '../../store/contactStore';
import { useAuthStore } from '../../store/authStore';
import { useLoadingStore } from '../../store/loadingStore';
import { useRtdbChatStore } from '../../store';
import { User, FriendStatus } from '../../../shared/types';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const {
    searchUsers, clearSearchResults, friends,
    sentRequests, receivedRequests,
    sendFriendRequest, cancelFriendRequest, acceptFriendRequest,
  } = useContactStore();
  const { getOrCreateConversation } = useRtdbChatStore();
  const isLoading = useLoadingStore(state => state.loadingStates['contacts.search']);

  const [searchTerm, setSearchTerm] = useState('');
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const relationship = useMemo(() => {
    if (!foundUser || !currentUser) return FriendStatus.NOT_FRIEND;
    if (friends.some(f => f.id === foundUser.id)) return FriendStatus.FRIEND;
    if (sentRequests.find(r => r.receiverId === foundUser.id)) return FriendStatus.PENDING_SENT;
    if (receivedRequests.find(r => r.senderId === foundUser.id)) return FriendStatus.PENDING_RECEIVED;
    return FriendStatus.NOT_FRIEND;
  }, [foundUser, currentUser, friends, sentRequests, receivedRequests]);

  const handleSearch = async () => {
    if (!currentUser || !searchTerm.trim()) return;
    setNotFound(false);
    setFoundUser(null);
    const results = await searchUsers(searchTerm, currentUser.id);
    if (results.length > 0) setFoundUser(results[0]);
    else setNotFound(true);
  };

  const handleClose = () => {
    setSearchTerm('');
    setFoundUser(null);
    setNotFound(false);
    clearSearchResults();
    onClose();
  };

  const withLoading = async (fn: () => Promise<void>) => {
    setActionLoading(true);
    try { await fn(); } finally { setActionLoading(false); }
  };

  const handleAddFriend = () => withLoading(async () => {
    if (!foundUser || !currentUser) return;
    await sendFriendRequest(currentUser.id, foundUser.id);
  });

  const handleCancelRequest = () => withLoading(async () => {
    if (!foundUser || !currentUser) return;
    const request = sentRequests.find(r => r.receiverId === foundUser.id);
    if (request) await cancelFriendRequest(request.id);
  });

  const handleAcceptRequest = () => withLoading(async () => {
    if (!foundUser || !currentUser) return;
    const request = receivedRequests.find(r => r.senderId === foundUser.id);
    if (request) await acceptFriendRequest(request.id, request.senderId, currentUser.id);
  });

  const handleMessage = async () => {
    if (!foundUser || !currentUser) return;
    const convId = await getOrCreateConversation(currentUser.id, foundUser.id);
    handleClose();
    navigate(`/?conv=${convId}`);
  };

  const handleViewProfile = () => {
    if (!foundUser) return;
    handleClose();
    navigate(`/profile/${foundUser.id}`);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Tìm kiếm người dùng" maxWidth="md" fullScreen="mobile">
      <div className="space-y-5">
        {/* Search row */}
        <div className="flex gap-2">
          <Input
            placeholder="Nhập địa chỉ email chính xác..."
            icon={<Search size={16} />}
            containerClassName="flex-1"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setNotFound(false);
              setFoundUser(null);
            }}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            onClick={handleSearch}
            disabled={isLoading || !searchTerm.trim()}
            isLoading={isLoading}
          >
            Tìm
          </Button>
        </div>

        {/* Result area */}
        <div className="min-h-[180px] flex flex-col items-center justify-center border border-dashed border-border-light rounded-2xl p-6 bg-bg-secondary/40">
          {isLoading ? (
            <Loading variant="inline" size="md" />

          ) : foundUser ? (
            /* ── Found user ── */
            <div className="w-full flex flex-col items-center animate-fade-in gap-5">
              <UserAvatar
                userId={foundUser.id}
                size="xl"
                className="ring-2 ring-bg-primary shadow-lg"
              />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-text-primary mb-0.5">
                  {foundUser.fullName}
                </h3>
                <p className="text-xs text-text-tertiary">{foundUser.email}</p>
                {foundUser.bio && (
                  <p className="text-xs text-text-secondary mt-2 max-w-xs mx-auto line-clamp-2 italic">
                    "{foundUser.bio}"
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {relationship === FriendStatus.FRIEND ? (
                  <Button
                    variant="secondary"
                    icon={<Check size={16} />}
                    className="bg-success/10 text-success border-success/20 hover:bg-success/15"
                    onClick={handleMessage}
                  >
                    Bạn bè
                  </Button>
                ) : relationship === FriendStatus.PENDING_SENT ? (
                  <Button
                    variant="secondary"
                    icon={<Clock size={16} />}
                    onClick={handleCancelRequest}
                    isLoading={actionLoading}
                    className="hover:bg-error/10 hover:text-error hover:border-error/20 transition-colors"
                  >
                    Đã gửi lời mời
                  </Button>
                ) : relationship === FriendStatus.PENDING_RECEIVED ? (
                  <Button
                    icon={<UserPlus size={16} />}
                    onClick={handleAcceptRequest}
                    isLoading={actionLoading}
                  >
                    Chấp nhận kết bạn
                  </Button>
                ) : (
                  <Button
                    icon={<UserPlus size={16} />}
                    onClick={handleAddFriend}
                    isLoading={actionLoading}
                  >
                    Thêm bạn bè
                  </Button>
                )}

                <Button
                  variant="secondary"
                  icon={<MessageCircle size={16} />}
                  onClick={handleMessage}
                >
                  Nhắn tin
                </Button>

                <Button
                  variant="ghost"
                  icon={<UserIcon size={16} />}
                  onClick={handleViewProfile}
                  className="text-text-secondary hover:text-primary"
                >
                  Trang cá nhân
                </Button>
              </div>
            </div>

          ) : notFound ? (
            /* ── Not found ── */
            <div className="text-center">
              <div className="w-14 h-14 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-error/20">
                <Search size={24} className="text-error/60" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Không tìm thấy người dùng</p>
              <p className="text-xs text-text-tertiary mt-1">Vui lòng kiểm tra lại địa chỉ email</p>
            </div>

          ) : (
            /* ── Idle state ── */
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3 border border-primary/20">
                <Search size={24} className="text-primary/60" />
              </div>
              <p className="text-sm font-medium text-text-secondary">Tìm kiếm bạn bè</p>
              <p className="text-xs text-text-tertiary mt-1">Nhập email để tìm kiếm và kết nối</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
