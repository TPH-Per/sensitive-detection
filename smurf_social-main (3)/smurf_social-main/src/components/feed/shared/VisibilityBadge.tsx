import React from 'react';
import { Users, Lock, Globe } from 'lucide-react';
import { Visibility } from '../../../../shared/types';

const VISIBILITY_ICONS: Record<Visibility, { Icon: typeof Users; title: string }> = {
  [Visibility.PUBLIC]: { Icon: Globe, title: 'Công khai' },
  [Visibility.FRIENDS]: { Icon: Users, title: 'Bạn bè' },
  [Visibility.PRIVATE]: { Icon: Lock, title: 'Chỉ mình tôi' }
};

interface VisibilityBadgeProps {
  visibility: Visibility;
  size?: number;
  className?: string;
}

const VisibilityBadgeInner: React.FC<VisibilityBadgeProps> = ({
  visibility,
  size = 12,
  className = ''
}) => {
  const { Icon, title } = VISIBILITY_ICONS[visibility];
  return (
    <span title={title}>
      <Icon size={size} className={className} />
    </span>
  );
};

export const VisibilityBadge = React.memo(VisibilityBadgeInner);
