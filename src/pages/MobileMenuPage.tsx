import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  User as UserIcon,
  Settings,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  MessageCircle,
  Users,
  LayoutGrid,
  Bell,
  Menu,
  Shield
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useContactStore } from '../store/contactStore';
import { useNotificationStore } from '../store/notificationStore';
import { UserAvatar, ConfirmDialog, Button } from '../components/ui';
import { useUnreadCount } from '../hooks/utils/useUnreadCount';
import { useLogout } from '../hooks/utils/useLogout';

export const MobileMenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const { receivedRequests } = useContactStore();
  const handleConfirmLogout = useLogout();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const isAdmin = !!user;

  const totalUnread = useUnreadCount();
  const hasNewRequests = receivedRequests.length > 0;
  const unreadNotifications = useNotificationStore(state => state.unreadCount);

  // Bottom nav items
  const navItems = [
    { to: '/feed', Icon: LayoutGrid, label: 'Nhật ký' },
    { to: '/', Icon: MessageCircle, label: 'Tin nhắn', badge: totalUnread > 0 },
    { to: '/contacts', Icon: Users, label: 'Bạn bè', badge: hasNewRequests },
    { to: '/notifications', Icon: Bell, label: 'Thông báo', badge: unreadNotifications > 0 },
  ];

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-bg-secondary">
      {/* Header */}
      <div className="bg-bg-primary border-b border-border-light p-4">
        <div className="flex items-center gap-3">
          {user && (
            <UserAvatar
              userId={user.id}
              src={user.avatar.url}
              size="lg"
              initialStatus={user.status}
            />
          )}
          <div className="flex-1">
            <h2 className="font-bold text-lg text-text-primary">{user?.fullName}</h2>
            <p className="text-sm text-text-tertiary">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex-1 overflow-y-auto p-3 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <div className="space-y-1">
          {/* Xem hồ sơ */}
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 p-3.5 min-h-[60px] rounded-xl bg-bg-primary hover:bg-bg-hover active:bg-bg-active transition-all duration-base border-2 border-border-light"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserIcon size={22} />
            </div>
            <div className="flex-1 text-left">
              <span className="font-semibold text-text-primary">Xem hồ sơ</span>
              <p className="text-xs text-text-tertiary mt-0.5">Trang cá nhân của bạn</p>
            </div>
            <ChevronRight size={20} className="text-text-tertiary" />
          </button>

          {/* Cài đặt */}
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 p-3.5 min-h-[60px] rounded-xl bg-bg-primary hover:bg-bg-hover active:bg-bg-active transition-all duration-base border-2 border-border-light"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-secondary">
              <Settings size={22} />
            </div>
            <div className="flex-1 text-left">
              <span className="font-semibold text-text-primary">Cài đặt</span>
              <p className="text-xs text-text-tertiary mt-0.5">Bảo mật, quyền riêng tư</p>
            </div>
            <ChevronRight size={20} className="text-text-tertiary" />
          </button>

          {/* Chế độ tối */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 p-3.5 min-h-[60px] rounded-xl bg-bg-primary hover:bg-bg-hover active:bg-bg-active transition-all duration-base border-2 border-border-light"
          >
            <div className="w-10 h-10 flex items-center justify-center rounded-full bg-bg-secondary text-text-secondary">
              {mode === 'light' ? <Moon size={22} /> : <Sun size={22} />}
            </div>
            <div className="flex-1 text-left">
              <span className="font-semibold text-text-primary">Chế độ tối</span>
              <p className="text-xs text-text-tertiary mt-0.5">{mode === 'dark' ? 'Đang bật' : 'Đang tắt'}</p>
            </div>
            <div className={`w-12 h-7 rounded-full p-1 transition-all duration-base ${mode === 'dark' ? 'bg-primary' : 'bg-bg-tertiary'}`}>
              <div className={`w-5 h-5 bg-bg-primary rounded-full shadow transition-all duration-base ${mode === 'dark' ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>

          {/* Admin: Quản trị */}
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full flex items-center gap-3 p-3.5 min-h-[60px] rounded-xl bg-bg-primary hover:bg-bg-hover active:bg-bg-active transition-all duration-base border-2 border-border-light"
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-warning/10 text-warning">
                <Shield size={22} />
              </div>
              <div className="flex-1 text-left">
                <span className="font-semibold text-text-primary">Quản trị</span>
                <p className="text-xs text-text-tertiary mt-0.5">Quản lý hệ thống, người dùng...</p>
              </div>
              <ChevronRight size={20} className="text-text-tertiary" />
            </button>
          )}

          <div className="h-3" />

          {/* Đăng xuất */}
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowLogoutConfirm(true)}
            className="!justify-start p-3.5 h-auto rounded-xl bg-bg-primary hover:bg-error/5 border-2 border-error/20 text-error"
            icon={
              <div className="w-10 h-10 flex items-center justify-center rounded-full bg-error/10 text-error">
                <LogOut size={22} />
              </div>
            }
          >
            Đăng xuất
          </Button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-bg-primary border-t border-border-light flex justify-around items-stretch z-50 shadow-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 transition-all duration-base ${isActive ? 'text-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`
            }
          >
            <div className="relative">
              <item.Icon size={24} />
              {item.badge && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-bg-primary" />
              )}
            </div>
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}

        {/* Menu active */}
        <div className="flex flex-col items-center justify-center w-full min-h-[56px] py-2 gap-1 text-primary">
          <Menu size={24} />
          <span className="text-[10px] font-medium">Menu</span>
        </div>
      </nav>

      {/* Logout Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        title="Đăng xuất"
        message="Bạn có chắc chắn muốn rời khỏi phiên làm việc này?"
        confirmLabel="Đăng xuất"
      />
    </div>
  );
};

export default MobileMenuPage;
