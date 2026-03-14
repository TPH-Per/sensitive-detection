import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { MessageCircle, Users, LayoutGrid, Settings, LogOut, User as UserIcon, Moon, Sun, Bell, Flag, Menu, Shield } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useRtdbChatStore } from '../../store';
import { useContactStore } from '../../store/contactStore';
import { useLoadingStore } from '../../store/loadingStore';
import { Avatar, UserAvatar, ConfirmDialog, Button, IconButton, ScreenLoader } from '../ui';
import { Post, Visibility, ReactionType } from '../../../shared/types';
import { PostViewModal } from '../feed';
import { usePostStore } from '../../store/postStore';
import { useUserCache } from '../../store/userCacheStore';
import { useNotificationStore } from '../../store/notificationStore';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import { useUnreadCount } from '../../hooks/utils/useUnreadCount';
import { useLogout } from '../../hooks/utils/useLogout';
import { useCallStore } from '../../store/callStore';
import { useCallSignaling } from '../../hooks/chat/useCallSignaling';
import { useCallSounds } from '../../hooks/chat/useCallSounds';
import { IncomingCallDialog } from '../chat/call/IncomingCallDialog';
import { CallWindow } from '../chat/call/CallWindow';
import { CONFIRM_MESSAGES } from '../../constants';
import { rtdbCallService } from '../../services/chat/rtdbCallService';

export const AppLayout: React.FC = () => {
  const { user } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const { subscribeToConversations, selectedConversationId, sendCallMessage, updateCallMessage } = useRtdbChatStore();
  const { receivedRequests, subscribeToRequests, subscribeToFriends } = useContactStore();
  const { initialize: initNotifications, unreadCount: unreadNotifications } = useNotificationStore();

  const { selectedPost, setSelectedPost, reactToPost } = usePostStore();
  const isModalLoading = useLoadingStore(state => state.loadingStates['feed']);
  const { users: usersMap, fetchUsers } = useUserCache();

  const handleConfirmLogout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isAdmin = user?.role === 'admin';

  const isChatRoom = location.pathname === '/' && !!selectedConversationId;

  // Global Call State
  const {
    callPhase,
    setCallPhase,
    callType,
    setCallType,
    activeRoomId,
    setActiveRoomId,
    otherUserIds,
    setOtherUserIds,
    isGroupCall,
    setIsGroupCall,
    isCaller,
    setIsCaller,
    callStartTime,
    setCallStartTime,
    callConversationId,
    setSignalingActions,
    resetCall
  } = useCallStore();

  const { playSound } = useCallSounds();

  const { incomingCall, startCall, acceptCall, rejectCall, endCall } = useCallSignaling(
    user?.id || '',
    {
      onCallAccepted: (signal) => {
        if (!signal.isGroupCall) {
          setActiveRoomId(signal.conversationId);
          setCallType(signal.callType);
          setCallPhase('in-call');
          setCallStartTime(Date.now());
          playSound('connected');
        }
      },
      onCallRejected: async () => {
        if (isCaller && callConversationId && user?.id) {
            const activeCall = await rtdbCallService.getActiveCall(callConversationId);
            if (activeCall && activeCall.messageId) {
                await updateCallMessage(callConversationId, activeCall.messageId, { callType, status: 'rejected' });
                await rtdbCallService.endActiveCall(callConversationId);
            }
        }
        playSound('busy');
        resetCall();
      },
      onCallEnded: async () => {
        if (isCaller && callConversationId && user?.id && callPhase === 'in-call') {
            const activeCall = await rtdbCallService.getActiveCall(callConversationId);
            if (activeCall && activeCall.messageId && !isGroupCall) {
                const duration = callStartTime ? Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)) : 0;
                await updateCallMessage(callConversationId, activeCall.messageId, { callType, status: 'ended', duration });
                await rtdbCallService.endActiveCall(callConversationId);
            }
        }
        if (callPhase === 'in-call') {
          playSound('ended');
        }
        resetCall();
      },
    }
  );

  useEffect(() => {
    setSignalingActions({ startCall, acceptCall, rejectCall, endCall });
  }, [setSignalingActions, startCall, acceptCall, rejectCall, endCall]);

  const handleAcceptIncoming = async () => {
    if (!incomingCall) return;
    await acceptCall(incomingCall);
    setCallType(incomingCall.callType);
    setActiveRoomId(incomingCall.conversationId);
    setOtherUserIds([incomingCall.callerId]);
    setIsGroupCall(incomingCall.isGroupCall || false);
    setIsCaller(false);
    setCallPhase('in-call');
    setCallStartTime(Date.now());
  };

  const handleRejectIncoming = async () => {
    if (!incomingCall) return;
    await rejectCall(incomingCall);
    resetCall();
  };

  useEffect(() => {
    if (!user) return;
    const unsubscribeChat = subscribeToConversations(user.id);
    const unsubscribeContacts = subscribeToRequests(user.id);
    const unsubscribeFriends = subscribeToFriends(user.id);
    const unsubscribeNotifications = initNotifications(user.id);
    return () => {
      unsubscribeChat();
      unsubscribeContacts();
      unsubscribeFriends();
      unsubscribeNotifications();
    };
  }, [user, subscribeToConversations, subscribeToRequests, subscribeToFriends, initNotifications]);

  useEffect(() => {
    if (selectedPost && !usersMap[selectedPost.authorId]) {
      fetchUsers([selectedPost.authorId]);
    }
  }, [selectedPost, usersMap, fetchUsers]);

  const totalUnread = useUnreadCount();

  useEffect(() => {
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) Smurfy`;
    } else {
      document.title = 'Smurfy';
    }
  }, [totalUnread]);

  const hasNewRequests = receivedRequests.length > 0;

  const handlePostReact = async (postId: string, reaction: ReactionType | 'REMOVE') => {
    if (user) {
      await reactToPost(postId, user.id, reaction);
    }
  };

  const navItems = [
    { to: '/feed', Icon: LayoutGrid, label: 'Nhật ký' },
    { to: '/', Icon: MessageCircle, label: 'Tin nhắn' },
    { to: '/contacts', Icon: Users, label: 'Bạn bè' },
    ...(isAdmin ? [
      { to: '/admin', Icon: Shield, label: 'Quản trị' }
    ] : []),
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-bg-secondary overflow-hidden transition-theme">
      {/* Desktop Navbar */}
      <header className="hidden md:flex h-16 w-full items-center bg-bg-primary px-4 lg:px-6 z-50 sticky top-0 shadow-sm border-b border-border-light transition-theme">
        {/* Left: Logo */}
        <div
          className="flex-1 flex items-center cursor-pointer transition-all duration-base hover:opacity-90"
          onClick={() => navigate('/feed')}
        >
          <img
            src="/logo_text_blue.png"
            alt="Smurfy"
            className="h-9 object-contain"
          />
        </div>

        {/* Center: Navigation */}
        <nav className="flex items-center gap-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-3 h-11 flex items-center justify-center rounded-xl transition-all duration-base relative group border-2 border-transparent min-w-[44px] ${isActive
                  ? 'bg-primary-light text-primary font-bold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-primary active:bg-bg-active'
                }`
              }
              title={item.label}
            >
              <div className="flex items-center gap-2">
                <item.Icon size={20} />
                <span className="text-sm font-bold hidden lg:inline">{item.label}</span>
                {item.to === '/' && totalUnread > 0 && (
                  <span className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
                {item.to === '/contacts' && hasNewRequests && (
                  <span className="absolute top-2 right-2.5 w-2 h-2 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
              </div>
            </NavLink>
          ))}
        </nav>

        {/* Right: User Actions */}
        <div className="flex-1 flex items-center justify-end gap-1">
          <div className="flex items-center gap-0.5">
            <NotificationDropdown />

            <IconButton
              onClick={toggleTheme}
              icon={mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              title="Chế độ tối"
              variant="ghost"
              className="text-text-secondary hover:text-primary min-w-[44px] min-h-[44px]"
            />
          </div>

          <div className="w-px h-6 bg-border-light mx-1" />

          <div className="flex items-center gap-1">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-base border-2 border-transparent ${isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-primary active:bg-bg-active'
                }`
              }
              title="Cài đặt"
            >
              <Settings size={20} />
            </NavLink>

            <div className="group relative" onClick={() => navigate('/profile')}>
              {user && (
                <UserAvatar
                  userId={user.id}
                  src={user.avatar.url}
                  size="sm"
                  className="cursor-pointer ring-2 ring-transparent group-hover:ring-primary/30 transition-all duration-base"
                  initialStatus={user.status}
                />
              )}
            </div>

            <IconButton
              onClick={() => setShowLogoutConfirm(true)}
              icon={<LogOut size={20} />}
              title="Đăng xuất"
              variant="ghost"
              className="text-text-secondary hover:bg-error/10 hover:text-error min-w-[44px] min-h-[44px]"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 relative flex flex-col h-full overflow-hidden transition-theme md:pb-0 ${isChatRoom ? 'pb-0' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'}`}>
        <React.Suspense fallback={<ScreenLoader />}>
          <Outlet />
        </React.Suspense>
      </main>

      {/* Mobile Navigation */}
      {!isChatRoom && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-border-light flex justify-around items-stretch z-50 transition-theme shadow-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {navItems.filter(item => item.to !== '/admin').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-base ${isActive ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary active:text-text-primary'
                }`
              }
            >
              <div className="relative">
                <item.Icon size={22} />
                {item.to === '/' && totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
                {item.to === '/contacts' && hasNewRequests && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </NavLink>
          ))}

          {/* Mobile Notification Icon */}
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-base ${isActive ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary active:text-text-primary'
              }`
            }
          >
            <div className="relative">
              <Bell size={22} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
              )}
            </div>
            <span className="text-[10px] font-medium leading-none">Thông báo</span>
          </NavLink>

          {/* Mobile Menu Button */}
          <NavLink
            to="/menu"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-base ${isActive ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary active:text-text-primary'
              }`
            }
          >
            <Menu size={22} />
            <span className="text-[10px] font-medium leading-none">Menu</span>
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
          isOpen={!!selectedPost || isModalLoading}
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
          author={selectedPost ? usersMap[selectedPost.authorId] : null}
          currentUser={user}
          onReact={handlePostReact}
          isLoading={isModalLoading}
        />
      )}

      {/* Global Call UI */}
      {incomingCall && callPhase === 'idle' && (
        <IncomingCallDialog
          callerName={incomingCall.callerName!}
          callerId={incomingCall.callerId}
          callType={incomingCall.callType}
          isGroupCall={incomingCall.isGroupCall}
          onAccept={handleAcceptIncoming}
          onReject={handleRejectIncoming}
        />
      )}

      {user && callPhase === 'in-call' && activeRoomId && (
        <CallWindow
          roomId={activeRoomId}
          userId={user.id}
          userName={user.fullName}
          userAvatar={user.avatar.url}
          isGroupCall={isGroupCall}
          callType={callType}
          onClose={() => {
            if (endCall) {
              endCall(otherUserIds);
            }
            resetCall();
          }}
        />
      )}
    </div>
  );
};

export default AppLayout;
