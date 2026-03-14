import { useState, useEffect } from 'react';

/**
 * Kiểm tra media query
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  }, [matches, query]);

  return matches;
};

// Kiểm tra màn hình mobile.
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
