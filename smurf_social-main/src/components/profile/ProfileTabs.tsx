import React from 'react';

type TabType = 'posts' | 'media';

interface ProfileTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string }[] = [
  { id: 'posts', label: 'Tất cả' },
  { id: 'media', label: 'Ảnh/Video' },
];

export const ProfileTabs: React.FC<ProfileTabsProps> = ({ activeTab, onTabChange }) => (
  <div className="max-w-5xl mx-auto px-4 md:px-6 border-b border-border-light">
    <div className="flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-4 py-3.5 text-sm font-semibold transition-all duration-200 outline-none
            border-b-2 -mb-px
            ${activeTab === tab.id
              ? 'text-primary border-primary'
              : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-medium'
            }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  </div>
);
