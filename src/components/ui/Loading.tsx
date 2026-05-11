import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingProps {
  variant?: 'spinner' | 'page' | 'overlay' | 'inline';
  size?: 'sm' | 'md' | 'lg' | number;
  text?: string;
  className?: string;
  color?: string;
}

export const Loading: React.FC<LoadingProps> = ({
  variant = 'spinner',
  size = 'md',
  text,
  className = '',
  color = 'text-primary',
}) => {
  const iconSize = typeof size === 'number' ? size : ({ sm: 16, md: 32, lg: 48 })[size];
  const spinner = <Loader2 className={`animate-spin ${color} shrink-0`} size={iconSize} />;

  if (variant === 'page') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg-primary transition-theme" style={{ zIndex: 'var(--z-toast)' }}>
        {spinner}
        {text && <p className="mt-4 text-text-secondary font-medium">{text}</p>}
      </div>
    );
  }

  if (variant === 'overlay') {
    return (
      <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-primary/60 backdrop-blur-[2px] rounded-[inherit] transition-theme ${className}`}>
        {spinner}
        {text && <p className="mt-2 text-text-secondary text-sm font-medium">{text}</p>}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`flex flex-col items-center justify-center p-8 w-full ${className}`}>
        {spinner}
        {text && <p className="mt-2 text-text-secondary text-sm font-medium">{text}</p>}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      {spinner}
      {text && <span className="ml-2 text-text-secondary text-sm font-medium">{text}</span>}
    </div>
  );
};
