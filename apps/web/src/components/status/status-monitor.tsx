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
  | { state: 'loaded'; services: ServiceCheck[] }
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
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { services?: ServiceCheck[] };
      setLoad(
        Array.isArray(body.services)
          ? { state: 'loaded', services: body.services }
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
  );
}
