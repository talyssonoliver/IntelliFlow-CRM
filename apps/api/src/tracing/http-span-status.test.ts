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
import { setNodeSdkStarted } from './otel-state';

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
  // What startTracing() records in production, so Sentry leaves HTTP spans to us.
  setNodeSdkStarted(true);

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

  // Our span is named only by method ("GET"), so the SLOs' span_name health
  // exclusion cannot match it. Probes must produce no SERVER span at all.
  it.each(['/health', '/health/ready', '/api/health', '/api/health/detailed', '/health?probe=1'])(
    'creates no SERVER span for the health probe %s',
    async (path) => {
      await get(path);
      await processor.forceFlush();
      expect(exporter.getFinishedSpans().filter((s) => s.kind === SpanKind.SERVER)).toHaveLength(0);
    }
  );

  // PG-208: the task-automation webhook token is a path segment, so neither our
  // NodeSDK nor Sentry may export a span for it, with both SDKs running together.
  it.each(['/webhooks/task-automation/', '/api/webhooks/task-automation/'])(
    'creates no SERVER span for the secret-bearing webhook path %s<token>',
    async (prefix) => {
      const token = 'x'.repeat(32);
      await get(`${prefix}${token}`);
      await processor.forceFlush();
      // The CLIENT spans are this test's own fetch() to the server; in production
      // that span belongs to the webhook sender, not to the api.
      const apiSpans = exporter.getFinishedSpans().filter((s) => s.kind !== SpanKind.CLIENT);
      expect(apiSpans.filter((s) => s.kind === SpanKind.SERVER)).toHaveLength(0);
      expect(JSON.stringify(apiSpans.map((s) => s.attributes))).not.toContain(token);
    }
  );

  it.each(['/healthcare', '/api/healthz', '/api/contacts/health'])(
    'still traces %s, which only looks like a health path',
    async (path) => {
      await get(path);
      expect(await serverSpansFor(path)).toHaveLength(1);
    }
  );
});
