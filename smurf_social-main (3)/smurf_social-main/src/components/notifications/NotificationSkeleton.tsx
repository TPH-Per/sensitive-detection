import React from 'react';
import { Skeleton } from '../ui';

export const NotificationSkeleton: React.FC = () => (
  <div className="p-2 space-y-1.5">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="flex items-start gap-3.5 px-4 py-3.5 bg-bg-primary rounded-xl border border-border-subtle animate-in fade-in duration-500"
        style={{ animationDelay: `${i * 80}ms` }}
      >
        <Skeleton variant="circle" width={40} height={40} className="flex-shrink-0" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton variant="line" width="90%" height={15} />
          <Skeleton variant="line" width="40%" height={12} className="opacity-40" />
        </div>
        <div className="min-w-[28px] self-stretch flex items-center justify-center">
          <Skeleton variant="circle" width={6} height={6} className="opacity-20" />
        </div>
      </div>
    ))}
  </div>
);
