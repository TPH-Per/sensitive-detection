import React, { useState, useEffect, useCallback } from 'react';
import {
  Ban,
  UserCheck,
  Shield,
  Key,
  Moon,
  Sun,
  MessageCircle,
  Phone,
  EyeOff,
  Settings2,
  Eye,
  Globe,
  Users,
  Lock,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { useUserCache } from '../store/userCacheStore';
import { useLoadingStore } from '../store/loadingStore';
import { User, BlockOptions, UserSettings, Visibility, BlockedUserEntry } from '../types';
import { UserAvatar, ConfirmDialog, Button, Skeleton, BlockOptionsModal, Dropdown, DropdownItem } from '../components/ui';
import { CONFIRM_MESSAGES } from '../constants';
import ChangePasswordModal from '../components/settings/ChangePasswordModal';
import { userService } from '../services/userService';

type SettingSection = 'appearance' | 'privacy' | 'security' | 'blocked';

const BASE_MENU_ITEMS: { id: SettingSection; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'appearance', label: 'Giao diện', icon: <Moon size={20} /> },
  { id: 'privacy', label: 'Quyền riêng tư', icon: <Eye size={20} /> },
  { id: 'security', label: 'Bảo mật', icon: <Shield size={20} /> },
  { id: 'blocked', label: 'Người dùng đã chặn', icon: <Ban size={20} /> },
];

const Toggle = React.memo(({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
  <div
    onClick={onToggle}
    className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-all duration-base ${enabled ? 'bg-primary' : 'bg-bg-tertiary'
      }`}
  >
    <div className={`w-4 h-4 bg-bg-primary rounded-full shadow-md transition-transform duration-base ${enabled ? 'translate-x-6' : 'translate-x-0'
      }`} />
  </div>
));

const SettingItem = React.memo(({
  icon,
  title,
  description,
  action,
  onClick
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    className={`flex items-center justify-between p-4 bg-bg-primary rounded-xl border-2 border-border-light ${onClick ? 'cursor-pointer hover:bg-bg-hover active:bg-bg-active transition-all duration-base' : ''
      }`}
  >
    <div className="flex items-center gap-4">
      <div className="p-2 bg-primary-light rounded-lg text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-text-primary">{title}</h3>
        <p className="text-sm text-text-tertiary">{description}</p>
      </div>
    </div>
    {action}
  </div>
));

// Tag hiển thị options đang active
const BlockOptionTags: React.FC<{ options: BlockOptions }> = ({ options }) => {
  const tags: { icon: React.ReactNode; label: string }[] = [];
  if (options.blockMessages) tags.push({ icon: <MessageCircle size={10} />, label: 'Tin nhắn' });
  if (options.blockCalls) tags.push({ icon: <Phone size={10} />, label: 'Gọi điện' });
  if (options.blockViewMyActivity || options.hideTheirActivity) tags.push({ icon: <EyeOff size={10} />, label: 'Nhật ký' });

  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {tags.map(t => (
        <span key={t.label} className="flex items-center gap-1 text-[10px] text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded-full border border-border-light">
          {t.icon} {t.label}
        </span>
      ))}
    </div>
  );
};

interface BlockedUserWithOptions {
  user: User;
  options: BlockedUserEntry;
}

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const { mode, toggleTheme } = useThemeStore();
  const { users: userCache, fetchUsers } = useUserCache();

  const [activeSection, setActiveSection] = useState<SettingSection>('appearance');
  const [blockedList, setBlockedList] = useState<BlockedUserWithOptions[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const setLoading = useLoadingStore(state => state.setLoading);
  const isLoading = useLoadingStore(state => state.loadingStates['settings']);
  const [unblockUserId, setUnblockUserId] = useState<string | null>(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [manageBlockTarget, setManageBlockTarget] = useState<BlockedUserWithOptions | null>(null);

  const isAdmin = !!currentUser;
  const MENU_ITEMS = BASE_MENU_ITEMS.filter(item => !item.adminOnly || isAdmin);

  const loadSettings = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await userService.getUserSettings(currentUser.id);
      setSettings(data);
    } catch (error) {
      console.error("Lỗi load settings", error);
    }
  }, [currentUser?.id]);

  const loadBlockedUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      const blockedMap = await userService.getBlockedUsers(currentUser.id);
      const ids = Object.keys(blockedMap);
      if (ids.length === 0) {
        setBlockedList([]);
        return;
      }
      await fetchUsers(ids);
      const list: BlockedUserWithOptions[] = ids
        .map(id => {
          const user = userCache[id];
          if (!user) return null;
          return { user, options: blockedMap[id] };
        })
        .filter((item): item is BlockedUserWithOptions => !!item);
      setBlockedList(list);
    } finally {
      setLoading('settings', false);
    }
  }, [currentUser?.id, fetchUsers]);

  useEffect(() => {
    loadSettings();
    loadBlockedUsers();
  }, [loadSettings, loadBlockedUsers]);

  // Cập nhật lại khi userCache thay đổi
  useEffect(() => {
    if (!currentUser) return;
    userService.getBlockedUsers(currentUser.id).then(blockedMap => {
      const ids = Object.keys(blockedMap);
      const list: BlockedUserWithOptions[] = ids
        .map(id => {
          const user = userCache[id];
          if (!user) return null;
          return { user, options: blockedMap[id] };
        })
        .filter((item): item is BlockedUserWithOptions => !!item);
      setBlockedList(list);
    });
  }, [userCache, currentUser?.id]);

  const handleUnblock = async () => {
    if (!unblockUserId || !currentUser) return;
    try {
      await userService.unblockUser(currentUser.id, unblockUserId);
      useAuthStore.getState().updateBlockEntry('remove', unblockUserId);
      setBlockedList(prev => prev.filter(item => item.user.id !== unblockUserId));
    } catch (error) {
      console.error("Lỗi bỏ chặn", error);
    } finally {
      setUnblockUserId(null);
    }
  };

  const handleUpdateBlockOptions = async (options: BlockOptions) => {
    if (!manageBlockTarget || !currentUser) return;
    
    const hasAnyOption = options.blockMessages || 
                        options.blockCalls || 
                        options.blockViewMyActivity || 
                        options.hideTheirActivity;
    
    if (!hasAnyOption) {
      const targetId = manageBlockTarget.user.id;
      try {
        await userService.unblockUser(currentUser.id, targetId);
        useAuthStore.getState().updateBlockEntry('remove', targetId);
        setBlockedList(prev => prev.filter(item => item.user.id !== targetId));
        return;
      } catch (error) {
        console.error("Lỗi bỏ chặn khi update options", error);
        return;
      }
    }

    await userService.blockUser(currentUser.id, manageBlockTarget.user.id, options);
    useAuthStore.getState().updateBlockEntry('add', manageBlockTarget.user.id, options);
    setBlockedList(prev => prev.map(item =>
      item.user.id === manageBlockTarget.user.id ? { ...item, options: { ...item.options, ...options } } : item
    ));
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'appearance':
        return (
          <div className="space-y-4">
            <SettingItem
              icon={mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
              title="Chế độ tối"
              description={mode === 'dark' ? 'Đang bật' : 'Đang tắt'}
              action={<Toggle enabled={mode === 'dark'} onToggle={toggleTheme} />}
            />
          </div>
        );
      case 'privacy':
        if (!settings) return <Skeleton height={200} />;
        return (
          <div className="space-y-4">
            <SettingItem
              icon={<Eye size={20} />}
              title="Trạng thái online"
              description="Cho phép người khác thấy bạn đang hoạt động"
              action={
                <Toggle
                  enabled={settings.showOnlineStatus}
                  onToggle={async () => {
                    const newValue = !settings.showOnlineStatus;
                    setSettings({ ...settings, showOnlineStatus: newValue });
                    await userService.updateUserSettings(currentUser!.id, { showOnlineStatus: newValue });
                  }}
                />
              }
            />
            <SettingItem
              icon={<MessageCircle size={20} />}
              title="Thông báo đã xem"
              description="Cho phép người khác biết khi bạn đã xem tin nhắn"
              action={
                <Toggle
                  enabled={settings.showReadReceipts}
                  onToggle={async () => {
                    const newValue = !settings.showReadReceipts;
                    setSettings({ ...settings, showReadReceipts: newValue });
                    await userService.updateUserSettings(currentUser!.id, { showReadReceipts: newValue });
                  }}
                />
              }
            />
            <div className="p-4 bg-bg-primary rounded-xl border-2 border-border-light">
              <div className="flex items-center gap-4 mb-3">
                <div className="p-2 bg-primary-light rounded-lg text-primary">
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">Quyền riêng tư bài viết mặc định</h3>
                  <p className="text-sm text-text-tertiary">Áp dụng cho các bài viết mới của bạn</p>
                </div>
              </div>
              <Dropdown
                align="left"
                className="w-full"
                matchTriggerWidth
                trigger={
                  <div className="flex items-center justify-between w-full px-4 py-2.5 bg-bg-secondary rounded-xl border border-border-light hover:bg-bg-hover transition-all duration-base cursor-pointer">
                    <div className="flex items-center gap-3">
                      {settings.defaultPostVisibility === Visibility.PUBLIC && <Globe size={16} className="text-primary" />}
                      {settings.defaultPostVisibility === Visibility.FRIENDS && <Users size={16} className="text-primary" />}
                      {settings.defaultPostVisibility === Visibility.PRIVATE && <Lock size={16} className="text-primary" />}
                      <span className="text-sm font-medium text-text-primary">
                        {settings.defaultPostVisibility === Visibility.PUBLIC && 'Công khai'}
                        {settings.defaultPostVisibility === Visibility.FRIENDS && 'Bạn bè'}
                        {settings.defaultPostVisibility === Visibility.PRIVATE && 'Chỉ mình tôi'}
                      </span>
                    </div>
                    <Settings2 size={14} className="text-text-tertiary" />
                  </div>
                }
              >
                <DropdownItem
                  icon={<Globe size={16} />}
                  label="Công khai"
                  onClick={async () => {
                    setSettings({ ...settings, defaultPostVisibility: Visibility.PUBLIC });
                    await userService.updateUserSettings(currentUser!.id, { defaultPostVisibility: Visibility.PUBLIC });
                  }}
                />
                <DropdownItem
                  icon={<Users size={16} />}
                  label="Bạn bè"
                  onClick={async () => {
                    setSettings({ ...settings, defaultPostVisibility: Visibility.FRIENDS });
                    await userService.updateUserSettings(currentUser!.id, { defaultPostVisibility: Visibility.FRIENDS });
                  }}
                />
                <DropdownItem
                  icon={<Lock size={16} />}
                  label="Chỉ mình tôi"
                  onClick={async () => {
                    setSettings({ ...settings, defaultPostVisibility: Visibility.PRIVATE });
                    await userService.updateUserSettings(currentUser!.id, { defaultPostVisibility: Visibility.PRIVATE });
                  }}
                />
              </Dropdown>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-4">
            <SettingItem
              icon={<Key size={20} />}
              title="Đổi mật khẩu"
              description="Cập nhật mật khẩu để bảo vệ tài khoản"
              onClick={() => setIsChangePasswordOpen(true)}
            />
          </div>
        );

      case 'blocked':
        return (
          <div className="space-y-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-bg-primary rounded-xl border border-border-light">
                    <Skeleton variant="circle" width={40} height={40} />
                    <div className="flex-1 space-y-2">
                      <Skeleton width={120} height={16} />
                      <Skeleton width={80} height={12} />
                    </div>
                    <Skeleton width={80} height={32} />
                  </div>
                ))}
              </div>
            ) : blockedList.length === 0 ? (
              <div className="text-center py-12 text-text-tertiary bg-bg-primary rounded-xl border-2 border-border-light">
                <Ban size={48} className="mx-auto mb-3 opacity-30" />
                <p>Chưa có người dùng nào bị chặn</p>
              </div>
            ) : (
              <div className="bg-bg-primary rounded-xl border-2 border-border-light overflow-hidden">
                {blockedList.map(({ user, options }) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 p-3 border-b border-border-light last:border-b-0"
                  >
                    <UserAvatar
                      userId={user.id}
                      src={user.avatar.url}
                      name={user.fullName}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-text-primary truncate">{user.fullName}</h3>
                      <BlockOptionTags options={options} />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setManageBlockTarget({ user, options })}
                        icon={<Settings2 size={14} />}
                      >
                        Chỉnh sửa
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setUnblockUserId(user.id)}
                        icon={<UserCheck size={16} />}
                      >
                        Bỏ chặn
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full w-full bg-bg-secondary">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex flex-col w-[260px] lg:w-[320px] border-r border-border-light bg-bg-primary pt-4">
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-sm font-semibold text-text-tertiary uppercase tracking-wider">
            Cài đặt
          </div>

          {MENU_ITEMS.map(item => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-4 py-3 mx-2 my-0.5 cursor-pointer rounded-xl transition-all ${activeSection === item.id
                ? 'bg-primary-light text-primary'
                : 'hover:bg-bg-hover text-text-secondary'
                }`}
              onClick={() => setActiveSection(item.id)}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
              {item.id === 'blocked' && blockedList.length > 0 && (
                <span className="ml-auto text-xs bg-bg-secondary px-2 py-0.5 rounded-full border-2 border-border-light">
                  {blockedList.length}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full bg-bg-primary md:bg-bg-secondary overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border-light bg-bg-primary flex-shrink-0">
          <h2 className="text-lg font-bold text-text-primary">
            {MENU_ITEMS.find(m => m.id === activeSection)?.label}
          </h2>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex overflow-x-auto border-b border-border-light bg-bg-primary px-2 py-1.5 gap-1 no-scrollbar flex-shrink-0">
          {MENU_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg text-sm whitespace-nowrap transition-all duration-base ${activeSection === item.id
                ? 'bg-primary-light text-primary font-medium'
                : 'text-text-secondary hover:bg-bg-hover'
                }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          <div className="max-w-2xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={!!unblockUserId}
        onClose={() => setUnblockUserId(null)}
        onConfirm={handleUnblock}
        title={CONFIRM_MESSAGES.FRIEND.UNBLOCK.TITLE}
        message={CONFIRM_MESSAGES.FRIEND.UNBLOCK.MESSAGE(blockedList.find(item => item.user.id === unblockUserId)?.user.fullName || 'người này')}
        confirmLabel={CONFIRM_MESSAGES.FRIEND.UNBLOCK.CONFIRM}
      />

      {manageBlockTarget && (
        <BlockOptionsModal
          isOpen
          targetName={manageBlockTarget.user.fullName}
          initialOptions={manageBlockTarget.options}
          onApply={handleUpdateBlockOptions}
          onClose={() => setManageBlockTarget(null)}
        />
      )}

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
};

export default SettingsPage;
