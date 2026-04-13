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
  // Key-based dedup: Strict Mode invokes effects twice with the SAME deps, so
  // comparing against the last-fired key skips the duplicate. A real
  // reset-and-rethrow cycle produces a NEW error identity, which yields a new
  // key and correctly re-fires.
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${error.message}|${error.digest ?? ''}|${path ?? ''}|${severity}`;
    if (lastKeyRef.current === key) {
      return;
    }
    lastKeyRef.current = key;

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
