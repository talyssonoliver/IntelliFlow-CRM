'use client';

import * as React from 'react';
import type { ServiceCheck, ServiceState } from '@/lib/status/service-checks';

const STATE_TEXT: Record<ServiceState, string> = {
  up: 'Operational',
  degraded: 'Degraded',
  down: 'Not responding',
  not_checked: 'Not checked',
};

/** Dot class per state; reuses the live card's colours. */
const DOT: Record<ServiceState, string> = {
  up: 'ast-up',
  degraded: 'ast-degraded',
  down: 'ast-down',
  not_checked: 'ast-pending-dot',
};

export function describeService(check: ServiceCheck): string {
  if (check.state === 'up') {
    return check.ms === undefined ? STATE_TEXT.up : `${STATE_TEXT.up} · answered in ${check.ms} ms`;
  }
  return check.note ? `${STATE_TEXT[check.state]}: ${check.note}` : STATE_TEXT[check.state];
}

type Load =
  | { state: 'loading' }
  | { state: 'loaded'; services: ServiceCheck[]; checkedAt: Date | null }
  | { state: 'failed' };

/**
 * The API, AI agents and sign-in, checked by the web server (/api/status) when
 * the page opens. Each row shows what the check measured, or why it could not.
 */
export function StatusMonitor() {
  const [load, setLoad] = React.useState<Load>({ state: 'loading' });

  const run = React.useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      // One request per page view, never polled. The server shares one answer across all
      // visitors for 5 minutes (see the route), so "Try again" may return the same result.
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { services?: ServiceCheck[]; checkedAt?: string };
      // The time the server measured these rows (cached with them), not the time of this request.
      const measured = body.checkedAt ? new Date(body.checkedAt) : null;
      setLoad(
        Array.isArray(body.services)
          ? {
              state: 'loaded',
              services: body.services,
              checkedAt: measured && !Number.isNaN(measured.getTime()) ? measured : null,
            }
          : { state: 'failed' }
      );
    } catch {
      setLoad({ state: 'failed' });
    }
  }, []);

  React.useEffect(() => {
    run().catch(() => setLoad({ state: 'failed' }));
  }, [run]);

  if (load.state === 'loading') {
    return (
      <output className="as-card ast-note" data-testid="service-checks-loading">
        Checking the API, AI agents and sign-in…
      </output>
    );
  }

  if (load.state === 'failed') {
    return (
      <div className="as-card ast-note" role="alert" data-testid="service-checks-failed">
        <p>The service checks could not be run just now.</p>
        <button type="button" className="as-btn as-btn-secondary" onClick={() => void run()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <>
      <ul className="ast-pending" data-testid="service-checks">
        {load.services.map((check) => (
          <li key={check.id} className="as-card">
            <span className={`ast-dot ${DOT[check.state]}`} aria-hidden="true" />
            <div>
              <h2>{check.name}</h2>
              <p>{check.detail}</p>
            </div>
            <span className="ast-tag">{describeService(check)}</span>
          </li>
        ))}
      </ul>
      {load.checkedAt && (
        <p className="ast-checked" data-testid="server-checked-at">
          Server checks at{' '}
          {load.checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </>
  );
}
