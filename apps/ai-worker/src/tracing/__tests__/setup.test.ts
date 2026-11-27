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
vi.mock('@opentelemetry/sdk-trace', async (importOriginal) => importOriginal());

// OTel SDK 3.x (IFC-319): sdk-trace-base became @opentelemetry/sdk-trace, whose single
// TracerProvider replaces BasicTracerProvider.
import {
  AlwaysOnSampler,
  TracerProvider as BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace';
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
      // .env.test sets OTEL_TRACES_SAMPLER=always_off, which a run from the repo root loads.
      sampler: new AlwaysOnSampler(),
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
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

  it('refuses the model call before any provider is reached once the tenant allowance of AI actions is used up', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const { tenantContextStore } = await import('../tenant-context.js');
    const { setAiActionsAllowanceReader, AiActionsExhaustedError } =
      await import('../../lib/ai-actions-allowance.js');
    setAiActionsAllowanceReader({
      getLimits: vi.fn().mockResolvedValue({ aiActionsPerMonth: 1000 }),
      getKeyUsage: vi.fn().mockResolvedValue(1000),
    });
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const wrapped = wrapModelWithTracing(
      { invoke } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel,
      { purpose: 'scoring', tier: 'free' }
    );

    await expect(
      tenantContextStore.run({ tenantId: 'tenant-full' } as never, () => wrapped.invoke('p'))
    ).rejects.toBeInstanceOf(AiActionsExhaustedError);
    expect(invoke).not.toHaveBeenCalled();
    setAiActionsAllowanceReader(null);
  });

  it('counts one AI action per completed call, and one for a billed but unusable answer, never for a refusal', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const { setAiActionRecorder } = await import('../../lib/ai-actions-allowance.js');
    const recorder = vi.fn().mockResolvedValue(undefined);
    setAiActionRecorder(recorder);
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ content: 'ok' })
      .mockRejectedValueOnce(Object.assign(new Error('refusal'), { billedResult: { content: '' } }))
      .mockRejectedValueOnce(new Error('network down'));
    const wrapped = wrapModelWithTracing(
      { invoke } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel,
      { purpose: 'scoring', tier: 'free' }
    );

    await wrapped.invoke('p'); // completed
    await expect(wrapped.invoke('p')).rejects.toThrow('refusal'); // billed
    await expect(wrapped.invoke('p')).rejects.toThrow('network down'); // nothing billed
    expect(recorder).toHaveBeenCalledTimes(2);
    setAiActionRecorder(null);
  });

  it('runs the model call for a tenant with actions left, and for an unlimited plan', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const { tenantContextStore } = await import('../tenant-context.js');
    const { setAiActionsAllowanceReader } = await import('../../lib/ai-actions-allowance.js');
    setAiActionsAllowanceReader({
      getLimits: vi.fn().mockImplementation(async (t: string) => ({
        aiActionsPerMonth: t === 'owner' ? null : 1000,
      })),
      getKeyUsage: vi.fn().mockResolvedValue(999),
    });
    const invoke = vi.fn().mockResolvedValue({ content: 'ok' });
    const wrapped = wrapModelWithTracing(
      { invoke } as unknown as import('@langchain/core/language_models/chat_models').BaseChatModel,
      { purpose: 'scoring', tier: 'free' }
    );
    await tenantContextStore.run({ tenantId: 'starter-tenant' } as never, () =>
      wrapped.invoke('p')
    );
    await tenantContextStore.run({ tenantId: 'owner' } as never, () => wrapped.invoke('p'));
    expect(invoke).toHaveBeenCalledTimes(2);
    setAiActionsAllowanceReader(null);
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
