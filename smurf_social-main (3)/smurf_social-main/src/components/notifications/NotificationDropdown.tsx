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
        className={`text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200 active:bg-white/20 ${isOpen ? 'bg-white/20 text-white' : ''}`}
      />

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-bg-primary rounded-2xl shadow-2xl border border-divider overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{
            zIndex: 'var(--z-popover)',
            top: pos ? `${pos.top}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: `${MENU_WIDTH}px`,
            maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-divider bg-bg-primary">
            <div>
              <h3 className="text-[15px] font-bold text-text-primary tracking-tight">
                Thông báo
              </h3>
              {unreadCount > 0 && (
                <p className="text-[11px] font-semibold text-primary mt-0.5">
                  Bạn có {unreadCount} thông báo mới
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => user && markAllAsRead(user.id)}
                className="text-[12px] font-bold text-primary hover:bg-primary/5 px-2.5 py-1.5 rounded-lg transition-all duration-200"
              >
                Đọc tất cả
              </button>
            )}
          </div>

          {/* List */}
          <NotificationList onItemClick={close} maxHeight="420px" />

          {/* Footer */}
          <div className="p-2 border-t border-divider bg-bg-secondary/30">
            <button
              type="button"
              className="flex items-center justify-center w-full py-2.5 text-[13px] font-bold text-text-secondary hover:text-primary hover:bg-primary/5 rounded-xl transition-all duration-200"
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
