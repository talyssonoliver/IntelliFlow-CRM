/**
 * Outbox consumer metrics (IFC-151).
 *
 * One counter of outbox event outcomes and one histogram of dispatch duration,
 * on the global OpenTelemetry meter. In production the combined worker's
 * NodeSDK exports them over OTLP; Grafana Cloud stores them as
 *   intelliflow_outbox_events_total{outcome, event_type}
 *   intelliflow_outbox_dispatch_duration_milliseconds_bucket{outcome, event_type}
 * With no SDK registered they are no-ops.
 *
 * @module observability/outbox-metrics
 */

import { metrics, type Meter } from '@opentelemetry/api';

export const OUTBOX_METER_NAME = 'intelliflow-outbox';

/**
 * What happened to one event in one dispatch attempt:
 * - published: every handler succeeded
 * - retried: a handler failed; a retry is scheduled
 * - dead_lettered: a handler failed and the retries are used up
 * - poisoned: a handler rejected the event as unprocessable; it went to the
 *   dead-letter queue with no retry
 */
export type OutboxOutcome = 'published' | 'retried' | 'dead_lettered' | 'poisoned';

export interface OutboxMetrics {
  /** Count one dispatch attempt and how long it took. */
  recordDispatch(outcome: OutboxOutcome, eventType: string, durationMs: number): void;
}

/** Outbox metrics on the given meter (default: the global one). */
export function createOutboxMetrics(
  meter: Meter = metrics.getMeter(OUTBOX_METER_NAME)
): OutboxMetrics {
  const events = meter.createCounter('intelliflow.outbox.events', {
    description: 'Outbox event dispatch attempts by outcome',
  });
  const duration = meter.createHistogram('intelliflow.outbox.dispatch.duration', {
    description: 'Time to dispatch one outbox event to its handlers',
    unit: 'ms',
  });
  return {
    recordDispatch(outcome, eventType, durationMs) {
      const attributes = { outcome, event_type: eventType };
      events.add(1, attributes);
      duration.record(Math.max(0, durationMs), attributes);
    },
  };
}
