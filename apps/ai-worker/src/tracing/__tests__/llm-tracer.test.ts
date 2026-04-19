/**
 * wrapEmbeddingsWithTracing — unit tests
 *
 * Uses InMemorySpanExporter + SimpleSpanProcessor to capture spans synchronously
 * without needing a running collector or external infrastructure.
 *
 * Pattern mirrors the wrapModelWithTracing block in setup.test.ts — uses
 * BasicTracerProvider + trace.setGlobalTracerProvider so the module-level
 * `tracer` ProxyTracer in llm-tracer.ts routes through the test provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Passthrough mocks ensure we ALWAYS get the real OTel modules.
vi.mock('@opentelemetry/api', async (importOriginal) => importOriginal());
vi.mock('@opentelemetry/sdk-trace-base', async (importOriginal) => importOriginal());

import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Embeddings } from '@langchain/core/embeddings';

// ---------------------------------------------------------------------------
// Helpers — minimal Embeddings stub
// ---------------------------------------------------------------------------

function makeEmbeddingsStub(
  overrides: Partial<{
    embedQuery: (text: string) => Promise<number[]>;
    embedDocuments: (texts: string[]) => Promise<number[][]>;
  }> = {}
): Embeddings {
  return {
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedDocuments: vi.fn().mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4],
    ]),
    ...overrides,
  } as unknown as Embeddings;
}

// ---------------------------------------------------------------------------
// wrapEmbeddingsWithTracing
// ---------------------------------------------------------------------------

describe('wrapEmbeddingsWithTracing', () => {
  let exporter: InstanceType<typeof InMemorySpanExporter>;
  let provider: InstanceType<typeof BasicTracerProvider>;

  beforeEach(() => {
    vi.resetModules();

    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.disable();
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    exporter.reset();
    await provider.forceFlush();
    trace.disable();
  });

  it('emits an llm.embed span for embedQuery with correct attributes', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');

    const stub = makeEmbeddingsStub();
    const wrapped = wrapEmbeddingsWithTracing(stub, { tier: 'free' });

    const result = await wrapped.embedQuery('hello world');

    expect(result).toEqual([0.1, 0.2, 0.3]);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('llm.embed');
    expect(spans[0].attributes['llm.tier']).toBe('free');
    expect(spans[0].attributes['llm.model_name']).toBe('rag-free');
    expect(spans[0].attributes['tenant.id']).toBe('unknown');
    expect(spans[0].status.code).toBe(SpanStatusCode.OK);
  });

  it('emits an llm.embed span for embedDocuments with correct attributes', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');

    const stub = makeEmbeddingsStub();
    const wrapped = wrapEmbeddingsWithTracing(stub, { tier: 'premium' });

    const result = await wrapped.embedDocuments(['doc1', 'doc2']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('llm.embed');
    expect(spans[0].attributes['llm.tier']).toBe('premium');
    expect(spans[0].attributes['llm.model_name']).toBe('rag-premium');
    expect(spans[0].attributes['tenant.id']).toBe('unknown');
    expect(spans[0].status.code).toBe(SpanStatusCode.OK);
  });

  it('records exception and sets ERROR status when embedQuery throws', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');

    const boom = new Error('embeddings timeout');
    const stub = makeEmbeddingsStub({
      embedQuery: vi.fn().mockRejectedValue(boom),
    });
    const wrapped = wrapEmbeddingsWithTracing(stub, { tier: 'standard' });

    await expect(wrapped.embedQuery('fail')).rejects.toThrow('embeddings timeout');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('records exception and sets ERROR status when embedDocuments throws', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');

    const boom = new Error('batch embed failure');
    const stub = makeEmbeddingsStub({
      embedDocuments: vi.fn().mockRejectedValue(boom),
    });
    const wrapped = wrapEmbeddingsWithTracing(stub, { tier: 'free' });

    await expect(wrapped.embedDocuments(['a', 'b'])).rejects.toThrow('batch embed failure');

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
    expect(spans[0].events.some((e) => e.name === 'exception')).toBe(true);
  });

  it('propagates tenant.id from tenantContextStore', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');
    const { tenantContextStore } = await import('../tenant-context.js');

    const stub = makeEmbeddingsStub();
    const wrapped = wrapEmbeddingsWithTracing(stub, { tier: 'free' });

    await tenantContextStore.run({ tenantId: 'tenant-embed-xyz' }, async () => {
      await wrapped.embedQuery('test');
    });

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0].attributes['tenant.id']).toBe('tenant-embed-xyz');
  });

  it('returns the instance unchanged when embedQuery is not a function (mock guard)', async () => {
    const { wrapEmbeddingsWithTracing } = await import('../llm-tracer.js');

    // Stub that has neither embedQuery nor embedDocuments
    const noopStub = {} as unknown as Embeddings;
    const result = wrapEmbeddingsWithTracing(noopStub, { tier: 'free' });

    expect(result).toBe(noopStub);
    // No spans emitted
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
