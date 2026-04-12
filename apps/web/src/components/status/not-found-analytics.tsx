'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackNotFoundPageView } from '@/lib/status/error-analytics';

export function NotFoundAnalytics({ suggestionCount }: Readonly<{ suggestionCount: number }>) {
  const pathname = usePathname() ?? '/404';

  useEffect(() => {
    const navigationEntry =
      typeof window !== 'undefined'
        ? (window.performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined)
        : undefined;

    trackNotFoundPageView({
      missingPath: pathname,
      referrer: typeof document !== 'undefined' ? document.referrer : null,
      suggestionCount,
      navigationType: navigationEntry?.type ?? null,
    });
  }, [pathname, suggestionCount]);

  return null;
}
