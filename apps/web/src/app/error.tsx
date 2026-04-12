'use client';

import { ErrorPageContent } from '@/components/status/error-page-content';
import { ServerIncidentReporter } from '@/components/status/server-incident-reporter';

/**
 * Error boundary for route segments.
 * Renders the shared tracked error experience (PG-056) with incident reporting.
 */
export default function ErrorPage({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.16),_transparent_42%),linear-gradient(180deg,_#f8fbff_0%,_#eef4fb_100%)] px-6 py-12 dark:bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.14),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)]">
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
    </div>
  );
}
