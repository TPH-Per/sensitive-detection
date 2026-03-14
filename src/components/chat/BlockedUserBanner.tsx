import React from 'react';
import { Ban, Settings2 } from 'lucide-react';
import { Button } from '../ui';
import { BlockOptions } from '../../types';

interface BlockedUserBannerProps {
  partnerName: string;
  blockOptions?: BlockOptions;
  onUnblock: () => void;
  onManageBlock?: () => void;
}

export const BlockedUserBanner: React.FC<BlockedUserBannerProps> = ({
  partnerName,
  blockOptions,
  onUnblock,
  onManageBlock,
}) => {
  const blockedLabel = blockOptions?.blockMessages
    ? `Bạn đã chặn tin nhắn từ ${partnerName}`
    : `Bạn đã chặn ${partnerName}`;

  return (
    <div className="flex-shrink-0 bg-bg-primary border-b border-border-light px-4 py-3 transition-theme">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-9 h-9 bg-error-light rounded-full flex items-center justify-center">
          <Ban size={18} className="text-error" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">Đã chặn</p>
          <p className="text-xs text-text-secondary truncate">{blockedLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onManageBlock && (
            <Button
              onClick={onManageBlock}
              variant="secondary"
              size="sm"
              icon={<Settings2 size={14} />}
            >
              Quản lý
            </Button>
          )}
          <Button onClick={onUnblock} variant="primary" size="sm">
            Bỏ chặn
          </Button>
        </div>
      </div>
    </div>
  );
};
