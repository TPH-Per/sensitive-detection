import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { IconButton } from './IconButton';

interface DatePickerProps {
  label?: string;
  value?: number;
  onChange: (timestamp: number) => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const CALENDAR_HEIGHT = 350;
const MENU_GAP = 8;
const VIEWPORT_PADDING = 12;

const sizeClasses: Record<NonNullable<DatePickerProps['size']>, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const DatePicker: React.FC<DatePickerProps> = ({
  label, value, onChange, error,
  placeholder = 'Chọn ngày', disabled = false, className = '', size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width?: number; openUp: boolean } | null>(null);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const calcPos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openUp = spaceBelow < CALENDAR_HEIGHT && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 288);
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, vw - width - VIEWPORT_PADDING));
    setPos(openUp
      ? { bottom: vh - rect.top + MENU_GAP, left, width, openUp: true }
      : { top: rect.bottom + MENU_GAP, left, width, openUp: false }
    );
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) { setPos(null); setView('days'); return; }
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [isOpen, calcPos]);

  useClickOutside([containerRef, dropdownRef], () => setIsOpen(false), isOpen);

  const navigate = (direction: 'next' | 'prev') => {
    if (view === 'days') {
      setCurrentMonth(direction === 'next' ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
    } else if (view === 'years') {
      const d = new Date(currentMonth);
      d.setFullYear(d.getFullYear() + (direction === 'next' ? 12 : -12));
      setCurrentMonth(d);
    }
  };

  const renderHeader = () => (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
      <div className="flex items-center gap-1 text-sm font-bold text-text-primary">
        {view === 'days' && (
          <>
            <button type="button" onClick={() => setView('months')}
              className="hover:text-primary transition-colors duration-200 capitalize px-1 py-0.5 rounded-lg hover:bg-bg-hover">
              {format(currentMonth, 'MMMM', { locale: vi })}
            </button>
            <button type="button" onClick={() => setView('years')}
              className="hover:text-primary transition-colors duration-200 px-1 py-0.5 rounded-lg hover:bg-bg-hover">
              {format(currentMonth, 'yyyy')}
            </button>
          </>
        )}
        {view === 'months' && (
          <button type="button" onClick={() => setView('years')}
            className="hover:text-primary transition-colors duration-200 px-1 py-0.5 rounded-md hover:bg-bg-hover">
            Năm {format(currentMonth, 'yyyy')}
          </button>
        )}
        {view === 'years' && (
          <span>{currentMonth.getFullYear() - 5} - {currentMonth.getFullYear() + 6}</span>
        )}
      </div>
      <div className="flex gap-1 items-center">
        {(view === 'days' || view === 'years') && (
          <>
            <IconButton type="button" onClick={(e) => { e.stopPropagation(); navigate('prev'); }} icon={<ChevronLeft size={18} />} size="sm" />
            <IconButton type="button" onClick={(e) => { e.stopPropagation(); navigate('next'); }} icon={<ChevronRight size={18} />} size="sm" />
          </>
        )}
        {(view === 'years' || view === 'months') && (
          <button
            type="button"
            className="text-xs text-primary font-semibold px-2 py-1 ml-1 rounded-md hover:bg-bg-hover active:bg-bg-active transition-colors duration-200"
            onClick={() => setView('days')}
          >
            Hủy
          </button>
        )}
      </div>
    </div>
  );

  const renderMonths = () => (
    <div className="grid grid-cols-3 gap-2 p-3">
      {Array.from({ length: 12 }, (_, i) => ({
        name: format(new Date(2024, i, 1), 'MMMM', { locale: vi }),
        index: i,
      })).map((m) => (
        <button key={m.index} type="button"
          onClick={() => { const d = new Date(currentMonth); d.setMonth(m.index); setCurrentMonth(d); setView('days'); }}
          className={`h-12 text-sm rounded-xl transition-all duration-200 capitalize
            ${currentMonth.getMonth() === m.index
              ? 'btn-gradient text-text-on-primary font-bold shadow-sm'
              : 'hover:bg-bg-hover active:bg-bg-active text-text-primary'
            }`}>
          {m.name}
        </button>
      ))}
    </div>
  );

  const renderYears = () => {
    const center = currentMonth.getFullYear();
    return (
      <div className="grid grid-cols-3 gap-2 p-3">
        {Array.from({ length: 12 }, (_, i) => center - 5 + i).map((y) => (
          <button key={y} type="button"
            onClick={() => { const d = new Date(currentMonth); d.setFullYear(y); setCurrentMonth(d); setView('months'); }}
            className={`h-12 text-sm rounded-xl transition-all duration-200
              ${center === y
                ? 'btn-gradient text-text-on-primary font-bold shadow-sm'
                : 'hover:bg-bg-hover active:bg-bg-active text-text-primary'
              }`}>
            {y}
          </button>
        ))}
      </div>
    );
  };

  const renderDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });

    const rows: React.ReactNode[] = [];
    let days: React.ReactNode[] = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const d = day;
        const isSelected = !!value && isSameDay(d, new Date(value));
        const inMonth = isSameMonth(d, monthStart);
        days.push(
          <button key={d.toString()} type="button"
            onClick={(e) => { e.stopPropagation(); onChange(d.getTime()); setIsOpen(false); }}
            className={`relative h-10 w-full flex items-center justify-center text-sm transition-all duration-200 rounded-lg
              ${!inMonth ? 'text-text-tertiary opacity-40' : 'text-text-primary'}
              ${isSelected ? 'btn-gradient text-text-on-primary font-bold shadow-sm' : 'hover:bg-bg-hover active:bg-bg-active'}
              ${isToday(d) && !isSelected ? 'text-primary font-bold' : ''}`}>
            {format(d, 'd')}
            {isToday(d) && !isSelected && (
              <div className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7 gap-1" key={day.toString()}>{days}</div>);
      days = [];
    }

    return (
      <div className="p-2">
        <div className="grid grid-cols-7 mb-2">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
            <div key={d} className="text-xs font-bold text-center text-text-tertiary uppercase py-2">{d}</div>
          ))}
        </div>
        <div className="px-1 pb-2">{rows}</div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer">{label}</label>
      )}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between rounded-xl border outline-none transition-all duration-200 bg-bg-primary
          ${sizeClasses[size]}
          ${isOpen ? 'border-primary ring-2 ring-primary/20' : 'border-border-light hover:border-border-medium'}
          ${error ? 'border-error ring-2 ring-error/10' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed bg-bg-secondary' : 'cursor-pointer'}
        `}
      >
        <span className={`truncate ${!value ? 'text-text-tertiary' : 'text-text-primary'}`}>
          {value ? format(new Date(value), 'dd/MM/yyyy') : placeholder}
        </span>
        <CalendarIcon size={18} className="text-text-tertiary flex-shrink-0" />
      </div>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          className="bg-bg-primary border border-border-light rounded-2xl shadow-xl overflow-hidden animate-fade-in"
          style={{
            position: 'fixed',
            zIndex: 'var(--z-popover)',
            top: pos?.top !== undefined ? `${pos.top}px` : undefined,
            bottom: pos?.bottom !== undefined ? `${pos.bottom}px` : undefined,
            left: pos ? `${pos.left}px` : undefined,
            width: pos ? `${pos.width}px` : undefined,
            transformOrigin: pos?.openUp ? 'bottom left' : 'top left',
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {renderHeader()}
          {view === 'days' && renderDays()}
          {view === 'months' && renderMonths()}
          {view === 'years' && renderYears()}
        </div>,
        document.body
      )}

      {error && (
        <p className="mt-0.5 ml-1 text-xs font-medium text-error flex items-center gap-1 animate-fade-in">{error}</p>
      )}
    </div>
  );
};
