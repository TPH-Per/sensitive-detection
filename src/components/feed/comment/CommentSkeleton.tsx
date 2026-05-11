import React from 'react';
import { Skeleton } from '../../ui/Skeleton';

interface CommentSkeletonProps {
  count?: number;
  depth?: number;
}

export const CommentSkeleton: React.FC<CommentSkeletonProps> = ({
  count = 3,
  depth = 0,
}) => (
  <div className={`space-y-4 ${depth > 0 ? 'ml-9 mt-2' : ''}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex gap-2.5 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
        {/* Avatar */}
        <Skeleton
          variant="circle"
          width={depth > 0 ? 24 : 32}
          height={depth > 0 ? 24 : 32}
          className="flex-shrink-0"
        />

        {/* Bubble */}
        <div className="flex-1 max-w-[80%]">
          <div className="bg-bg-secondary rounded-2xl px-3.5 py-2.5 space-y-1.5 border border-border-light/30">
            <Skeleton width={90} height={11} className="opacity-70" />
            <Skeleton width="88%" height={13} />
            {i % 2 === 0 && <Skeleton width="55%" height={13} className="opacity-60" />}
          </div>
          {/* Meta row */}
          <div className="flex gap-3 mt-1.5 ml-1">
            <Skeleton width={36} height={10} className="opacity-40" />
            <Skeleton width={36} height={10} className="opacity-40" />
            <Skeleton width={36} height={10} className="opacity-40" />
          </div>
        </div>
      </div>
    ))}
  </div>
);
