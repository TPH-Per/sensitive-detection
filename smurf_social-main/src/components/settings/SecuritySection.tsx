import React from 'react';
import { Key, ChevronRight } from 'lucide-react';
import SettingItem from './SettingItem';

interface SecuritySectionProps {
  onOpenChangePassword: () => void;
}

const SecuritySection: React.FC<SecuritySectionProps> = ({ onOpenChangePassword }) => (
  <div className="space-y-3 animate-fade-in">
    <SettingItem
      icon={<Key size={18} />}
      title="Đổi mật khẩu"
      description="Cập nhật mật khẩu để bảo vệ tài khoản"
      onClick={onOpenChangePassword}
      action={<ChevronRight size={16} className="text-text-tertiary" />}
    />
  </div>
);

export default React.memo(SecuritySection);
