import React, { useState, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, LayoutGrid, Settings, LogOut, Moon, Sun, Bell, Menu, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useRtdbChatStore } from '../../store';
import { useContactStore } from '../../store/contactStore';
import { useLoadingStore } from '../../store/loadingStore';
import { UserAvatar, ConfirmDialog, IconButton, ScreenLoader } from '../ui';
import { ReactionType, Post } from '../../../shared/types';
import { PostViewModal, PostModal } from '../feed';
import { SharePostModal } from '../chat';
import { usePostStore } from '../../store';
import { usePostNavigation } from '../../hooks/usePostNavigation';
import { useUserCache } from '../../store/userCacheStore';
import { postService } from '../../services/postService';
import { MediaObject, Visibility } from '../../../shared/types';
import { useNotificationStore } from '../../store/notificationStore';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import { useUnreadCount } from '../../hooks/utils/useUnreadCount';
import { useLogout } from '../../hooks/utils/useLogout';
import { useCallStore } from '../../store/callStore';
import { useCallManager } from '../../hooks/chat/useCallManager';
import { IncomingCallDialog } from '../chat/call/IncomingCallDialog';
import { OutgoingCallDialog } from '../chat/call/OutgoingCallDialog';
import { CallWindow } from '../chat/call/CallWindow';
import { CONFIRM_MESSAGES } from '../../constants';
import { soundManager } from '../../services/soundManager';
import { useSharePostStore } from '../../store/sharePostStore';

export const AppLayout: React.FC = () => {
  const { user } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const { subscribeToConversations, selectedConversationId, conversations, markAsDelivered } = useRtdbChatStore();
  const { receivedRequests, subscribeToRequests, subscribeToFriends } = useContactStore();
  const { initialize: initNotifications, unreadCount: unreadNotifications } = useNotificationStore();

  const { selectedPost, setSelectedPost, reactToPost, fetchPostById, posts, updatePost, deletePost } = usePostStore();
  const isModalLoading = useLoadingStore(state => state.loadingStates['post.detail']);
  const { users: usersMap, fetchUsers } = useUserCache();
  const { closePost } = usePostNavigation();
  const { friends } = useContactStore();
  const friendIds = useMemo(() => friends.map(f => f.id), [friends]);

  const handleConfirmLogout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const { post: postToShare, authorName: shareAuthorName, openSharePost, closeSharePost } = useSharePostStore();

  const handleEditPost = async (content: string, media: MediaObject[], visibility: Visibility, pendingFiles?: File[]) => {
    if (!showEditModal) return;
    await updatePost(showEditModal, content, media, visibility, pendingFiles);
    setShowEditModal(null);
  };

  const handleDeletePost = async () => {
    if (!postToDelete || !user) return;
    await deletePost(postToDelete, user.id);
    if (selectedPost?.id === postToDelete) {
       closePost();
    }
    setPostToDelete(null);
  };


  const isAdmin = user?.role === 'admin';
  const isChatRoom = location.pathname === '/' && !!selectedConversationId;

  const callEndReason = useCallStore((s) => s.callEndReason);
  const { phase, session, incomingSignal, acceptCall, rejectCall, endCall, dismissEndedCall } = useCallManager(user?.id || '');

  useEffect(() => {
    if (!user || useAuthStore.getState().isBanned) return;
    const unsubChat = subscribeToConversations(user.id);
    const unsubContacts = subscribeToRequests(user.id);
    const unsubFriends = subscribeToFriends(user.id);
    const unsubNotifications = initNotifications(user.id);
    return () => { unsubChat(); unsubContacts(); unsubFriends(); unsubNotifications(); };
  }, [user, subscribeToConversations, subscribeToRequests, subscribeToFriends, initNotifications]);

  useEffect(() => {
    if (!user) return;
    conversations
      .filter(c => c.id !== selectedConversationId && (c.userChat?.unreadCount || 0) > 0)
      .forEach(c => markAsDelivered(c.id, user.id));
  }, [conversations, selectedConversationId, user, markAsDelivered]);

  useEffect(() => {
    const unlock = () => {
      soundManager.unlock();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  useEffect(() => {
    if (selectedPost && !usersMap[selectedPost.authorId]) {
      fetchUsers([selectedPost.authorId]);
    }
  }, [selectedPost, usersMap, fetchUsers]);

  const postMatch = location.pathname.match(/\/post\/([^/]+)/);
  const postId = postMatch?.[1];

  useEffect(() => {
    if (postId && user) {
      fetchPostById(postId, user.id, friendIds);
    } else if (!postId && selectedPost) {
      setSelectedPost(null);
    }
  }, [postId, user?.id, selectedPost?.id, friendIds, fetchPostById, setSelectedPost]);

  const totalUnread = useUnreadCount();

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Smurfy` : 'Smurfy';
  }, [totalUnread]);

  const hasNewRequests = receivedRequests.length > 0;

  const handlePostReact = async (postId: string, reaction: ReactionType | 'REMOVE') => {
    if (user) await reactToPost(postId, user.id, reaction);
  };

  const handleOpenShareModal = (post: Post, authorName: string) => {
    openSharePost(post, authorName);
  };

  const navItems = [
    { to: '/feed', Icon: LayoutGrid, label: 'Nhật ký' },
    { to: '/', Icon: MessageCircle, label: 'Tin nhắn' },
    { to: '/contacts', Icon: Users, label: 'Bạn bè' },
    ...(isAdmin ? [{ to: '/admin', Icon: Shield, label: 'Quản trị' }] : []),
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-bg-secondary bg-app-pattern overflow-hidden transition-theme">

      {/* ── Desktop Header ── */}
      <header
        className="hidden md:flex h-16 w-full items-center bg-primary px-4 lg:px-6 sticky top-0 border-b border-white/10 transition-theme shadow-lg"
        style={{ zIndex: 'var(--z-header)' }}
      >
        {/* Logo */}
        <div
          className="flex-1 flex items-center cursor-pointer"
          onClick={() => navigate('/feed')}
        >
          <img src="/logo_text_white.png" alt="Smurfy" className="h-9 object-contain" onError={(e) => { e.currentTarget.src = '/logo_text_blue.png'; e.currentTarget.style.filter = 'brightness(0) invert(1)'; }} />
        </div>

        {/* Center nav */}
        <nav className="flex items-center gap-0.5 flex-shrink-0">
          {navItems.map(({ to, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `relative px-3 h-11 flex items-center justify-center rounded-xl transition-all duration-200 border border-transparent min-w-[44px] group
                ${isActive
                  ? 'bg-white/20 text-white font-bold'
                  : 'text-white/70 hover:bg-white/10 hover:text-white active:bg-white/20'
                }`
              }
            >
              <div className="flex items-center gap-2">
                <Icon size={20} />
                <span className="text-sm font-semibold hidden lg:inline">{label}</span>
              </div>
              {to === '/' && totalUnread > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-primary" />
              )}
              {to === '/contacts' && hasNewRequests && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-primary" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex-1 flex items-center justify-end gap-1">
          <NotificationDropdown />
          <IconButton
            onClick={toggleTheme}
            icon={mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            title={mode === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white active:bg-white/20"
          />

          <div className="w-px h-6 bg-white/10 mx-1" />

          <NavLink
            to="/settings"
            title="Cài đặt"
            className={({ isActive }) =>
              `w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 border border-transparent
              ${isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white active:bg-white/20'}`
            }
          >
            <Settings size={20} />
          </NavLink>

          {user && (
            <NavLink
              to={`/profile/${user.id}`}
              title="Trang cá nhân"
              className={({ isActive }) =>
                `w-10 h-10 flex items-center justify-center rounded-full transition-all duration-200 outline-none
                ${isActive
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-primary'
                  : 'hover:ring-2 hover:ring-white/40 hover:ring-offset-2 hover:ring-offset-primary'
                }`
              }
            >
              <UserAvatar
                userId={user.id}
                src={user.avatar?.url}
                size="sm"
                showBorder={false}
                initialStatus={user.status}
              />
            </NavLink>
          )}

          <IconButton
            onClick={() => setShowLogoutConfirm(true)}
            icon={<LogOut size={20} />}
            title="Đăng xuất"
            variant="ghost"
            className="text-white/70 hover:bg-red-500/20 hover:text-red-400 active:bg-red-500/30 transition-all duration-200"
          />
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className={`flex-1 relative flex flex-col h-full overflow-hidden transition-theme md:pb-0 ${isChatRoom ? 'pb-0' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'}`}>
        <React.Suspense fallback={<ScreenLoader />}>
          <Outlet />
        </React.Suspense>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      {!isChatRoom && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 bg-primary border-t border-white/10 flex justify-around items-stretch transition-theme"
          style={{ zIndex: 'var(--z-header)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {navItems.filter(item => item.to !== '/admin').map(({ to, Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-200 rounded-xl
                ${isActive ? 'text-white bg-white/20' : 'text-white/60 hover:bg-white/10 active:text-white active:bg-white/20'}`
              }
            >
              <div className="relative">
                <Icon size={22} />
                {to === '/' && totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
                {to === '/contacts' && hasNewRequests && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
              </div>
              <span className="text-xs font-medium leading-none whitespace-nowrap">{label}</span>
            </NavLink>
          ))}

          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-200 rounded-xl
              ${isActive ? 'text-white bg-white/20' : 'text-white/60 hover:bg-white/10 active:text-white active:bg-white/20'}`
            }
          >
            <div className="relative">
              <Bell size={22} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-primary" />
              )}
            </div>
            <span className="text-xs font-medium leading-none whitespace-nowrap">Thông báo</span>
          </NavLink>

          <NavLink
            to="/menu"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-200 rounded-xl
              ${isActive ? 'text-white bg-white/20' : 'text-white/60 hover:bg-white/10 active:text-white active:bg-white/20'}`
            }
          >
            <Menu size={22} />
            <span className="text-xs font-medium leading-none whitespace-nowrap">Menu</span>
          </NavLink>
        </nav>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        title={CONFIRM_MESSAGES.AUTH.LOGOUT.TITLE}
        message={CONFIRM_MESSAGES.AUTH.LOGOUT.MESSAGE}
        confirmLabel={CONFIRM_MESSAGES.AUTH.LOGOUT.CONFIRM}
      />

      {user && (
        <PostViewModal
          isOpen={!!postId}
          onClose={closePost}
          post={selectedPost}
          author={selectedPost ? usersMap[selectedPost.authorId] : null}
          currentUser={user}
          onReact={handlePostReact}
          isLoading={isModalLoading}
          onEdit={(id) => setShowEditModal(id)}
          onDelete={(id) => setPostToDelete(id)}
          onShare={handleOpenShareModal}
        />
      )}

      {user && (
        <SharePostModal
          isOpen={!!postToShare}
          onClose={closeSharePost}
          post={postToShare}
          authorName={shareAuthorName}
          currentUserId={user.id}
        />
      )}

      {user && (
        <PostModal
          isOpen={!!showEditModal}
          onClose={() => setShowEditModal(null)}
          currentUser={user}
          initialPost={posts.find(p => p.id === showEditModal) || selectedPost || undefined}
          onSubmit={handleEditPost}
        />
      )}

      <ConfirmDialog
        isOpen={!!postToDelete}
        onClose={() => setPostToDelete(null)}
        onConfirm={handleDeletePost}
        title="Xóa bài viết"
        message="Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác."
        confirmLabel="Xóa ngay"
        variant="danger"
      />

      {phase === 'incoming' && incomingSignal && (
        <IncomingCallDialog
          callerName={incomingSignal.callerName!}
          callerId={incomingSignal.callerId}
          callType={incomingSignal.callType}
          isGroupCall={incomingSignal.isGroupCall}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {phase === 'outgoing' && session && (
        <OutgoingCallDialog
          calleeName={session.calleeName || 'Đang gọi...'}
          calleeId={session.participants[0]}
          calleeAvatar={session.calleeAvatar}
          callType={session.callType}
          endReason={callEndReason}
          onCancel={() => endCall('missed')}
          onDismiss={dismissEndedCall}
        />
      )}

      {user && phase === 'in-call' && session && (
        <CallWindow
          roomId={session.conversationId}
          userId={user.id}
          userName={user.fullName}
          userAvatar={user.avatar?.url ?? ''}
          isGroupCall={session.isGroupCall}
          callType={session.callType}
          onClose={() => endCall('ended')}
        />
      )}
    </div>
  );
};

export default AppLayout;
