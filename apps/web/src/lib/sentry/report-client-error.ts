'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Report an error caught by an App Router error boundary (`error.tsx`,
 * `global-error.tsx`). Safe when Sentry is not initialised: the SDK no-ops.
 */
export function useReportClientError(error: Error & { digest?: string }): void {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
}
