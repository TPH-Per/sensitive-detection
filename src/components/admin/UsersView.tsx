import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  Lock,
  Unlock,
  Eye,
  CheckCircle,
  Plus,
  Shield
} from 'lucide-react';
import { User, UserStatus } from '../../../shared/types';
import { userService } from '../../services/userService';
import { functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Button, UserAvatar, Skeleton, IconButton, Select, Input, ConfirmDialog } from '../ui';
import { CONFIRM_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { toast } from '../../store/toastStore';
import { useNavigate } from 'react-router-dom';

export const UsersView: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0 });

  const statusOptions = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'active', label: 'Đang hoạt động' },
    { value: 'banned', label: 'Đã khóa' },
  ];

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'ban' | 'unban';
    userId: string;
    userName: string;
  }>({
    isOpen: false,
    userId: '',
    userName: '',
    type: 'ban'
  });

  const fetchStats = useCallback(async () => {
    const s = await userService.getAdminStats();
    setStats(s);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchStats();
    const unsubscribe = userService.subscribeToAdminUsers(
      undefined,
      (fetchedUsers) => {
        setUsers(fetchedUsers);
        setIsLoading(false);
      },
      (error) => {
        setIsLoading(false);
        toast.error(TOAST_MESSAGES.ADMIN.LOAD_USERS_FAILED);
      }
    );

    return () => unsubscribe();
  }, [fetchStats]);

  const handleBanClick = (userId: string, userName: string) => {
    setConfirmDialog({
      isOpen: true,
      type: 'ban',
      userId,
      userName,
    });
  };

  const handleUnbanClick = (userId: string, userName: string) => {
    setConfirmDialog({
      isOpen: true,
      type: 'unban',
      userId,
      userName,
    });
  };

  const handleConfirmAction = async () => {
    const { type, userId, userName } = confirmDialog;
    try {
      const fn = httpsCallable(functions, 'banUser');
      await fn({ userId, action: type });
      
      if (type === 'ban') {
        toast.success(TOAST_MESSAGES.ADMIN.BAN_SUCCESS(userName));
      } else {
        toast.success(TOAST_MESSAGES.ADMIN.UNBAN_SUCCESS(userName));
      }
      
      fetchStats();
    } catch (error) {
      toast.error(type === 'ban' ? TOAST_MESSAGES.ADMIN.BAN_FAILED : TOAST_MESSAGES.ADMIN.UNBAN_FAILED);
    } finally {
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    }
  };

  const filteredUsers = users.filter(user => {
    const matchSearch = !searchTerm ||
      user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = statusFilter === 'all' ||
      (statusFilter === 'banned' && user.status === UserStatus.BANNED) ||
      (statusFilter === 'active' && user.status !== UserStatus.BANNED);

    return matchSearch && matchStatus;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-bg-secondary/20">
      {/* Search & Filter Header */}
      <div className="bg-bg-primary p-4 md:p-6 border-b border-border-light shadow-sm z-10">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          {/* Page Title & Stats */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-xl font-black text-text-primary flex items-center gap-2">
                <Users className="text-primary" size={24} />
                Quản lý người dùng
              </h1>
              <p className="text-xs text-text-tertiary mt-1">Theo dõi và điều phối hoạt động người dùng trên hệ thống</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-bg-secondary/50 px-4 py-2 rounded-2xl border border-border-light flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Tổng</span>
                <span className="text-lg font-black text-primary">{stats.total}</span>
              </div>
              <div className="bg-bg-secondary/50 px-4 py-2 rounded-2xl border border-border-light flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Hoạt động</span>
                <span className="text-lg font-black text-success">{stats.active}</span>
              </div>
              <div className="bg-bg-secondary/50 px-4 py-2 rounded-2xl border border-border-light flex flex-col items-center min-w-[80px]">
                <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Bị khóa</span>
                <span className="text-lg font-black text-error">{stats.banned}</span>
              </div>
            </div>
          </div>

          {/* Search & Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-primary transition-colors">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="Tìm kiếm theo tên hoặc email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-bg-secondary border border-border-light rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div className="sm:w-64">
              <Select
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as 'all' | 'active' | 'banned')}
                options={statusOptions}
                className="rounded-2xl h-[42px]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Users List Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-bg-primary p-5 rounded-2xl border border-border-light flex items-center gap-4">
                  <Skeleton variant="circle" width={52} height={52} />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-bg-primary rounded-3xl border-2 border-dashed border-border-light space-y-4">
              <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center">
                <Users size={40} className="text-text-tertiary opacity-30" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold text-text-primary">Không tìm thấy người dùng</h3>
                <p className="text-sm text-text-tertiary">Thử thay đổi từ khóa hoặc bộ lọc của bạn</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  className="bg-bg-primary p-4 rounded-2xl border border-border-light hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group flex items-center justify-between"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <UserAvatar
                        userId={user.id}
                        src={user.avatar?.url}
                        name={user.fullName}
                        size="md"
                        className="cursor-pointer ring-2 ring-transparent group-hover:ring-primary/20 transition-all"
                        onClick={() => navigate(`/profile/${user.id}`)}
                      />
                      {user.status === 'active' && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success border-2 border-bg-primary rounded-full shadow-sm" />
                      )}
                    </div>
                    
                    <div className="min-w-0 flex flex-col">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-text-primary truncate">{user.fullName}</span>
                        {user.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-primary/10 text-primary border border-primary/20 uppercase tracking-tighter">
                            Admin
                          </span>
                        )}
                        {user.status === UserStatus.BANNED && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-error/10 text-error border border-error/20 uppercase tracking-tighter">
                            Bị khóa
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-tertiary truncate leading-relaxed">{user.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all ml-4 shrink-0">
                    <IconButton
                      icon={<Eye size={16} />}
                      onClick={() => navigate(`/profile/${user.id}`)}
                      variant="secondary"
                      className="rounded-xl w-9 h-9"
                      title="Xem trang cá nhân"
                    />
                    {user.status === UserStatus.BANNED ? (
                      <IconButton
                        icon={<Unlock size={16} />}
                        onClick={() => handleUnbanClick(user.id, user.fullName)}
                        variant="secondary"
                        className="rounded-xl w-9 h-9 text-success hover:bg-success/10 hover:border-success/20"
                        title="Mở khóa"
                      />
                    ) : (
                      <IconButton
                        icon={<Lock size={16} />}
                        onClick={() => handleBanClick(user.id, user.fullName)}
                        variant="secondary"
                        className="rounded-xl w-9 h-9 text-text-tertiary hover:text-error hover:bg-error/10 hover:border-error/20"
                        title="Khóa tài khoản"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmAction}
        title={confirmDialog.type === 'ban' ? CONFIRM_MESSAGES.ADMIN.BAN_USER.TITLE : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.TITLE}
        message={
          confirmDialog.type === 'ban'
            ? CONFIRM_MESSAGES.ADMIN.BAN_USER.MESSAGE
            : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.MESSAGE
        }
        confirmLabel={confirmDialog.type === 'ban' ? CONFIRM_MESSAGES.ADMIN.BAN_USER.CONFIRM : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.CONFIRM}
        variant={confirmDialog.type === 'ban' ? 'danger' : 'primary'}
      />
    </div>
  );
};
