'use client';

import { useEffect, useRef } from 'react';
import { createIncident, type IncidentSeverity } from '@/lib/status/incident-creator';
import { notifyTeam } from '@/lib/status/error-notifier';

type ServerIncidentReporterProps = {
  readonly error: Error & { digest?: string };
  readonly path?: string | null;
  readonly severity?: IncidentSeverity;
};

export function ServerIncidentReporter({
  error,
  path,
  severity = 'error',
}: ServerIncidentReporterProps) {
  // Dedup on the error OBJECT identity, not its signature string. Strict Mode
  // invokes the effect twice with the SAME error instance, so the second run is
  // skipped. A genuinely DISTINCT error — a new Error instance — always reports,
  // even if its message/digest/path/severity are identical to a prior one.
  // (PG-056: the previous message|digest|path|severity key wrongly suppressed
  // repeated distinct errors that happened to share a signature.) Reference
  // identity is the precise signal: React only re-runs this effect when the
  // `error` dep changes, so a real re-occurrence yields a new instance and fires.
  const reportedErrorRef = useRef<Error | null>(null);

  useEffect(() => {
    if (reportedErrorRef.current === error) {
      return;
    }
    reportedErrorRef.current = error;

    // Preserve dev DevTools visibility — Next's overlay may be suppressed in
    // Storybook/Playwright runs, and tests still assert no console noise in prod.
    if (process.env.NODE_ENV !== 'production') {
      console.error('[IntelliFlow] runtime error captured:', error);
    }

    try {
      const payload = createIncident({ error, path, severity });
      notifyTeam(payload);
    } catch {
      // Never crash the error UI
    }
  }, [error, path, severity]);

  return <span data-testid="server-incident-reporter" hidden />;
}
