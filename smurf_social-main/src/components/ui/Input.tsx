import React from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<NonNullable<InputProps['size']>, string> = {
  sm: 'min-h-[36px] px-3 text-sm',
  md: 'min-h-[44px] px-4 text-base',
  lg: 'min-h-[48px] px-4 text-base',
};

export const Input: React.FC<InputProps> = ({
  label,
  icon,
  rightElement,
  className = '',
  containerClassName = '',
  error,
  id,
  size = 'md',
  ...props
}) => {
  const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer"
        >
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-primary transition-colors duration-200">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`
            w-full bg-bg-primary border rounded-xl transition-all duration-200 outline-none
            text-text-primary placeholder:text-text-tertiary
            ${error
              ? 'border-error focus:ring-2 focus:ring-error/20 focus:border-error'
              : 'border-border-light focus:ring-2 focus:ring-primary/20 focus:border-primary hover:border-border-medium'
            }
            ${sizeClasses[size]}
            ${icon ? 'pl-10' : ''}
            ${rightElement ? 'pr-10' : ''}
            ${className}
          `}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-0.5 ml-1 text-xs font-medium text-error flex items-center gap-1 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
};
