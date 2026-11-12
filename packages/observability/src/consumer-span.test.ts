/**
 * IFC-097: one span per queue job / polled unit of work, continuing the producer's trace.
 *
 * Uses a real NodeTracerProvider (async context manager + W3C propagator) and an
 * in-memory exporter, so parenting is checked on the spans the SDK actually ends.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { carrierOf, runConsumerJob, runWorkSpan, WORKER_TRACER_NAME } from './consumer-span';

let exporter: InMemorySpanExporter;
let provider: NodeTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  provider.register();
});

afterEach(async () => {
  exporter.reset();
  await provider.shutdown();
  trace.disable();
  context.disable();
  propagation.disable();
});

/** A carrier as the api injects it: a real producer span's traceparent. */
function producerCarrier(): { carrier: Record<string, string>; traceId: string; spanId: string } {
  const producer = trace.getTracer('producer').startSpan('enqueue', { kind: SpanKind.PRODUCER });
  const carrier: Record<string, string> = {};
  propagation.inject(trace.setSpan(context.active(), producer), carrier);
  const { traceId, spanId } = producer.spanContext();
  producer.end();
  return { carrier, traceId, spanId };
}

const spanNamed = (name: string) => exporter.getFinishedSpans().find((s) => s.name === name);

describe('carrierOf', () => {
  it('returns the string entries of _otelCarrier', () => {
    expect(carrierOf({ _otelCarrier: { traceparent: 'x', n: 1 } })).toEqual({ traceparent: 'x' });
  });

  it.each([undefined, null, 'text', 7, {}, { _otelCarrier: null }, { _otelCarrier: { n: 1 } }])(
    'is undefined for %j',
    (data) => {
      expect(carrierOf(data)).toBeUndefined();
    }
  );
});

describe('runConsumerJob', () => {
  it('opens a CONSUMER span that continues the producer trace from _otelCarrier', async () => {
    const { carrier, traceId, spanId } = producerCarrier();

    const result = await runConsumerJob(
      {
        queueName: 'ai-scoring',
        jobName: 'score-lead',
        jobId: 42,
        attempt: 2,
        workerName: 'ai-worker',
        data: { leadId: 'l-1', _otelCarrier: carrier },
      },
      async () => 'done'
    );

    expect(result).toBe('done');
    const span = spanNamed('process ai-scoring');
    expect(span).toBeDefined();
    expect(span!.kind).toBe(SpanKind.CONSUMER);
    expect(span!.spanContext().traceId).toBe(traceId);
    expect(span!.parentSpanContext?.spanId).toBe(spanId);
    expect(span!.instrumentationScope.name).toBe(WORKER_TRACER_NAME);
    expect(span!.attributes).toEqual({
      'messaging.system': 'bullmq',
      'messaging.operation.type': 'process',
      'messaging.destination.name': 'ai-scoring',
      'worker.name': 'ai-worker',
      'messaging.bullmq.job.name': 'score-lead',
      'messaging.message.id': '42',
      'messaging.bullmq.job.attempt': 2,
    });
  });

  it('makes the work inside it children of the consumer span', async () => {
    await runConsumerJob({ queueName: 'q', workerName: 'events-worker' }, async () => {
      trace.getTracer('pg').startSpan('pg.query:SELECT').end();
    });

    const consumer = spanNamed('process q')!;
    const query = spanNamed('pg.query:SELECT')!;
    expect(query.spanContext().traceId).toBe(consumer.spanContext().traceId);
    expect(query.parentSpanContext?.spanId).toBe(consumer.spanContext().spanId);
  });

  it('starts a new root trace when the job has no carrier', async () => {
    await runConsumerJob(
      { queueName: 'q', workerName: 'ingestion-worker', data: {} },
      async () => 1
    );
    const span = spanNamed('process q')!;
    expect(span.parentSpanContext).toBeUndefined();
    expect(span.attributes['messaging.message.id']).toBeUndefined();
  });

  it('records a fault as an error and rethrows it', async () => {
    await expect(
      runConsumerJob({ queueName: 'q', workerName: 'w' }, async () => {
        throw new Error('provider down');
      })
    ).rejects.toThrow('provider down');

    const span = spanNamed('process q')!;
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: 'provider down' });
    expect(span.events.map((e) => e.name)).toEqual(['exception']);
  });

  it('records a non-Error throw as an error too', async () => {
    await expect(
      runConsumerJob({ queueName: 'q', workerName: 'w' }, async () => {
        throw 'plain';
      })
    ).rejects.toBe('plain');
    expect(spanNamed('process q')!.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('keeps an expected outcome out of the error status', async () => {
    await expect(
      runConsumerJob(
        { queueName: 'q', workerName: 'w' },
        async () => {
          throw new Error('inconclusive');
        },
        { isExpectedError: () => true }
      )
    ).rejects.toThrow('inconclusive');

    const span = spanNamed('process q')!;
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.events.map((e) => [e.name, e.attributes])).toEqual([
      ['expected_outcome', { 'exception.message': 'inconclusive' }],
    ]);
  });
});

describe('runWorkSpan', () => {
  it('runs polled work in an INTERNAL span and hands it the span', async () => {
    let seen: Span | undefined;
    const out = await runWorkSpan('outbox.poll', { 'outbox.batch_size': 10 }, async (span) => {
      seen = span;
      span.setAttribute('outbox.events', 3);
      return 3;
    });

    expect(out).toBe(3);
    const span = spanNamed('outbox.poll')!;
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.spanContext().spanId).toBe(seen!.spanContext().spanId);
    expect(span.attributes).toEqual({ 'outbox.batch_size': 10, 'outbox.events': 3 });
  });

  it('nests under the active span', async () => {
    await runWorkSpan('outbox.poll', {}, async () =>
      runWorkSpan('outbox.dispatch', { 'outbox.event.type': 'lead.created' }, async () => undefined)
    );
    const poll = spanNamed('outbox.poll')!;
    expect(spanNamed('outbox.dispatch')!.parentSpanContext?.spanId).toBe(poll.spanContext().spanId);
  });

  it('records a failure and rethrows', async () => {
    await expect(
      runWorkSpan('outbox.dispatch', {}, async () => {
        throw new Error('handler failed');
      })
    ).rejects.toThrow('handler failed');
    expect(spanNamed('outbox.dispatch')!.status.code).toBe(SpanStatusCode.ERROR);
  });
});

describe('without a registered SDK', () => {
  it('still runs the work (no-op spans)', async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
    expect(await runConsumerJob({ queueName: 'q', workerName: 'w' }, async () => 'ok')).toBe('ok');
    expect(await runWorkSpan('x', {}, async () => 'ok')).toBe('ok');
  });
});
