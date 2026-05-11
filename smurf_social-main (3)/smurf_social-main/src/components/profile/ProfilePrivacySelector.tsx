import React from 'react';
import { Visibility } from '../../../shared/types';
import { Globe, Users, Lock } from 'lucide-react';

interface ProfilePrivacySelectorProps {
  value: Visibility;
  onChange: (value: Visibility) => void;
  label?: string;
}

const ProfilePrivacySelector: React.FC<ProfilePrivacySelectorProps> = ({ value, onChange, label }) => {
  const options = [
    { value: Visibility.PUBLIC, icon: Globe, label: 'Công khai', color: 'text-primary' },
    { value: Visibility.FRIENDS, icon: Users, label: 'Bạn bè', color: 'text-primary' },
    { value: Visibility.PRIVATE, icon: Lock, label: 'Chỉ mình tôi', color: 'text-text-tertiary' },
  ];

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-text-tertiary font-bold ml-1 uppercase tracking-tighter">{label}</span>}
      <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-xl border border-border-light w-fit">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              title={opt.label}
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                isActive 
                  ? `bg-bg-primary shadow-sm border border-border-light ${opt.color}` 
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProfilePrivacySelector;
