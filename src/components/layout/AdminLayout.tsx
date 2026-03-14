import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Shield,
  Users,
  Flag,
  LogOut,
  Moon,
  Sun,
  LayoutDashboard,
  ChevronLeft
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { ConfirmDialog, UserAvatar } from '../ui';
import { useLogout } from '../../hooks/utils/useLogout';

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const handleConfirmLogout = useLogout();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navItems = [
    { to: '/admin/reports', icon: Flag, label: 'Báo cáo vi phạm' },
    { to: '/admin/users', icon: Users, label: 'Quản lý người dùng' },
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-bg-secondary overflow-hidden transition-theme">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-[260px] bg-bg-primary border-r border-border-light z-50 pt-4">
        <div className="px-6 py-4 flex items-center gap-3 border-b border-border-light mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Shield size={22} className="text-primary" />
          </div>
          <span className="font-bold text-text-primary uppercase tracking-wider text-sm">Admin Panel</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          <div className="px-4 py-2 text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-2">
            Quản trị
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full min-h-[44px] flex items-center gap-3 px-4 mx-0 my-0.5 text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active rounded-xl transition-all duration-base mb-4"
          >
            <ChevronLeft size={20} />
            Quay lại App
          </button>

          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 min-h-[44px] mx-2 my-0.5 rounded-xl transition-all duration-base ${isActive
                  ? 'bg-primary-light text-primary font-bold'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active'
                }`
              }
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border-light space-y-1">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active rounded-xl transition-all duration-base"
          >
            {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            {mode === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}
          </button>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-error active:bg-bg-active rounded-xl transition-all duration-base"
          >
            <LogOut size={20} />
            Đăng xuất
          </button>

          <div className="flex items-center gap-3 px-4 py-4 mt-2">
            <UserAvatar userId={user?.id || ''} src={user?.avatar.url} name={user?.fullName} size="md" initialStatus={user?.status} />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-text-primary truncate">{user?.fullName}</span>
              <span className="text-[11px] text-text-tertiary truncate">Administrator</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-bg-primary border-b border-border-light flex items-center justify-between px-4 z-40 sticky top-0">
          <button
            onClick={() => navigate('/')}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-tertiary hover:text-primary active:text-primary-active transition-all duration-base rounded-lg"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="font-bold text-sm uppercase">Admin Panel</span>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-tertiary hover:text-primary active:text-primary-active transition-all duration-base rounded-lg">
              {mode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
          </div>
        </header>

        {/* Mobile Tabs */}
        <nav className="md:hidden flex overflow-x-auto border-b border-border-light bg-bg-primary px-2 py-1.5 gap-1 no-scrollbar flex-shrink-0">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex-shrink-0 flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold whitespace-nowrap transition-all duration-base ${isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary active:bg-bg-active'
                }`
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-hidden relative">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        title="Đăng xuất Admin"
        message="Bạn có chắc chắn muốn thoát khỏi phiên làm việc quản trị?"
        confirmLabel="Đăng xuất"
      />
    </div>
  );
};
