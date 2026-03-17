import React, { forwardRef, useEffect, useRef, useImperativeHandle, useState } from 'react';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
  error?: string;
  autoResize?: boolean;
  maxHeight?: number;
  renderOverlay?: (value: string) => React.ReactNode;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({
  label,
  icon,
  rightElement,
  className = '',
  containerClassName = '',
  error,
  id,
  autoResize = false,
  maxHeight = 120,
  onChange,
  value,
  renderOverlay,
  ...props
}, ref) => {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  useImperativeHandle(ref, () => innerRef.current!);

  const inputId = id || (label ? `textarea-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  useEffect(() => {
    if (autoResize && innerRef.current) {
      const targetHeight = Math.min(innerRef.current.scrollHeight, maxHeight);
      if (innerRef.current.offsetHeight !== targetHeight) {
        innerRef.current.style.height = 'auto';
        innerRef.current.style.height = `${targetHeight}px`;
      }
    }
  }, [value, autoResize, maxHeight]);

  // Đồng bộ cuộn cho overlay.
  useEffect(() => {
    if (!innerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (innerRef.current) {
        const widthDiff = innerRef.current.offsetWidth - innerRef.current.clientWidth;
        const sbWidth = Math.max(0, widthDiff - 2);
        setScrollbarWidth(sbWidth);
      }
    });
    observer.observe(innerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-text-secondary ml-1 cursor-pointer">
          {label}
        </label>
      )}
      <div className={`
        relative group overflow-hidden
        bg-bg-primary border border-border-light transition-all duration-base
        ${props.disabled ? 'opacity-50 bg-bg-secondary cursor-not-allowed' : 'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20'}
        ${!className.includes('rounded-') ? 'rounded-xl' : ''}
        ${error ? 'border-error ring-4 ring-error/10' : ''} 
        ${className}
      `}>
        {renderOverlay && (
          <div
            aria-hidden="true"
            className={`
              absolute inset-0 w-full h-full pointer-events-none
              bg-transparent outline-none text-base sm:text-[15px] leading-relaxed resize-none
              whitespace-pre-wrap break-words
              text-text-primary
              ${icon ? 'pl-11' : 'pl-4'} 
              ${!className.includes('py-') ? 'py-2' : ''}
              overflow-hidden
              z-20
            `}
            style={{
              paddingTop: innerRef.current ? getComputedStyle(innerRef.current).paddingTop : '8px',
              paddingBottom: innerRef.current ? getComputedStyle(innerRef.current).paddingBottom : '8px',
              paddingRight: `calc(${rightElement ? '2rem' : '1rem'} + ${scrollbarWidth}px)`,
            }}
            ref={(el) => {
              overlayRef.current = el;
              if (el && innerRef.current) {
                el.scrollTop = innerRef.current.scrollTop;
              }
            }}
          >
            {renderOverlay(value as string || '')}
          </div>
        )}

        {icon && (
          <div className="absolute top-3 left-0 pl-3.5 flex items-start pointer-events-none text-text-tertiary group-focus-within:text-primary transition-colors duration-base">
            {icon}
          </div>
        )}
        <textarea
          ref={innerRef}
          id={inputId}
          className={`
            block w-full bg-transparent outline-none border-none text-base sm:text-[15px] leading-relaxed resize-none
            ${renderOverlay ? 'text-transparent caret-text-primary selection:bg-primary/20 selection:text-transparent' : 'text-text-primary'}
            placeholder:text-text-tertiary
            ${icon ? 'pl-11' : 'pl-4'} 
            ${rightElement ? 'pr-8' : 'pr-4'} 
            ${!className.includes('py-') ? 'py-2' : ''}
            ${!className.includes('min-h-') ? 'min-h-[40px]' : ''}
            overflow-y-auto custom-scrollbar
            relative z-10
          `}
          rows={1}
          value={value}
          onScroll={(e) => {
            const target = e.target as HTMLTextAreaElement;
            if (overlayRef.current) {
              overlayRef.current.scrollTop = target.scrollTop;
            }
            props.onScroll?.(e);
          }}
          onChange={(e) => {
            onChange?.(e);
          }}
          style={{ caretColor: 'var(--color-primary)' }}
          {...props}
        />

        {rightElement && (
          <div className="absolute bottom-1 right-1 pr-1 flex items-center h-8 z-20">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-0.5 ml-1 text-[11px] font-medium text-error flex items-center gap-1 animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
});

TextArea.displayName = 'TextArea';
