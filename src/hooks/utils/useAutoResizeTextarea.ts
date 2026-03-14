import { useEffect, RefObject } from 'react';

/**
 * Hook tự động resize textarea
 */
export const useAutoResizeTextarea = (
  ref: RefObject<HTMLTextAreaElement | null>,
  content: string,
  enabled = true
) => {
  useEffect(() => {
    if (enabled && ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [content, enabled, ref]);
};
