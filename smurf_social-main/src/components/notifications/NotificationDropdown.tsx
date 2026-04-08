import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClickOutside } from '../../hooks/utils';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { IconButton } from '../ui';
import { NotificationList } from './NotificationList';

const MENU_WIDTH = 380;
const MENU_GAP = 8;
const VIEWPORT_PAD = 12;

export const NotificationDropdown: React.FC = () => {
  const { user } = useAuthStore();
  const { unreadCount, markAllAsRead } = useNotificationStore();
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const close = useCallback(() => setIsOpen(false), []);
  useClickOutside([triggerRef, menuRef], close, isOpen);

  const calcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(rect.right - MENU_WIDTH, vw - MENU_WIDTH - VIEWPORT_PAD)
    );
    setPos({ top: rect.bottom + MENU_GAP, left });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [isOpen, calcPos]);

  const handleViewAll = useCallback(() => {
    navigate('/notifications');
    close();
  }, [navigate, close]);

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        onClick={() => setIsOpen(prev => !prev)}
        icon={
          <div className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-error rounded-full ring-2 ring-primary" />
            )}
          </div>
        }
        variant="ghost"
        title="Thông báo"
        className={`text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 ${isOpen ? 'bg-white/20 text-white' : ''}`}
      />

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-bg-primary rounded-2xl shadow-xl border border-border-light overflow-hidden animate-fade-in"
          style={{
            zIndex: 'var(--z-popover)',
            top: pos ? `${pos.top}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: `${MENU_WIDTH}px`,
            maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {/* Dropdown header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
            <h3 className="text-sm font-semibold text-text-primary">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => user && markAllAsRead(user.id)}
                className="text-xs font-semibold text-primary hover:underline transition-colors duration-200"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* List */}
          <NotificationList onItemClick={close} maxHeight="420px" />

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border-light text-center">
            <button
              type="button"
              className="text-xs font-semibold text-text-secondary hover:text-primary transition-colors duration-200"
              onClick={handleViewAll}
            >
              Xem tất cả thông báo
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
