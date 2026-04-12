'use client';

import { ErrorPageContent } from '@/components/status/error-page-content';
import { ServerIncidentReporter } from '@/components/status/server-incident-reporter';

/**
 * Global Error Boundary
 *
 * Catches errors in the root layout. Must include its own <html> and <body>
 * since the root layout is likely broken when this renders.
 */
export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.16),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-6 py-12">
        <ErrorPageContent
          variant="boundary"
          error={error}
          onReset={reset}
          showDetails={process.env.NODE_ENV === 'development'}
        />
        <ServerIncidentReporter
          error={error}
          path={typeof window !== 'undefined' ? window.location.pathname : null}
        />
      </body>
    </html>
  );
}
