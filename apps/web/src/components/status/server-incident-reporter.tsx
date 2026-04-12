'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    try {
      const payload = createIncident({ error, path, severity });
      notifyTeam(payload);
    } catch {
      // Never crash the error UI
    }
  }, [error, path, severity]);

  return <span data-testid="server-incident-reporter" hidden />;
}
