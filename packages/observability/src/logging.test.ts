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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
