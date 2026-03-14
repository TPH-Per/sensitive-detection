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
import { User, UserStatus } from '../../types';
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
    type: 'ban',
    userId: '',
    userName: '',
  });

  useEffect(() => {
    setIsLoading(true);
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
  }, []);

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Search & Stats Header */}
      <div className="bg-bg-primary p-4 border-b border-border-light space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Tìm kiếm tên hoặc email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={18} />}
              containerClassName=""
              className="bg-bg-secondary border border-border-light text-sm"
            />
          </div>

          <div className="flex-1 sm:flex-initial min-w-[160px]">
            <Select
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as 'all' | 'active' | 'banned')}
              options={statusOptions}
            />
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto bg-bg-secondary/30 p-4 md:p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 gap-4">
          {isLoading ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="bg-bg-primary p-5 rounded-2xl border border-border-light flex items-center gap-4">
                <Skeleton variant="circle" width={56} height={56} />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            ))
          ) : filteredUsers.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-bg-primary rounded-2xl border border-border-light border-dashed">
              <Users size={48} className="mx-auto text-text-tertiary opacity-20 mb-4" />
              <p className="text-text-secondary font-medium">Không tìm thấy người dùng</p>
            </div>
          ) : (
            filteredUsers.map(user => (
              <div
                key={user.id}
                className="bg-bg-primary p-5 rounded-xl border border-border-light shadow-sm hover:border-primary/20 active:bg-bg-hover transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-4 overflow-hidden">
                  <UserAvatar
                    userId={user.id}
                    size="md"
                    className="shrink-0"
                    onClick={() => navigate(`/profile/${user.id}`)}
                  />
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary truncate">{user.fullName}</span>
                      {user.status === 'banned' && (
                        <div className="flex items-center">
                          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                            Quản trị viên
                          </span>
                          <span className="sm:hidden p-1 rounded bg-primary/10 text-primary" title="Quản trị viên">
                            <Shield size={10} />
                          </span>
                        </div>
                      )}
                      {user.status === UserStatus.BANNED && (
                        <div className="flex items-center">
                          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-error/10 text-error border border-error/20 uppercase">
                            Đã khóa
                          </span>
                          <span className="sm:hidden p-1 rounded bg-error/10 text-error" title="Đã khóa">
                            <Lock size={10} />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-text-tertiary truncate">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <IconButton
                    icon={<Eye size={18} />}
                    onClick={() => navigate(`/profile/${user.id}`)}
                    variant="secondary"
                    title="Xem chi tiết"
                  />
                  {user.status === 'banned' ? (
                    <IconButton
                      icon={<Unlock size={18} />}
                      onClick={() => handleUnbanClick(user.id, user.fullName)}
                      variant="secondary"
                      className="text-error hover:bg-error/10"
                      title="Mở khóa tài khoản"
                    />
                  ) : (
                    <IconButton
                      icon={<Lock size={18} />}
                      onClick={() => handleBanClick(user.id, user.fullName)}
                      variant="secondary"
                      className="text-text-tertiary hover:text-error hover:bg-error/10"
                      title="Khóa tài khoản"
                    />
                  )}
                </div>
              </div>
            ))
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
