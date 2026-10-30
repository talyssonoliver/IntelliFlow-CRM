/**
 * HTTP server span status with Sentry and our NodeSDK together (#1098).
 *
 * Production starts our NodeSDK first (src/instrument.ts), then initializeSentry().
 * Sentry's httpIntegration used to register a second OpenTelemetry HttpInstrumentation
 * that exported its own SERVER span per request and marked 404 as an error
 * (`not_found`), so internet scanners burned the api availability SLO. Our NodeSDK's
 * HttpInstrumentation follows semconv: a server span is an error only for 5xx.
 *
 * Real libraries: our NodeSDK with the production instrumentation set and an in-memory
 * exporter, the real initializeSentry() (DSN on a .example.invalid host, no events are
 * captured here), and a real HTTP server.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.unmock('@opentelemetry/api');
vi.unmock('./sentry');

import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { getStandardNodeInstrumentations } from '@intelliflow/observability/node-instrumentations';
import { closeSentry, initializeSentry } from './sentry';

const exporter = new tracing.InMemorySpanExporter();
const processor = new tracing.SimpleSpanProcessor(exporter);
let sdk: NodeSDK;
let server: Server;
let baseUrl: string;
async function get(path: string): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`);
  await res.text();
  return res.status;
}

/** SERVER spans for one request path, after the span processor has flushed. */
async function serverSpansFor(path: string) {
  await processor.forceFlush();
  return exporter
    .getFinishedSpans()
    .filter(
      (s) =>
        s.kind === SpanKind.SERVER &&
        (s.attributes['url.path'] === path || s.attributes['http.target'] === path)
    );
}

beforeAll(async () => {
  // Same order as production: NodeSDK first, then Sentry.
  // .env.test sets OTEL_TRACES_SAMPLER=always_off; sample everything here.
  sdk = new NodeSDK({
    sampler: new tracing.AlwaysOnSampler(),
    spanProcessors: [processor],
    instrumentations: [getStandardNodeInstrumentations()],
  });
  sdk.start();

  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SENTRY_ENABLED', 'true');
  vi.stubEnv('SENTRY_DSN', 'https://public@sentry.example.invalid/1');
  vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '1');
  await initializeSentry();
  // Load http after both SDKs are up, so the instrumentation hooks see the require.
  const http = createRequire(__filename)('node:http') as typeof import('node:http');
  server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    res.statusCode = req.url === '/boom' ? 500 : 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await closeSentry();
  await sdk?.shutdown();
  vi.unstubAllEnvs();
});

beforeEach(() => exporter.reset());

describe('api HTTP server spans (#1098)', () => {
  it('does not mark a 404 from an unknown route as an error', async () => {
    expect(await get('/api/vaults')).toBe(404);
    const spans = await serverSpansFor('/api/vaults');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.map((s) => s.status.code)).not.toContain(SpanStatusCode.ERROR);
  });

  it('still marks a 500 as an error', async () => {
    expect(await get('/boom')).toBe(500);
    const spans = await serverSpansFor('/boom');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((s) => s.status.code === SpanStatusCode.ERROR)).toBe(true);
  });

  it('exports one SERVER span per request', async () => {
    await get('/api/multisigs');
    expect(await serverSpansFor('/api/multisigs')).toHaveLength(1);
  });
});
