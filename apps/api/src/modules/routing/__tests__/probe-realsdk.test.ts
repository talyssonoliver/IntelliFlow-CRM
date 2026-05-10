import { vi, describe, it, expect } from 'vitest';
import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

describe('probe-realsdk', () => {
  it('dynamic-imports everything together', async () => {
    vi.resetModules();
    const sdk = await import('@intelliflow/observability');
    const exp = new sdk.InMemorySpanExporter();
    const p = new sdk.BasicTracerProvider({ spanProcessors: [new sdk.SimpleSpanProcessor(exp)] });
    const t = p.getTracer('a', '1.0.0');
    t.startActiveSpan('hello', (s: Span) => s.end());
    console.log(
      'probe-realsdk spans:',
      exp.getFinishedSpans().map((s: ReadableSpan) => s.name)
    );
    expect(exp.getFinishedSpans().length).toBe(1);
  });
});
