import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, className = '', id, ...props }) => {
  const checkboxId = id || (label ? `checkbox-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={checkboxId}
          className={`
            peer h-4 w-4 cursor-pointer appearance-none rounded border border-border-light bg-bg-primary
            transition-all duration-200
            checked:bg-primary checked:border-primary
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1
            hover:border-primary/50
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
        <svg
          className="absolute left-0.5 top-0.5 h-3 w-3 pointer-events-none text-text-on-primary opacity-0 peer-checked:opacity-100 transition-all duration-200"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      {label && (
        <label
          htmlFor={checkboxId}
          className="select-none text-sm font-medium text-text-secondary cursor-pointer !p-0 !m-0 leading-none"
        >
          {label}
        </label>
      )}
    </div>
  );
};
