import { useEffect } from 'react';

/**
 * Khóa cuộn trang
 */
export const useScrollLock = (lock: boolean) => {
  useEffect(() => {
    if (lock) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
    return undefined;
  }, [lock]);
};
