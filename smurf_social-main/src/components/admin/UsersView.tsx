import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Search, Lock, Unlock, Eye } from 'lucide-react';
import { User, UserStatus } from '../../../shared/types';
import { userService } from '../../services/userService';
import { functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { UserAvatar, Skeleton, IconButton, Select, ConfirmDialog } from '../ui';
import { CONFIRM_MESSAGES, TOAST_MESSAGES } from '../../constants';
import { toast } from '../../store/toastStore';
import { useNavigate } from 'react-router-dom';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'banned', label: 'Đã khóa' },
];

interface ConfirmState {
  isOpen: boolean;
  type: 'ban' | 'unban';
  userId: string;
  userName: string;
}

const CONFIRM_CLOSED: ConfirmState = { isOpen: false, type: 'ban', userId: '', userName: '' };

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="bg-bg-secondary/60 px-4 py-2.5 rounded-xl border border-border-light flex flex-col items-center min-w-[90px]">
    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">{label}</span>
    <span className={`text-xl font-black ${color}`}>{value}</span>
  </div>
);

export const UsersView: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0 });
  const [confirm, setConfirm] = useState<ConfirmState>(CONFIRM_CLOSED);

  const fetchStats = useCallback(async () => {
    const s = await userService.getAdminStats();
    setStats(s);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchStats();
    const unsubscribe = userService.subscribeToAdminUsers(
      undefined,
      (fetched) => { setUsers(fetched); setIsLoading(false); },
      () => { setIsLoading(false); toast.error(TOAST_MESSAGES.ADMIN.LOAD_USERS_FAILED); }
    );
    return () => unsubscribe();
  }, [fetchStats]);

  const handleConfirmAction = useCallback(async () => {
    const { type, userId, userName } = confirm;
    try {
      await httpsCallable(functions, 'banUser')({ userId, action: type });
      toast.success(
        type === 'ban'
          ? TOAST_MESSAGES.ADMIN.BAN_SUCCESS(userName)
          : TOAST_MESSAGES.ADMIN.UNBAN_SUCCESS(userName)
      );
      fetchStats();
    } catch {
      toast.error(type === 'ban' ? TOAST_MESSAGES.ADMIN.BAN_FAILED : TOAST_MESSAGES.ADMIN.UNBAN_FAILED);
    } finally {
      setConfirm(CONFIRM_CLOSED);
    }
  }, [confirm, fetchStats]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return users.filter(u => {
      const matchSearch = !term ||
        u.fullName?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term);
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'banned' && u.status === UserStatus.BANNED) ||
        (statusFilter === 'active' && u.status !== UserStatus.BANNED);
      return matchSearch && matchStatus;
    });
  }, [users, searchTerm, statusFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-bg-primary px-4 md:px-6 py-4 border-b border-border-light flex-shrink-0 space-y-4">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Users size={18} className="text-primary" />
              Quản lý người dùng
            </h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              Theo dõi và điều phối hoạt động người dùng trên hệ thống
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatCard label="Tổng" value={stats.total} color="text-primary" />
            <StatCard label="Hoạt động" value={stats.active} color="text-success" />
            <StatCard label="Bị khóa" value={stats.banned} color="text-error" />
          </div>
        </div>

        {/* Search & filter */}
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative group">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary group-focus-within:text-primary transition-colors duration-200"
            />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên hoặc email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-bg-secondary border border-border-light rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 text-text-primary placeholder:text-text-tertiary"
            />
          </div>
          <div className="sm:w-52">
            <Select
              value={statusFilter}
              onChange={val => setStatusFilter(val as 'all' | 'active' | 'banned')}
              options={STATUS_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto scroll-hide p-4 md:p-6 bg-bg-secondary/30">
        <div className="max-w-5xl mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-bg-primary p-4 rounded-2xl border border-border-light flex items-center gap-3 animate-fade-in">
                  <Skeleton variant="circle" width={44} height={44} />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-bg-primary rounded-2xl border border-dashed border-border-light">
              <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
                <Users size={22} className="text-text-tertiary" />
              </div>
              <p className="text-sm font-semibold text-text-primary mb-1">Không tìm thấy người dùng</p>
              <p className="text-xs text-text-tertiary">Thử thay đổi từ khóa hoặc bộ lọc</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  className="bg-bg-primary px-4 py-3.5 rounded-2xl border border-border-light hover:border-primary/25 hover:shadow-md transition-all duration-200 group flex items-center justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <UserAvatar
                      userId={user.id}
                      src={user.avatar?.url}
                      name={user.fullName}
                      size="md"
                      className="flex-shrink-0 cursor-pointer"
                      onClick={() => navigate(`/profile/${user.id}`)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {user.fullName}
                        </span>
                        {user.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase">
                            Admin
                          </span>
                        )}
                        {user.status === UserStatus.BANNED && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-error/10 text-error uppercase">
                            Bị khóa
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-text-tertiary truncate block">{user.email}</span>
                    </div>
                  </div>

                  {/* Action buttons — visible on hover */}
                  <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                    <IconButton
                      icon={<Eye size={15} />}
                      onClick={() => navigate(`/profile/${user.id}`)}
                      variant="ghost"
                      size="sm"
                      title="Xem trang cá nhân"
                    />
                    {user.status === UserStatus.BANNED ? (
                      <IconButton
                        icon={<Unlock size={15} />}
                        onClick={() => setConfirm({ isOpen: true, type: 'unban', userId: user.id, userName: user.fullName })}
                        variant="ghost"
                        size="sm"
                        className="text-success hover:bg-success/10"
                        title="Mở khóa"
                      />
                    ) : (
                      <IconButton
                        icon={<Lock size={15} />}
                        onClick={() => setConfirm({ isOpen: true, type: 'ban', userId: user.id, userName: user.fullName })}
                        variant="ghost"
                        size="sm"
                        className="hover:text-error hover:bg-error/10"
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
        isOpen={confirm.isOpen}
        onClose={() => setConfirm(CONFIRM_CLOSED)}
        onConfirm={handleConfirmAction}
        title={confirm.type === 'ban'
          ? CONFIRM_MESSAGES.ADMIN.BAN_USER.TITLE
          : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.TITLE}
        message={confirm.type === 'ban'
          ? CONFIRM_MESSAGES.ADMIN.BAN_USER.MESSAGE
          : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.MESSAGE}
        confirmLabel={confirm.type === 'ban'
          ? CONFIRM_MESSAGES.ADMIN.BAN_USER.CONFIRM
          : CONFIRM_MESSAGES.ADMIN.UNBAN_USER.CONFIRM}
        variant={confirm.type === 'ban' ? 'danger' : 'primary'}
      />
    </div>
  );
};
