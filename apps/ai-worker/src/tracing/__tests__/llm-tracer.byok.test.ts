/**
 * PG-199 BYOK: a failed call on a tenant's own key exports only its error class and HTTP status
 * to OpenTelemetry, never the provider's message (which can quote masked key text). A platform
 * call keeps its full error. Fake keys are built at runtime from repeated characters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@opentelemetry/api', async (importOriginal) => importOriginal());
vi.mock('@opentelemetry/sdk-trace-base', async (importOriginal) => importOriginal());

import {
  AlwaysOnSampler,
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';

const KEY_FRAGMENT = 'z'.repeat(12) + 'QRST';

function failingModel() {
  const error = Object.assign(new Error(`Incorrect API key provided: ${KEY_FRAGMENT}`), {
    status: 401,
  });
  return { invoke: vi.fn().mockRejectedValue(error) } as never;
}

describe('wrapModelWithTracing - error export', () => {
  let exporter: InstanceType<typeof InMemorySpanExporter>;
  let provider: InstanceType<typeof BasicTracerProvider>;

  beforeEach(() => {
    vi.resetModules();
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      sampler: new AlwaysOnSampler(),
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

  it('a BYOK span carries the error class and status, not the provider message', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const model = wrapModelWithTracing(failingModel(), {
      purpose: 'scoring',
      tier: 'free',
      pricingKey: 'gpt-4o-mini',
      byok: true,
    });
    await expect(model.invoke('hi')).rejects.toThrow();

    const [span] = exporter.getFinishedSpans();
    const exported = JSON.stringify({ status: span!.status, events: span!.events });
    expect(exported).not.toContain(KEY_FRAGMENT);
    expect(exported).toContain('HTTP 401');
  });

  it('a platform span keeps the full error (the control)', async () => {
    const { wrapModelWithTracing } = await import('../llm-tracer.js');
    const model = wrapModelWithTracing(failingModel(), { purpose: 'scoring', tier: 'free' });
    await expect(model.invoke('hi')).rejects.toThrow();

    const [span] = exporter.getFinishedSpans();
    expect(JSON.stringify({ status: span!.status, events: span!.events })).toContain(KEY_FRAGMENT);
  });
});
