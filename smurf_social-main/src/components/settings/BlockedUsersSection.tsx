import React from 'react';
import { Ban, Settings2, MessageSquareOff, PhoneOff, EyeOff } from 'lucide-react';
import { User, BlockOptions, BlockedUserEntry } from '../../../shared/types';
import { UserAvatar, Button, Skeleton } from '../ui';

export interface BlockedUserWithOptions {
  user: User;
  options: BlockedUserEntry;
}

interface BlockedUsersSectionProps {
  isLoading: boolean;
  blockedList: BlockedUserWithOptions[];
  onManageBlock: (target: BlockedUserWithOptions) => void;
}

const BLOCK_TAG_MAP: {
  key: keyof BlockOptions;
  icon: React.ReactNode;
  label: string;
  color: string;
}[] = [
    { key: 'blockMessages', icon: <MessageSquareOff size={10} />, label: 'Tin nhắn', color: 'text-error bg-error/10 border-error/20' },
    { key: 'blockCalls', icon: <PhoneOff size={10} />, label: 'Cuộc gọi', color: 'text-warning bg-warning/10 border-warning/20' },
    { key: 'blockViewMyActivity', icon: <EyeOff size={10} />, label: 'Xem mình', color: 'text-primary bg-primary/10 border-primary/20' },
    { key: 'hideTheirActivity', icon: <EyeOff size={10} />, label: 'Ẩn họ', color: 'text-info bg-info/10 border-info/20' },
  ];

const BlockOptionTags: React.FC<{ options: BlockOptions }> = React.memo(({ options }) => {
  const active = BLOCK_TAG_MAP.filter(t => options[t.key]);
  if (active.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-1.5">
      {active.map(t => (
        <span
          key={t.key}
          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${t.color}`}
        >
          {t.icon}
          {t.label}
        </span>
      ))}
    </div>
  );
});

const BlockedUsersSection: React.FC<BlockedUsersSectionProps> = ({
  isLoading, blockedList, onManageBlock,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-2.5 animate-fade-in">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 p-4 bg-bg-primary rounded-2xl border border-border-light">
            <Skeleton variant="circle" width={44} height={44} />
            <div className="flex-1 space-y-1.5">
              <Skeleton width="40%" height={14} />
              <Skeleton width="60%" height={11} />
            </div>
            <Skeleton width={88} height={36} className="rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (blockedList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center bg-bg-primary rounded-2xl border border-border-light animate-fade-in">
        <div className="w-14 h-14 bg-bg-secondary rounded-full flex items-center justify-center mb-3 border border-border-light">
          <Ban size={24} className="text-text-tertiary" />
        </div>
        <p className="text-sm font-medium text-text-secondary">Chưa có người dùng nào bị chặn</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-primary rounded-2xl border border-border-light overflow-hidden animate-fade-in">
      {blockedList.map((item, idx) => (
        <div
          key={item.user.id}
          className={`flex items-center gap-3.5 px-4 py-3.5 hover:bg-bg-hover transition-colors duration-200
            ${idx < blockedList.length - 1 ? 'border-b border-border-light/60' : ''}`}
        >
          <UserAvatar
            userId={item.user.id}
            src={item.user.avatar?.url}
            name={item.user.fullName}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {item.user.fullName}
            </h3>
            <BlockOptionTags options={item.options} />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onManageBlock(item)}
            icon={<Settings2 size={14} />}
            className="flex-shrink-0"
          >
            Quản lý
          </Button>
        </div>
      ))}
    </div>
  );
};

export default React.memo(BlockedUsersSection);
