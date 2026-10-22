/**
 * Pino mixin trace-correlation tests
 *
 * Verifies that the mixin logic in `createLogger` correctly reads OTel span
 * context and ALS log context. We test the mixin behaviour directly using the
 * same `invokeMixin` logic that lives in `createLogger`, which allows precise
 * assertion of the fields without needing a capture stream.
 *
 * Uses NodeTracerProvider (from sdk-trace-node) which registers the
 * AsyncLocalStorage context manager — required for `trace.getActiveSpan()` to
 * propagate through async callbacks.
 */

import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { trace, SpanKind, context } from '@opentelemetry/api';
import { runWithLogContext, getCurrentLogContext } from './log-context';

// ---------------------------------------------------------------------------
// Mixin behaviour under test
//
// Mirrors the exact mixin closure in createLogger so assertions stay in sync.
// ---------------------------------------------------------------------------

function invokeMixin(): Record<string, unknown> {
  const reqCtx = getCurrentLogContext() ?? {};
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanCtx = activeSpan.spanContext();
    return {
      ...reqCtx,
      trace_id: spanCtx.traceId,
      span_id: spanCtx.spanId,
    };
  }
  return { ...reqCtx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pino mixin — trace correlation', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    // register() sets both the global tracer provider AND the async context manager
    provider.register();
  });

  afterEach(async () => {
    exporter.reset();
    await provider.forceFlush();
    await provider.shutdown();
    // Restore no-op globals so tests don't leak into each other
    trace.disable();
    context.disable();
  });

  it('injects trace_id and span_id when inside an active span', async () => {
    const tracer = trace.getTracer('test-tracer');

    await tracer.startActiveSpan('test-op', { kind: SpanKind.INTERNAL }, async (span) => {
      const fields = invokeMixin();

      expect(fields['trace_id']).toBeDefined();
      expect(typeof fields['trace_id']).toBe('string');
      expect((fields['trace_id'] as string).length).toBeGreaterThan(0);

      expect(fields['span_id']).toBeDefined();
      expect(typeof fields['span_id']).toBe('string');
      expect((fields['span_id'] as string).length).toBeGreaterThan(0);

      span.end();
    });
  });

  it('trace_id and span_id match the active span context', async () => {
    const tracer = trace.getTracer('test-tracer');

    await tracer.startActiveSpan('match-op', { kind: SpanKind.INTERNAL }, async (span) => {
      const expectedCtx = span.spanContext();
      const fields = invokeMixin();

      expect(fields['trace_id']).toBe(expectedCtx.traceId);
      expect(fields['span_id']).toBe(expectedCtx.spanId);

      span.end();
    });
  });

  it('omits trace_id and span_id when no span is active', () => {
    // Call outside any startActiveSpan — the global provider is registered but
    // no span is currently active in this execution context.
    const fields = invokeMixin();

    expect(fields['trace_id']).toBeUndefined();
    expect(fields['span_id']).toBeUndefined();
  });

  it('merges ALS log context fields alongside span identifiers', async () => {
    const tracer = trace.getTracer('test-tracer');

    await runWithLogContext({ correlationId: 'corr-123', tenantId: 'tenant-abc' }, async () => {
      await tracer.startActiveSpan('ctx-merge-op', { kind: SpanKind.INTERNAL }, async (span) => {
        const fields = invokeMixin();

        expect(fields['correlationId']).toBe('corr-123');
        expect(fields['tenantId']).toBe('tenant-abc');
        expect(fields['trace_id']).toBeDefined();
        expect(fields['span_id']).toBeDefined();

        span.end();
      });
    });
  });

  it('returns ALS context fields when no active span', () => {
    runWithLogContext({ correlationId: 'corr-no-span', userId: 'usr-1' }, () => {
      const fields = invokeMixin();

      expect(fields['correlationId']).toBe('corr-no-span');
      expect(fields['userId']).toBe('usr-1');
      expect(fields['trace_id']).toBeUndefined();
      expect(fields['span_id']).toBeUndefined();
    });
  });

  it('returns empty object when no span active and no ALS context', () => {
    const fields = invokeMixin();

    expect(fields).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Real records emitted by createLogger (IFC-074)
//
// The tests above exercise a copy of the mixin. These drive the real
// createLogger through an in-memory destination (pino.destination is spied, so
// no file handle is opened) and assert on the JSON pino actually writes.
// CI=1 + NODE_ENV=production keep the pino-pretty worker transport out.
// ---------------------------------------------------------------------------

describe('createLogger — real records', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let lines: string[];

  async function loadCreateLogger() {
    const pinoModule = await import('pino');
    vi.spyOn(pinoModule.default, 'destination').mockImplementation(
      () =>
        new Writable({
          write(chunk, _encoding, callback) {
            lines.push(String(chunk));
            callback();
          },
        }) as unknown as ReturnType<typeof pinoModule.default.destination>
    );
    const { createLogger } = await import('./logging');
    return createLogger;
  }

  function records(): Array<Record<string, unknown>> {
    return lines
      .join('')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  beforeEach(() => {
    lines = [];
    vi.stubEnv('CI', '1');
    vi.stubEnv('NODE_ENV', 'production');
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  it("emits the active span's trace_id and span_id on the written record", async () => {
    const createLogger = await loadCreateLogger();
    const logger = createLogger({ name: 'ifc074-test', destination: 'memory' });
    const tracer = trace.getTracer('test-tracer');

    let expected: { traceId: string; spanId: string } | undefined;
    tracer.startActiveSpan('real-record-op', (span) => {
      expected = span.spanContext();
      logger.info({ type: 'trpc.request' }, 'inside span');
      span.end();
    });

    const [record] = records();
    expect(record['type']).toBe('trpc.request');
    expect(record['trace_id']).toBe(expected?.traceId);
    expect(record['span_id']).toBe(expected?.spanId);
  });

  it('writes no trace_id or span_id outside a span', async () => {
    const createLogger = await loadCreateLogger();
    const logger = createLogger({ name: 'ifc074-test', destination: 'memory' });

    logger.info({ type: 'trpc.request' }, 'outside span');

    const [record] = records();
    expect(record['trace_id']).toBeUndefined();
    expect(record['span_id']).toBeUndefined();
  });

  it.each([
    ['email', { email: 'person@example.invalid' }, (r: Record<string, any>) => r.email],
    [
      'nested email',
      { user: { email: 'person@example.invalid' } },
      (r: Record<string, any>) => r.user.email,
    ],
    ['userEmail', { userEmail: 'person@example.invalid' }, (r: Record<string, any>) => r.userEmail],
    ['password', { password: 'x'.repeat(12) }, (r: Record<string, any>) => r.password],
    [
      'nested password',
      { body: { password: 'x'.repeat(12) } },
      (r: Record<string, any>) => r.body.password,
    ],
    ['token', { token: 'x'.repeat(12) }, (r: Record<string, any>) => r.token],
    ['nested token', { auth: { token: 'x'.repeat(12) } }, (r: Record<string, any>) => r.auth.token],
    ['accessToken', { accessToken: 'x'.repeat(12) }, (r: Record<string, any>) => r.accessToken],
    ['refreshToken', { refreshToken: 'x'.repeat(12) }, (r: Record<string, any>) => r.refreshToken],
    ['apiKey', { apiKey: 'x'.repeat(12) }, (r: Record<string, any>) => r.apiKey],
    [
      'nested apiKey',
      { cfg: { apiKey: 'x'.repeat(12) } },
      (r: Record<string, any>) => r.cfg.apiKey,
    ],
    ['api_key', { api_key: 'x'.repeat(12) }, (r: Record<string, any>) => r.api_key],
    ['secret', { secret: 'x'.repeat(12) }, (r: Record<string, any>) => r.secret],
    [
      'nested secret',
      { cfg: { secret: 'x'.repeat(12) } },
      (r: Record<string, any>) => r.cfg.secret,
    ],
    [
      'authorization',
      { authorization: 'x'.repeat(12) },
      (r: Record<string, any>) => r.authorization,
    ],
    [
      'nested authorization',
      { headers: { authorization: 'x'.repeat(12) } },
      (r: Record<string, any>) => r.headers.authorization,
    ],
    ['cookie', { cookie: 'x'.repeat(12) }, (r: Record<string, any>) => r.cookie],
    [
      'nested cookie',
      { headers: { cookie: 'x'.repeat(12) } },
      (r: Record<string, any>) => r.headers.cookie,
    ],
  ])('redacts %s', async (_label, payload, pick) => {
    const createLogger = await loadCreateLogger();
    const logger = createLogger({ name: 'ifc074-test', destination: 'memory' });

    logger.info(payload, 'redaction');

    const [record] = records();
    expect(pick(record)).toBe('[REDACTED]');
  });

  it('redacts req.headers.authorization and req.headers.cookie through the req serializer', async () => {
    const createLogger = await loadCreateLogger();
    const logger = createLogger({ name: 'ifc074-test', destination: 'memory' });

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/x',
          headers: { authorization: 'x'.repeat(12), cookie: 'y'.repeat(12), accept: 'json' },
        },
      },
      'request'
    );

    const [record] = records();
    const headers = (record['req'] as { headers: Record<string, string> }).headers;
    expect(headers.authorization).toBe('[REDACTED]');
    expect(headers.cookie).toBe('[REDACTED]');
    expect(headers.accept).toBe('json');
  });

  it('leaves non-sensitive fields untouched', async () => {
    const createLogger = await loadCreateLogger();
    const logger = createLogger({ name: 'ifc074-test', destination: 'memory' });

    logger.info({ path: 'lead.list', durationMs: 12 }, 'plain');

    const [record] = records();
    expect(record['path']).toBe('lead.list');
    expect(record['durationMs']).toBe(12);
  });
});
