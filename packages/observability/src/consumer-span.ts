/**
 * Consumer spans for queue jobs and polled work (IFC-097, IFC-116).
 *
 * Without a span around a job, every query or LLM call the job makes starts its
 * own root trace, and the W3C carrier the producer injected (`_otelCarrier`) has
 * nothing to attach to. These helpers open one span per unit of work, parented
 * on that carrier when there is one, and run the work inside it, so the
 * auto-instrumented spans and the log lines (trace_id) of the job land in one
 * trace that continues the producer's.
 *
 * They use the global OpenTelemetry API: when no SDK is registered (tests,
 * OTEL_ENABLED=false) the spans are no-ops and the work runs unchanged.
 *
 * @module observability/consumer-span
 */

import {
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

/** Instrumentation scope of the spans opened here. */
export const WORKER_TRACER_NAME = '@intelliflow/worker-runtime';

export interface ConsumerJob {
  /** Queue the job came from (messaging.destination.name). */
  queueName: string;
  /** Job name inside the queue. */
  jobName?: string;
  /** Job id (messaging.message.id). */
  jobId?: string | number;
  /** 1-based attempt number. */
  attempt?: number;
  /** Logical worker that runs the job (events-worker, ingestion-worker, ai-worker). */
  workerName: string;
  /** Job payload; its `_otelCarrier` (W3C traceparent) parents the span when present. */
  data?: unknown;
}

export interface SpanRunOptions {
  /**
   * True when a thrown error is an expected outcome rather than a fault: the
   * span records it as an event and keeps an unset status.
   */
  isExpectedError?: (error: unknown) => boolean;
}

/** The W3C carrier a producer put on the job payload, or undefined. */
export function carrierOf(data: unknown): Record<string, string> | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const carrier = (data as { _otelCarrier?: unknown })._otelCarrier;
  if (!carrier || typeof carrier !== 'object') return undefined;
  const entries = Object.entries(carrier as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function runInSpan<T>(
  span: Span,
  fn: (span: Span) => Promise<T>,
  options: SpanRunOptions
): Promise<T> {
  try {
    return await fn(span);
  } catch (error) {
    if (options.isExpectedError?.(error)) {
      span.addEvent('expected_outcome', {
        'exception.message': error instanceof Error ? error.message : String(error),
      });
    } else {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Run one queue job inside a CONSUMER span named `process <queue>`, continuing
 * the producer's trace when the payload carries `_otelCarrier`.
 */
export function runConsumerJob<T>(
  job: ConsumerJob,
  fn: () => Promise<T>,
  options: SpanRunOptions = {}
): Promise<T> {
  const carrier = carrierOf(job.data);
  const parent = carrier ? propagation.extract(context.active(), carrier) : context.active();
  const attributes: Attributes = {
    'messaging.system': 'bullmq',
    'messaging.operation.type': 'process',
    'messaging.destination.name': job.queueName,
    'worker.name': job.workerName,
  };
  if (job.jobName) attributes['messaging.bullmq.job.name'] = job.jobName;
  if (job.jobId !== undefined) attributes['messaging.message.id'] = String(job.jobId);
  if (job.attempt !== undefined) attributes['messaging.bullmq.job.attempt'] = job.attempt;

  return trace
    .getTracer(WORKER_TRACER_NAME)
    .startActiveSpan(
      `process ${job.queueName}`,
      { kind: SpanKind.CONSUMER, attributes },
      parent,
      (span) => runInSpan(span, fn, options)
    );
}

/**
 * Run one unit of polled or scheduled work (an outbox poll, a maintenance tick)
 * inside an INTERNAL span, so its queries share one trace instead of each
 * starting a root.
 */
export function runWorkSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
  options: SpanRunOptions = {}
): Promise<T> {
  return trace
    .getTracer(WORKER_TRACER_NAME)
    .startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, (span) =>
      runInSpan(span, fn, options)
    );
}
