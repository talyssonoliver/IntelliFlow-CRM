/**
 * OpenTelemetry SDK config (otel.ts) — instrumentation wiring
 *
 * Mirrors apps/api/src/tracing/otel.test.ts: mocks @opentelemetry/sdk-node and
 * @opentelemetry/auto-instrumentations-node so we can assert on the config
 * passed to the SDK without starting a real NodeSDK. This file lives under
 * src/tracing/__tests__/ and is excluded from the default `pnpm test` run
 * (see apps/ai-worker/vitest.config.ts) — the OTel integration tests here need
 * real @opentelemetry/api global singletons and are run on their own:
 *   pnpm --filter @intelliflow/ai-worker exec vitest run src/tracing/__tests__/
 *
 * otel.ts calls startTracing() as a module-level side effect on import, so
 * each test does vi.resetModules() + a fresh dynamic import to get a clean
 * module-level sdkInstance singleton.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let lastAutoInstrumentationsConfig: unknown;
const nodeSdkStart = vi.fn();
const nodeSdkShutdown = vi.fn(async () => {});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class NodeSDK {
    constructor(_options: unknown) {}
    start() {
      nodeSdkStart();
    }
    async shutdown() {
      return nodeSdkShutdown();
    }
  },
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (config: unknown) => {
    lastAutoInstrumentationsConfig = config;
    return [];
  },
}));

describe('ai-worker OTel SDK config (otel.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    lastAutoInstrumentationsConfig = undefined;
    nodeSdkStart.mockClear();
    nodeSdkShutdown.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // #809 (IFC-032 follow-up): production logs must reach the same OTLP
  // gateway as traces/metrics, with trace_id/span_id attached, so Grafana's
  // "Logs for this trace" is not empty. @opentelemetry/instrumentation-pino is
  // bundled inside auto-instrumentations-node and ships disableLogSending:false
  // by default — this asserts the config makes that deliberate and visible
  // rather than relying on the bundle's implicit default, matching apps/api.
  it('enables pino log sending to the OTel Logs SDK', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.NODE_ENV = 'development';

    await import('../otel.js');

    const config = lastAutoInstrumentationsConfig as Record<
      string,
      { disableLogSending?: boolean } | undefined
    >;
    const pinoConfig = config['@opentelemetry/instrumentation-pino'];
    expect(pinoConfig).toBeDefined();
    expect(pinoConfig?.disableLogSending).toBe(false);
  });

  it('still disables the noisy fs instrumentation and keeps http enabled', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.NODE_ENV = 'development';

    await import('../otel.js');

    const config = lastAutoInstrumentationsConfig as Record<
      string,
      { enabled?: boolean } | undefined
    >;
    expect(config['@opentelemetry/instrumentation-fs']?.enabled).toBe(false);
    expect(config['@opentelemetry/instrumentation-http']?.enabled).toBe(true);
  });
});
