/**
 * ADR-053 — forward query-budget over-budget events to OpenTelemetry metrics.
 *
 * The detector in `@intelliflow/db` is observability-neutral: it emits a
 * structured {@link QueryBudgetEvent} through a swappable emitter and never
 * depends on the OTel SDK (so `packages/db` keeps zero observability deps).
 * This module installs the app-layer emitter that:
 *
 *   1. increments an `intelliflow.db.query.budget.exceeded` counter, and
 *   2. records the request's query count on an
 *      `intelliflow.db.query.budget.queries` histogram,
 *
 * both keyed by route / context / method, while preserving the default
 * structured warn line so the event stays visible in logs as well as metrics.
 *
 * The instrument names are deliberately namespaced under `db.query.budget.*`
 * to avoid colliding with the existing `intelliflow.db.query.count` counter
 * owned by `@intelliflow/observability` metrics (a same-name, different-type
 * instrument would trigger an OTel duplicate-instrument warning).
 *
 * Wired once from `startTracing()`. `metrics.getMeter()` always returns a valid
 * (possibly no-op) meter, so this is safe even when metric export is disabled —
 * the counter simply no-ops until an OTLP metrics reader is configured.
 *
 * @module apps/api/tracing/query-budget-otel
 */

import { metrics, type Counter, type Histogram } from '@opentelemetry/api';
import { setQueryBudgetEmitter, type QueryBudgetEvent } from '@intelliflow/db';

let restore: (() => void) | null = null;

/**
 * Install the OTel-forwarding query-budget emitter. Idempotent: a second call
 * is a no-op and returns the existing restore handle.
 *
 * @returns a function that restores the previously-installed emitter.
 */
export function installQueryBudgetOtelEmitter(): () => void {
  if (restore) return restore;

  const meter = metrics.getMeter('intelliflow-db-query-budget', '0.1.0');
  const exceededCounter: Counter = meter.createCounter('intelliflow.db.query.budget.exceeded', {
    description: 'Requests that exceeded their ADR-053 query budget (likely an N+1)',
    unit: '1',
  });
  const queryCountHistogram: Histogram = meter.createHistogram(
    'intelliflow.db.query.budget.queries',
    {
      description: 'Number of DB queries issued by an over-budget request',
      unit: '1',
    }
  );

  restore = setQueryBudgetEmitter((event: QueryBudgetEvent) => {
    const attributes = {
      route: event.route ?? 'unknown',
      context: event.context,
      method: event.method ?? 'unknown',
      environment: event.environment,
    };
    exceededCounter.add(1, attributes);
    queryCountHistogram.record(event.queryCount, attributes);
    // Preserve the detector's default structured log line: replacing the
    // emitter would otherwise silence the warn channel.
    console.warn(JSON.stringify(event));
  });

  return restore;
}

/**
 * Uninstall the OTel emitter, restoring the previous one. Primarily a test
 * helper; also lets a long-lived process detach the forwarder on shutdown.
 */
export function uninstallQueryBudgetOtelEmitter(): void {
  if (restore) restore();
  restore = null;
}
