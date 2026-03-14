import { useEffect, useRef, useCallback, RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}

/**
 * Theo dõi element hiển thị trong viewport
 */
export const useIntersectionObserver = (
  callback: () => void,
  options: UseIntersectionObserverOptions = {}
): RefObject<HTMLDivElement> => {
  const { threshold = 0.1, rootMargin = '100px', enabled = true } = options;
  const observerRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && enabled) {
        callback();
      }
    },
    [callback, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    const observer = new IntersectionObserver(handleIntersection, {
      threshold,
      rootMargin,
    });

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [handleIntersection, threshold, rootMargin, enabled]);

  return observerRef;
};
