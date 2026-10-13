/**
 * getStandardNodeInstrumentations tests
 *
 * Mocks @opentelemetry/auto-instrumentations-node so we can assert on the
 * config passed into it without loading real instrumentation plugins.
 * Mirrors the pattern already used by apps/api/src/tracing/otel.test.ts and
 * apps/ai-worker/src/tracing/__tests__/otel.test.ts, which this module now
 * backs (IFC-032 / #809).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let lastConfig: unknown;

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (config: unknown) => {
    lastConfig = config;
    return ['mock-instrumentations'];
  },
}));

describe('getStandardNodeInstrumentations', () => {
  beforeEach(() => {
    lastConfig = undefined;
  });

  it('returns whatever getNodeAutoInstrumentations produces', async () => {
    const { getStandardNodeInstrumentations } = await import('./node-instrumentations');

    const result = getStandardNodeInstrumentations();

    expect(result).toEqual(['mock-instrumentations']);
  });

  it('disables the noisy filesystem instrumentation and keeps http enabled', async () => {
    const { getStandardNodeInstrumentations } = await import('./node-instrumentations');

    getStandardNodeInstrumentations();

    const config = lastConfig as Record<string, { enabled?: boolean } | undefined>;
    expect(config['@opentelemetry/instrumentation-fs']?.enabled).toBe(false);
    expect(config['@opentelemetry/instrumentation-http']?.enabled).toBe(true);
  });

  // #809 (IFC-032 follow-up): production logs must reach the same OTLP
  // gateway as traces/metrics, with trace_id/span_id attached, so Grafana's
  // "Logs for this trace" is not empty.
  it('enables pino log sending to the OTel Logs SDK', async () => {
    const { getStandardNodeInstrumentations } = await import('./node-instrumentations');

    getStandardNodeInstrumentations();

    const config = lastConfig as Record<string, { disableLogSending?: boolean } | undefined>;
    expect(config['@opentelemetry/instrumentation-pino']?.disableLogSending).toBe(false);
  });
});
