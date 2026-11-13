/**
 * IFC-151: outbox metrics reach a real MeterProvider with the names, units and
 * attributes the Grafana alert rule queries.
 */
import { describe, expect, it } from 'vitest';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import { createOutboxMetrics, OUTBOX_METER_NAME } from './outbox-metrics';

async function collect(record: (m: ReturnType<typeof createOutboxMetrics>) => void) {
  const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
  const provider = new MeterProvider({ readers: [reader] });
  record(createOutboxMetrics(provider.getMeter(OUTBOX_METER_NAME)));
  await reader.forceFlush();
  const metrics: ResourceMetrics[] = exporter.getMetrics();
  await provider.shutdown();
  return metrics.flatMap((r) => r.scopeMetrics).flatMap((s) => s.metrics);
}

describe('createOutboxMetrics', () => {
  it('counts outcomes per event type and records the dispatch duration in ms', async () => {
    const metrics = await collect((m) => {
      m.recordDispatch('published', 'lead.created', 12);
      m.recordDispatch('published', 'lead.created', 8);
      m.recordDispatch('dead_lettered', 'task.created', 30);
      m.recordDispatch('poisoned', 'task.created', -5); // clock skew: clamped to 0
    });

    const counter = metrics.find((m) => m.descriptor.name === 'intelliflow.outbox.events')!;
    const points = counter.dataPoints.map((p) => [p.attributes, p.value]);
    expect(points).toEqual(
      expect.arrayContaining([
        [{ outcome: 'published', event_type: 'lead.created' }, 2],
        [{ outcome: 'dead_lettered', event_type: 'task.created' }, 1],
        [{ outcome: 'poisoned', event_type: 'task.created' }, 1],
      ])
    );

    const histogram = metrics.find(
      (m) => m.descriptor.name === 'intelliflow.outbox.dispatch.duration'
    )!;
    expect(histogram.descriptor.unit).toBe('ms');
    const poisoned = histogram.dataPoints.find((p) => p.attributes.outcome === 'poisoned')!;
    expect((poisoned.value as { min?: number }).min).toBe(0);
  });

  it('is a no-op on the global meter when no SDK is registered', () => {
    expect(() => createOutboxMetrics().recordDispatch('retried', 'x', 1)).not.toThrow();
  });
});
