import React from 'react';

export const iconSizes = { sm: 16, md: 18, lg: 20 } as const;

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const base =
  'inline-flex items-center justify-center font-semibold transition-colors duration-200 outline-none ' +
  'border border-transparent focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed active:brightness-95';

const variants: Record<NonNullable<IconButtonProps['variant']>, string> = {
  primary:
    'btn-gradient text-text-on-primary shadow-sm hover:brightness-110',
  secondary:
    'bg-bg-secondary text-text-primary border-border-light hover:bg-bg-hover active:bg-bg-active',
  ghost:
    'text-text-secondary hover:bg-bg-hover hover:text-primary active:bg-bg-active',
  danger:
    'bg-error text-text-on-primary hover:bg-error/90 active:bg-error/80 shadow-sm',
};

const sizes: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'w-9 h-9 rounded-lg',
  md: 'w-11 h-11 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, variant = 'ghost', size = 'md', className = '', disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      <span className="inline-flex pointer-events-none">{icon}</span>
    </button>
  )
);

IconButton.displayName = 'IconButton';
