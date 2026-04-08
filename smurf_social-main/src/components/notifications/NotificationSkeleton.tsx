import React from 'react';
import { Skeleton } from '../ui';

export const NotificationSkeleton: React.FC = () => (
  <div>
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="flex items-start gap-3 px-4 py-3.5 border-b border-border-light/50 last:border-0 animate-fade-in"
        style={{ animationDelay: `${i * 50}ms` }}
      >
        <Skeleton variant="circle" width={40} height={40} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton variant="line" width="72%" height={13} />
          <Skeleton variant="line" width="45%" height={11} className="opacity-60" />
        </div>
        <Skeleton variant="circle" width={8} height={8} className="mt-2 flex-shrink-0 opacity-40" />
      </div>
    ))}
  </div>
);
