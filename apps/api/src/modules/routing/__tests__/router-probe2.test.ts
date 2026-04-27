import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import {
  InMemorySpanExporter,
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@intelliflow/observability';

describe('router-probe2', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    const t = provider.getTracer('probe', '0');
    t.startActiveSpan('beforeEach.probe', (s) => s.end());
    console.log('[beforeEach.probe] spans:', exporter.getFinishedSpans().map((s) => s.name));
    exporter.reset();
  });

  it('basic provider works', () => {
    const t = provider.getTracer('test', '0');
    t.startActiveSpan('hello', (s) => s.end());
    console.log('[it] spans:', exporter.getFinishedSpans().map((s) => s.name));
    expect(exporter.getFinishedSpans().length).toBe(1);
  });
});
