import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export type FilterType = 'all' | 'group' | 'stranger';

interface ConversationFiltersProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  onMarkAllRead?: () => void;
  strangerCount?: number;
}

export const ConversationFilters: React.FC<ConversationFiltersProps> = ({
  activeFilter, onFilterChange, onMarkAllRead, strangerCount = 0,
}) => {
  const filters: { id: FilterType; label: string; badge?: number }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'group', label: 'Nhóm' },
    { id: 'stranger', label: 'Người lạ', badge: strangerCount },
  ];

  return (
    <div className="flex-shrink-0 flex items-center justify-between px-3 h-11 border-b border-border-light bg-bg-primary">
      <div className="flex items-center gap-1">
        {filters.map((filter) => {
          const isActive = activeFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => onFilterChange(filter.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 outline-none
              ${isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover'
                }`}
            >
              {filter.label}
              {filter.badge != null && filter.badge > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center leading-none
                ${isActive ? 'bg-primary text-white' : 'bg-error text-white'}`}>
                  {filter.badge > 99 ? '99+' : filter.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onMarkAllRead && (
        <button
          onClick={onMarkAllRead}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-text-tertiary hover:text-primary hover:bg-primary/5 transition-all duration-200 outline-none"
          title="Đánh dấu tất cả đã đọc"
        >
          <CheckCircle2 size={16} />
        </button>
      )}
    </div>
  );
};
