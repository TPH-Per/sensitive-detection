import React from 'react';

interface SettingItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  icon, title, description, action, onClick, className = '', disabled = false,
}) => {
  const isClickable = !!onClick && !disabled;

  const base = `
    flex items-center justify-between p-4 bg-bg-primary rounded-2xl border border-border-light
    transition-all duration-200 w-full text-left
    ${isClickable ? 'cursor-pointer hover:bg-bg-hover active:bg-bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset' : ''}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `;

  const content = (
    <>
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">{title}</h3>
          <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </>
  );

  if (isClickable) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={base}>
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
};

export default React.memo(SettingItem);
