import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Span } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import {
  InMemorySpanExporter,
  BasicTracerProvider,
  SimpleSpanProcessor,
} from '@intelliflow/observability';

describe('router-probe3', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let prismaMock: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    prismaMock = mockDeep<PrismaClient>();
    const t = provider.getTracer('probe', '0');
    t.startActiveSpan('beforeEach.probe', (s: Span) => s.end());
    console.log(
      '[bf probe] spans:',
      exporter.getFinishedSpans().map((s: ReadableSpan) => s.name)
    );
  });

  it('works', () => {
    expect(exporter.getFinishedSpans().length).toBe(1);
  });
});
