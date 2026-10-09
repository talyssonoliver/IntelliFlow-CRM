'use client';

import * as React from 'react';

type Check = { state: 'checking' } | { state: 'up'; ms: number } | { state: 'down' };

function describe(check: Check): string {
  if (check.state === 'checking') return 'Checking…';
  if (check.state === 'up') return `Operational · answered in ${check.ms} ms`;
  return 'Not responding';
}

/**
 * A live check of the web app's own health endpoint, run from the visitor's
 * browser when the page opens and again on request. It reports only what it
 * measured; nothing here is a stored or invented figure.
 */
export function LiveStatus() {
  const [check, setCheck] = React.useState<Check>({ state: 'checking' });
  const [checkedAt, setCheckedAt] = React.useState<Date | null>(null);

  const run = React.useCallback(async () => {
    setCheck({ state: 'checking' });
    const started = performance.now();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = (await res.json()) as { status?: string };
      setCheck(
        res.ok && body.status === 'ok'
          ? { state: 'up', ms: Math.round(performance.now() - started) }
          : { state: 'down' }
      );
    } catch {
      setCheck({ state: 'down' });
    }
    setCheckedAt(new Date());
  }, []);

  React.useEffect(() => {
    run().catch(() => setCheck({ state: 'down' }));
  }, [run]);

  const label = describe(check);

  return (
    <div className="as-card ast-live">
      <div className="ast-live-row">
        <span className={`ast-dot ast-${check.state}`} aria-hidden="true" />
        <div>
          <h2>Web app</h2>
          <output aria-live="polite" className="ast-result">
            {label}
          </output>
        </div>
        <button
          type="button"
          className="as-btn as-btn-secondary"
          onClick={() => void run()}
          disabled={check.state === 'checking'}
        >
          Check again
        </button>
      </div>
      {checkedAt && (
        <p className="ast-checked">
          Checked from your browser at{' '}
          {checkedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
