'use client';

/**
 * useIsMobile
 *
 * Returns true when the viewport is narrower than the Tailwind `lg`
 * breakpoint (1024 px). Uses `matchMedia` with a change listener so
 * components re-render on rotate / resize / DevTools emulation switch.
 *
 * During SSR (or before the first effect runs) it returns `false` —
 * meaning "desktop" — so markup rendered on the server never tries to
 * render a bottom drawer that the client would then have to unmount.
 */

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 1024;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const sync = () => setIsMobile(mql.matches);
    sync();

    // Support both modern (addEventListener) and Safari 13 (addListener)
    if ('addEventListener' in mql) {
      mql.addEventListener('change', sync);
      return () => mql.removeEventListener('change', sync);
    }
    return undefined;
  }, []);

  return isMobile;
}
