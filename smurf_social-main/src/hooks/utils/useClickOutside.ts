import { useEffect, RefObject } from 'react';

/**
 * Hook xử lý click outside
 */
export const useClickOutside = (
  refs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
  callback: () => void,
  enabled = true
) => {
  useEffect(() => {
    if (!enabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      const refArray = Array.isArray(refs) ? refs : [refs];
      const isOutside = refArray.every(ref =>
        !ref.current || !ref.current.contains(event.target as Node)
      );
      if (isOutside) callback();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [refs, callback, enabled]);
};
