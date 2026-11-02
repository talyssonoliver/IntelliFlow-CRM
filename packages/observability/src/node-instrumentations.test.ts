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
let pinoLoaded = false;

// Loading pino before its OTel instrumentation is registered leaves every
// logger created from that copy unpatched, so this module must never pull it in.
vi.mock('pino', () => {
  pinoLoaded = true;
  return { default: () => ({}) };
});

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (config: unknown) => {
    lastConfig = config;
    return ['mock-instrumentations'];
  },
}));

describe('getStandardNodeInstrumentations', () => {
  beforeEach(() => {
    lastConfig = undefined;
    pinoLoaded = false;
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

  // PG-208: a task-automation webhook URL carries its token; it must never be traced.
  it('does not trace incoming requests whose path carries a credential', async () => {
    const { getStandardNodeInstrumentations, isSecretBearingPath } =
      await import('./node-instrumentations');

    getStandardNodeInstrumentations();

    const http = (lastConfig as Record<string, unknown>)['@opentelemetry/instrumentation-http'] as {
      ignoreIncomingRequestHook: (req: { url?: string }) => boolean;
    };
    expect(http.ignoreIncomingRequestHook({ url: '/api/webhooks/task-automation/tok' })).toBe(true);
    expect(http.ignoreIncomingRequestHook({ url: '/trpc/task.list' })).toBe(false);
    expect(http.ignoreIncomingRequestHook({})).toBe(false);
    expect(isSecretBearingPath('/webhooks/task-automation/x?y=1')).toBe(true);
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

  // #1098: health probes get no SERVER span, so they stay out of the api SLOs.
  it('ignores health probe requests by path, not by substring', async () => {
    const { getStandardNodeInstrumentations } = await import('./node-instrumentations');

    getStandardNodeInstrumentations();

    const config = lastConfig as Record<
      string,
      { ignoreIncomingRequestHook?: (req: { url?: string }) => boolean } | undefined
    >;
    const ignore = config['@opentelemetry/instrumentation-http']?.ignoreIncomingRequestHook;
    expect(ignore).toBeTypeOf('function');
    for (const url of [
      '/health',
      '/health/',
      '/health/db',
      '/api/health',
      '/api/health/ready?x=1',
    ]) {
      expect(ignore?.({ url })).toBe(true);
    }
    for (const url of ['/healthcare', '/api/healthz', '/api/contacts/health', '/', undefined]) {
      expect(ignore?.({ url })).toBe(false);
    }
  });

  it('does not load pino when imported', async () => {
    vi.resetModules();

    await import('./node-instrumentations');

    expect(pinoLoaded).toBe(false);
  });
});
