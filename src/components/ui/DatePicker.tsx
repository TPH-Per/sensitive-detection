import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/utils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday } from 'date-fns';
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

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onChange,
  error,
  placeholder = 'Chọn ngày',
  disabled = false,
  className = '',
  size = 'md'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; openUp: boolean } | null>(null);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const CALENDAR_HEIGHT = 350;
  const MENU_GAP = 8;
  const VIEWPORT_PADDING = 12;

  const calcPos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const openUp = spaceBelow < CALENDAR_HEIGHT && spaceAbove > spaceBelow;
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, vw - 288 - VIEWPORT_PADDING));
    setPos(openUp
      ? { bottom: vh - rect.top + MENU_GAP, left, openUp: true }
      : { top: rect.bottom + MENU_GAP, left, openUp: false }
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

  const toggleOpen = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleDateSelect = (date: Date) => {
    onChange(date.getTime());
    setIsOpen(false);
  };

  const handleMonthSelect = (monthIndex: number) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(monthIndex);
    setCurrentMonth(newDate);
    setView('days');
  };

  const handleYearSelect = (year: number) => {
    const newDate = new Date(currentMonth);
    newDate.setFullYear(year);
    setCurrentMonth(newDate);
    setView('months');
  };

  const navigate = (direction: 'next' | 'prev') => {
    if (view === 'days') {
      setCurrentMonth(direction === 'next' ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
    } else if (view === 'years') {
      const newDate = new Date(currentMonth);
      newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 12 : -12));
      setCurrentMonth(newDate);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-light">
        <div className="flex items-center gap-1 text-sm font-bold text-text-primary">
          {view === 'days' && (
            <>
              <button
                type="button"
                onClick={() => setView('months')}
                className="hover:text-primary active:text-primary-active transition-all duration-base capitalize px-1 py-0.5 rounded-lg hover:bg-bg-hover"
              >
                {format(currentMonth, 'MMMM', { locale: vi })}
              </button>
              <button
                type="button"
                onClick={() => setView('years')}
                className="hover:text-primary active:text-primary-active transition-all duration-base px-1 py-0.5 rounded-lg hover:bg-bg-hover"
              >
                {format(currentMonth, 'yyyy')}
              </button>
            </>
          )}
          {view === 'months' && (
            <button
              type="button"
              onClick={() => setView('years')}
              className="hover:text-primary transition-all duration-base px-1 py-0.5 rounded-md hover:bg-bg-hover"
            >
              Năm {format(currentMonth, 'yyyy')}
            </button>
          )}
          {view === 'years' && (
            <span>
              {currentMonth.getFullYear() - 5} - {currentMonth.getFullYear() + 6}
            </span>
          )}
        </div>
        <div className="flex gap-1 items-center">
          {view === 'days' && (
            <>
              <IconButton
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('prev'); }}
                icon={<ChevronLeft size={18} />}
                size="sm"
              />
              <IconButton
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('next'); }}
                icon={<ChevronRight size={18} />}
                size="sm"
              />
            </>
          )}
          {view === 'years' && (
            <>
              <IconButton
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('prev'); }}
                icon={<ChevronLeft size={18} />}
                size="sm"
              />
              <IconButton
                type="button"
                onClick={(e) => { e.stopPropagation(); navigate('next'); }}
                icon={<ChevronRight size={18} />}
                size="sm"
              />
              <button
                className="text-xs text-primary font-semibold px-2 py-1 ml-1 rounded-md hover:bg-bg-hover active:bg-bg-active transition-all duration-base"
                onClick={() => setView('days')}
              >
                Hủy
              </button>
            </>
          )}
          {view === 'months' && (
            <button
              className="text-xs text-primary font-semibold px-2 py-1 rounded-md hover:bg-bg-hover active:bg-bg-active transition-all duration-base"
              onClick={() => setView('days')}
            >
              Hủy
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderMonths = () => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2024, i, 1);
      return {
        name: format(date, 'MMMM', { locale: vi }),
        index: i
      };
    });

    return (
      <div className="grid grid-cols-3 gap-2 p-3">
        {months.map((m) => (
          <button
            key={m.index}
            type="button"
            onClick={() => handleMonthSelect(m.index)}
            className={`
              h-12 text-sm rounded-xl transition-all duration-base capitalize
              ${currentMonth.getMonth() === m.index ? 'bg-primary text-text-on-primary font-bold' : 'hover:bg-bg-hover active:bg-bg-active text-text-primary'}
            `}
          >
            {m.name}
          </button>
        ))}
      </div>
    );
  };

  const renderYears = () => {
    const centerYear = currentMonth.getFullYear();
    const years = Array.from({ length: 12 }, (_, i) => centerYear - 5 + i);

    return (
      <div className="grid grid-cols-3 gap-2 p-3">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => handleYearSelect(y)}
            className={`
              h-12 text-sm rounded-xl transition-all
              ${centerYear === y ? 'bg-primary text-text-on-primary font-bold' : 'hover:bg-bg-hover active:bg-bg-active text-text-primary'}
            `}
          >
            {y}
          </button>
        ))}
      </div>
    );
  };

  const renderDaysView = () => (
    <div className="p-2">
      <div className="grid grid-cols-7 mb-2">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((day, i) => (
          <div key={i} className="text-[10px] font-bold text-center text-text-tertiary uppercase py-2">
            {day}
          </div>
        ))}
      </div>
      {renderCells()}
    </div>
  );

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const d = day;
        const isSelected = value && isSameDay(d, new Date(value));
        const isCurrentMonth = isSameMonth(d, monthStart);

        days.push(
          <button
            key={d.toString()}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleDateSelect(d); }}
            className={`
              relative h-10 w-full flex items-center justify-center text-sm transition-all duration-base rounded-lg
              ${!isCurrentMonth ? 'text-text-tertiary opacity-40' : 'text-text-primary'}
              ${isSelected ? 'bg-primary text-text-on-primary font-bold shadow-md' : 'hover:bg-bg-hover active:bg-bg-active'}
              ${isToday(d) && !isSelected ? 'text-primary font-bold' : ''}
            `}
          >
            {format(d, 'd')}
            {isToday(d) && !isSelected && (
              <div className="absolute bottom-1 w-1 h-1 bg-primary rounded-full" />
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="px-1 pb-2">{rows}</div>;
  };

  const displayValue = value ? format(new Date(value), 'dd/MM/yyyy') : '';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer">
          {label}
        </label>
      )}

      <div className="relative">
        <div
          onClick={toggleOpen}
          className={`
            w-full flex items-center justify-between rounded-xl border outline-none transition-all duration-base
            bg-bg-primary text-sm
            ${size === 'sm' ? 'h-9 px-3 text-xs' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm'}
            ${isOpen ? 'border-primary ring ring-primary/20' : 'border-border-light hover:border-primary'}
            ${error ? 'border-error ring ring-error/10' : ''}
            ${disabled ? 'opacity-50 cursor-not-allowed bg-bg-secondary' : 'cursor-pointer'}
          `}
        >
          <span className={`truncate ${!value ? 'text-text-tertiary' : 'text-text-primary'}`}>
            {displayValue || placeholder}
          </span>
          <CalendarIcon size={18} className="text-text-tertiary flex-shrink-0" />
        </div>

        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            style={{
              top: pos?.top !== undefined ? `${pos.top}px` : undefined,
              bottom: pos?.bottom !== undefined ? `${pos.bottom}px` : undefined,
              left: pos ? `${pos.left}px` : undefined,
              position: 'fixed',
              transformOrigin: pos?.openUp ? 'bottom left' : 'top left',
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[var(--z-popover)] w-72 bg-bg-primary border border-border-light rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-fast"
            onClick={(e) => e.stopPropagation()}
          >
            {renderHeader()}
            {view === 'days' && renderDaysView()}
            {view === 'months' && renderMonths()}
            {view === 'years' && renderYears()}
          </div>,
          document.body
        )}
      </div>

      {error && (
        <p className="mt-0.5 ml-1 text-[11px] font-medium text-error flex items-center gap-1 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
};
