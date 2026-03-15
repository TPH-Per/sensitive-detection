import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../../store/notificationStore';
import { NotificationList } from './NotificationList';
import { useAuthStore } from '../../store/authStore';
import { IconButton } from '../ui';

const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;
const MENU_WIDTH = 384; // w-96

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

    // Prefer right-aligned to trigger, clamp to viewport
    let left = rect.right - MENU_WIDTH;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - MENU_WIDTH - VIEWPORT_PADDING));

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

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        onClick={() => setIsOpen(prev => !prev)}
        icon={
          <div className="relative">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-error rounded-full ring-2 ring-bg-primary" />
            )}
          </div>
        }
        variant={isOpen ? 'secondary' : 'ghost'}
        title="Thông báo"
        className={isOpen ? 'text-primary shadow-sm' : 'text-text-secondary hover:text-primary'}
      />

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[var(--z-popover)] bg-bg-primary rounded-xl shadow-xl border border-border-light overflow-hidden animate-in fade-in zoom-in-95 duration-fast origin-top-right"
          style={{
            top: pos ? `${pos.top}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: `${MENU_WIDTH}px`,
            maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
            <h3 className="font-bold text-base text-text-primary">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => user && markAllAsRead(user.id)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          <div className="p-2">
            <NotificationList onItemClick={close} />
          </div>

          <div className="px-4 py-3 border-t border-border-light text-center">
            <button
              type="button"
              className="text-sm font-semibold text-text-secondary hover:text-primary transition-colors duration-fast"
              onClick={() => {
                navigate('/notifications');
                close();
              }}
            >
              Xem tất cả
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
