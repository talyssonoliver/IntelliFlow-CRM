import { vi, describe, it, expect } from 'vitest';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import {
  InMemorySpanExporter,
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@intelliflow/observability';

describe('router-probe', () => {
  it('basic provider works', () => {
    const exp = new InMemorySpanExporter();
    const p = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exp)] });
    const t = p.getTracer('test', '0');
    t.startActiveSpan('hello', (s) => s.end());
    console.log('router-probe spans:', exp.getFinishedSpans().map((s) => s.name));
    expect(exp.getFinishedSpans().length).toBe(1);
  });
});
