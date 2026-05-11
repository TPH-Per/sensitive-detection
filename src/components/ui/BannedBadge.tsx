import React from 'react';
import { Lock } from 'lucide-react';

interface BannedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
}

const sizeConfig: Record<NonNullable<BannedBadgeProps['size']>, {
  icon: number; className: string; showText: boolean;
}> = {
  sm: {
    icon: 10,
    className: 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-error/10 text-error flex-shrink-0',
    showText: false,
  },
  md: {
    icon: 10,
    className: 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-error/10 text-error',
    showText: true,
  },
  lg: {
    icon: 12,
    className: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-error/10 text-error',
    showText: true,
  },
};

export const BannedBadge: React.FC<BannedBadgeProps> = ({ size = 'md' }) => {
  const { icon, className, showText } = sizeConfig[size];
  return (
    <span className={className}>
      <Lock size={icon} />
      {showText && 'Đã khóa'}
    </span>
  );
};
