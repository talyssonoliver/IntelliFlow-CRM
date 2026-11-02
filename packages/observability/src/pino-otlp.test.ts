/**
 * Pino → OTel Logs SDK interop (IFC-074)
 *
 * Proves the pipeline the api relies on: a logger built by `createLogger`
 * AFTER `@opentelemetry/instrumentation-pino` is enabled has its records
 * forwarded to the OTel Logs SDK (and so over OTLP to Loki) carrying the active
 * span's trace and span ids. A logger built before the instrumentation is
 * enabled is not patched — the reason `apps/api/src/tracing/logger.ts` creates
 * its logger lazily, on the first request, after `instrument.ts` started the SDK.
 *
 * `@opentelemetry/api-logs` is resolved through instrumentation-pino's own
 * dependency tree so the test registers the provider on the exact global the
 * instrumentation reads (`logs.getLogger`).
 *
 * The instrumentation patches pino through the CommonJS require hook, which is
 * how production loads it (`node dist/main.js`, tsup CJS output). Vitest's ESM
 * import of pino bypasses that hook, so logging.ts is loaded through Node's CJS
 * loader (test-utils/load-logging-cjs). `pino` and `@opentelemetry/*` stay
 * external, so they are required — and patched — exactly as in production.
 */

import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { trace, context } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
  InMemoryLogRecordExporter,
} from '@opentelemetry/sdk-logs';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { loadLoggingAsCommonJs } from './test-utils/load-logging-cjs';

const require = createRequire(import.meta.url);
const apiLogs = createRequire(require.resolve('@opentelemetry/instrumentation-pino'))(
  '@opentelemetry/api-logs'
) as typeof import('@opentelemetry/api-logs');

type CreateLogger = typeof import('./logging').createLogger;

describe('pino records reach the OTel Logs SDK', () => {
  const logExporter = new InMemoryLogRecordExporter();
  const loggerProvider = new LoggerProvider({
    processors: [new SimpleLogRecordProcessor(logExporter)],
  });
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
  });
  let instrumentation: PinoInstrumentation;
  let loggerBuiltBeforeInstrumentation: ReturnType<CreateLogger>;

  beforeAll(() => {
    vi.stubEnv('CI', '1');
    vi.stubEnv('NODE_ENV', 'production');
    tracerProvider.register();
    apiLogs.logs.setGlobalLoggerProvider(loggerProvider);
    // Built before the instrumentation is enabled: pino's factory is not patched yet.
    loggerBuiltBeforeInstrumentation = loadLoggingAsCommonJs().createLogger({
      name: 'ifc074-early',
      level: 'info',
    });
    instrumentation = new PinoInstrumentation({ disableLogSending: false });
  });

  afterAll(async () => {
    instrumentation.disable();
    await loggerProvider.shutdown();
    await tracerProvider.shutdown();
    apiLogs.logs.disable();
    trace.disable();
    context.disable();
    vi.unstubAllEnvs();
  });

  it("exports a record carrying the active span's trace_id and span_id", () => {
    const { createLogger } = loadLoggingAsCommonJs();
    // CI=1 keeps the pino-pretty transport out: the record goes to stdout and,
    // through the patched pino, to the OTel Logs SDK.
    const logger = createLogger({ name: 'ifc074-otlp-test', level: 'info' });

    let expected: { traceId: string; spanId: string } | undefined;
    trace.getTracer('ifc074').startActiveSpan('otlp-op', (span) => {
      expected = span.spanContext();
      logger.info({ type: 'trpc.request', path: 'lead.list' }, 'trpc request');
      span.end();
    });

    const exported = logExporter.getFinishedLogRecords();
    logExporter.reset();
    const record = exported.find((r) => r.attributes['type'] === 'trpc.request');
    expect(record).toBeDefined();
    expect(record?.spanContext?.traceId).toBe(expected?.traceId);
    expect(record?.spanContext?.spanId).toBe(expected?.spanId);
    expect(record?.body).toBe('trpc request');
  });

  it('does not export records from a logger built before the instrumentation was enabled', () => {
    trace.getTracer('ifc074').startActiveSpan('early-op', (span) => {
      loggerBuiltBeforeInstrumentation.info({ type: 'trpc.early' }, 'early');
      span.end();
    });

    const exported = logExporter.getFinishedLogRecords();
    logExporter.reset();
    expect(exported.find((r) => r.attributes['type'] === 'trpc.early')).toBeUndefined();
  });
});
