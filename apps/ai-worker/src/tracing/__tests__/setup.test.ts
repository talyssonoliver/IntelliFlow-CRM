/**
 * OTel setup + LLM span tracing tests
 *
 * Uses InMemorySpanExporter + SimpleSpanProcessor to capture spans synchronously
 * without needing a running collector or external infrastructure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Passthrough mocks ensure we ALWAYS get the real OTel modules even when another
// file in the same worker fork has called vi.mock('@opentelemetry/api', ...).
vi.mock('@opentelemetry/api', async (importOriginal) => importOriginal());
vi.mock('@opentelemetry/sdk-trace-base', async (importOriginal) => importOriginal());

import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';

// ---------------------------------------------------------------------------
// SDK initialisation guard
// ---------------------------------------------------------------------------

describe('OTel setup', () => {
  it('initializeOpenTelemetry returns null when OTEL_ENABLED=false', async () => {
    // Temporarily disable
    const original = process.env.OTEL_ENABLED;
    process.env.OTEL_ENABLED = 'false';

    try {
      // Dynamic import ensures env is read after the override
      const { initializeOpenTelemetry } = await import('../otel.js');
      const sdk = initializeOpenTelemetry();
      expect(sdk).toBeNull();
    } finally {
      if (original === undefined) {
        delete process.env.OTEL_ENABLED;
      } else {
        process.env.OTEL_ENABLED = original;
      }
    }
  });

  it('startTracing does not throw in a test environment', async () => {
    // In tests there is no collector — this exercises the dev-mode console-fallback branch.
    // We just verify no exception propagates.
    const { getSDKInstance } = await import('../otel.js');
    // SDK may already be started (module-level call). Either null or NodeSDK is fine.
    expect(() => getSDKInstance()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LLM span wrapping
// ---------------------------------------------------------------------------

describe('wrapModelWithTracing', () => {
  let exporter: InstanceType<typeof InMemorySpanExporter>;
  let provider: InstanceType<typeof BasicTracerProvider>;

  beforeEach(() => {
    // Reset modules so llm-tracer.ts is re-imported fresh each test.
    // The passthrough vi.mock above ensures both the test and llm-tracer.ts
    // resolve @opentelemetry/api through the same factory → same instance.
    vi.resetModules();

    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    // Disable any previous registration, then set our test provider
    trace.disable();
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    exporter.reset();
    await provider.forceFlush();
    trace.disable();
  });

  it('emits an llm.invoke span with expected attributes', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');

    // Minimal BaseChatModel stub — only needs invoke()
    const fakeModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'hello' }),
    } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;

    const wrapped = wrapModelWithTracing(fakeModel, { purpose: 'scoring', tier: 'free' });

    await wrapped.invoke('test prompt');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('llm.invoke');
    expect(spans[0].attributes['llm.purpose']).toBe('scoring');
    expect(spans[0].attributes['llm.tier']).toBe('free');
    expect(spans[0].attributes['tenant.id']).toBe('unknown'); // no store set in test
    expect(spans[0].status.code).toBe(SpanStatusCode.OK);
  });

  it('records exception and sets ERROR status when invoke throws', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');

    const boom = new Error('LLM timeout');
    const fakeModel = {
      invoke: vi.fn().mockRejectedValue(boom),
    } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;

    const wrapped = wrapModelWithTracing(fakeModel, { purpose: 'reasoning', tier: 'premium' });

    await expect(wrapped.invoke('prompt')).rejects.toThrow('LLM timeout');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    // recordException stores the error message
    expect(spans[0].events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('propagates tenant.id from tenantContextStore', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const { tenantContextStore } = await import('../tenant-context.js');

    const fakeModel = {
      invoke: vi.fn().mockResolvedValue({ content: 'ok' }),
    } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel;

    const wrapped = wrapModelWithTracing(fakeModel, { purpose: 'rag', tier: 'standard' });

    await tenantContextStore.run({ tenantId: 'tenant-abc-123' }, async () => {
      await wrapped.invoke('test');
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['tenant.id']).toBe('tenant-abc-123');
  });
});
