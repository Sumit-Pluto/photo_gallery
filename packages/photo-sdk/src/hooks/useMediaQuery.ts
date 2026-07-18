'use client';

import { useEffect, useState } from 'react';

/** SSR-safe media-query hook. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** True on phone-sized viewports (the sidebar becomes an overlay drawer). */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 760px)');
}
