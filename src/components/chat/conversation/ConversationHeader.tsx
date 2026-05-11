import React from 'react';
import { Search, X, Users, MoreVertical, Archive, CheckCircle2 } from 'lucide-react';
import { Input, IconButton, Dropdown, Button } from '../../ui';

interface ConversationHeaderProps {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSearch: () => void;
  isSearchFocused: boolean;
  onSearchFocus: (focused: boolean) => void;
  onCancelSearch: () => void;
  onNewGroup?: () => void;
  onNewChat?: () => void;
  viewMode: 'normal' | 'archived';
  onViewModeChange?: (mode: 'normal' | 'archived') => void;
  archivedCount: number;
  onMarkAllRead?: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  searchTerm, onSearchChange, onClearSearch,
  isSearchFocused, onSearchFocus, onCancelSearch,
  onNewGroup, onNewChat, viewMode, onViewModeChange,
  archivedCount, onMarkAllRead,
}) => (
  <div className="flex-shrink-0 px-3 h-16 flex items-center border-b border-border-light gap-1.5 bg-bg-primary">
    {/* Search input */}
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="relative flex-1 flex items-center">
        <Input
          icon={<Search size={15} />}
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={onSearchChange}
          onFocus={() => onSearchFocus(true)}
          className="bg-bg-secondary text-sm"
          containerClassName="flex-1"
        />
        {searchTerm && (
          <IconButton
            onClick={onClearSearch}
            className="absolute right-2"
            icon={<X size={14} />}
            size="sm"
          />
        )}
      </div>
      {isSearchFocused && (
        <Button
          onClick={onCancelSearch}
          variant="ghost"
          size="sm"
          className="text-primary flex-shrink-0 font-semibold"
        >
          Hủy
        </Button>
      )}
    </div>

    {/* Action buttons */}
    {!isSearchFocused && !searchTerm && (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {onNewGroup && (
          <IconButton
            onClick={onNewGroup}
            variant="ghost"
            size="md"
            icon={<Users size={19} />}
            title="Tạo nhóm mới"
            className="text-primary"
          />
        )}

        <IconButton
          onClick={() => onViewModeChange?.(viewMode === 'archived' ? 'normal' : 'archived')}
          icon={<Archive size={19} />}
          variant="ghost"
          title={viewMode === 'archived' ? 'Quay lại tin nhắn' : 'Tin nhắn đã lưu trữ'}
          className={viewMode === 'archived' ? 'text-primary bg-primary/10' : 'text-text-secondary'}
        />
      </div>
    )}
  </div>
);
