import React from 'react';
import SkeletonLib, { SkeletonProps as SkeletonLibProps, SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

interface SkeletonProps extends SkeletonLibProps {
  className?: string;
  variant?: 'line' | 'circle' | 'rect';
}

// Wrapper toàn cục — dùng một lần ở root thay vì mỗi instance
export const SkeletonProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SkeletonTheme baseColor="var(--bg-hover)" highlightColor="var(--bg-primary)">
    {children}
  </SkeletonTheme>
);

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect', ...props }) => (
  <SkeletonLib circle={variant === 'circle'} className={className} {...props} />
);
