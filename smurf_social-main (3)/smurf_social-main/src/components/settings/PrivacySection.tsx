import React, { useCallback } from 'react';
import { Eye, MessageCircle, Users, Lock, ChevronDown, Globe, CheckCheck, MessageSquareQuote } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { userService } from '../../services/userService';
import { presenceService } from '../../services/presenceService';
import { Visibility } from '../../../shared/types';
import { Skeleton, Dropdown, DropdownItem } from '../ui';
import SettingItem from './SettingItem';
import Toggle from './Toggle';

const PrivacySection: React.FC = () => {
  const { user: currentUser, settings, updateSettings } = useAuthStore();

  const handleToggleOnlineStatus = useCallback(async () => {
    if (!currentUser || !settings) return;
    const newValue = !settings.showOnlineStatus;
    updateSettings({ showOnlineStatus: newValue });
    await userService.updateUserSettings(currentUser.id, { showOnlineStatus: newValue });
    await presenceService.setOnline(currentUser.id).catch(console.error);
  }, [currentUser, settings, updateSettings]);

  const handleToggleReadReceipts = useCallback(async () => {
    if (!currentUser || !settings) return;
    const newValue = !settings.showReadReceipts;
    updateSettings({ showReadReceipts: newValue });
    await userService.updateUserSettings(currentUser.id, { showReadReceipts: newValue });
  }, [currentUser, settings, updateSettings]);
  
  const handleToggleAllowMessagesFromStrangers = useCallback(async () => {
    if (!currentUser || !settings) return;
    const newValue = !settings.allowMessagesFromStrangers;
    updateSettings({ allowMessagesFromStrangers: newValue });
    await userService.updateUserSettings(currentUser.id, { allowMessagesFromStrangers: newValue });
  }, [currentUser, settings, updateSettings]);

  const handleChangeVisibility = useCallback(async (visibility: Visibility) => {
    if (!currentUser) return;
    updateSettings({ defaultPostVisibility: visibility });
    await userService.updateUserSettings(currentUser.id, { defaultPostVisibility: visibility });
  }, [currentUser, updateSettings]);

  if (!settings || !currentUser) return <Skeleton height={200} className="rounded-2xl" />;

  const visibilityMap: Record<Visibility, { label: string; Icon: typeof Users }> = {
    [Visibility.PUBLIC]: { label: 'Công khai', Icon: Globe },
    [Visibility.FRIENDS]: { label: 'Bạn bè', Icon: Users },
    [Visibility.PRIVATE]: { label: 'Chỉ mình tôi', Icon: Lock },
  };

  const { label: visibilityLabel, Icon: VisibilityIcon } = visibilityMap[settings.defaultPostVisibility] ?? visibilityMap[Visibility.FRIENDS];

  return (
    <div className="space-y-3 animate-fade-in">
      <SettingItem
        icon={<Eye size={18} />}
        title="Trạng thái online"
        description="Cho phép người khác thấy bạn đang hoạt động"
        action={<Toggle enabled={settings.showOnlineStatus} onToggle={handleToggleOnlineStatus} />}
      />

      <SettingItem
        icon={<CheckCheck size={18} />}
        title="Thông báo đã xem"
        description="Cho phép người khác biết khi bạn đã xem tin nhắn"
        action={<Toggle enabled={settings.showReadReceipts} onToggle={handleToggleReadReceipts} />}
      />

      <SettingItem
        icon={<MessageSquareQuote size={18} />}
        title="Tin nhắn từ người lạ"
        description="Cho phép người lạ khởi đầu cuộc trò chuyện với bạn"
        action={<Toggle enabled={settings.allowMessagesFromStrangers} onToggle={handleToggleAllowMessagesFromStrangers} />}
      />

      {/* Post visibility */}
      <div className="p-4 bg-bg-primary rounded-2xl border border-border-light">
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0">
            <Users size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Quyền riêng tư bài viết mặc định</h3>
            <p className="text-xs text-text-tertiary mt-0.5">Áp dụng cho các bài viết mới của bạn</p>
          </div>
        </div>

        <Dropdown
          align="left"
          className="w-full"
          matchTriggerWidth
          trigger={
            <div className="flex items-center justify-between w-full px-3.5 py-2.5 bg-bg-secondary rounded-xl border border-border-light hover:bg-bg-hover transition-colors duration-200 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <VisibilityIcon size={16} className="text-primary flex-shrink-0" />
                <span className="text-sm font-medium text-text-primary">{visibilityLabel}</span>
              </div>
              <ChevronDown size={15} className="text-text-tertiary" />
            </div>
          }
        >
          <DropdownItem
            icon={<Globe size={15} />}
            label="Công khai"
            onClick={() => handleChangeVisibility(Visibility.PUBLIC)}
          />
          <DropdownItem
            icon={<Users size={15} />}
            label="Bạn bè"
            onClick={() => handleChangeVisibility(Visibility.FRIENDS)}
          />
          <DropdownItem
            icon={<Lock size={15} />}
            label="Chỉ mình tôi"
            onClick={() => handleChangeVisibility(Visibility.PRIVATE)}
          />
        </Dropdown>
      </div>
    </div>
  );
};

export default React.memo(PrivacySection);
