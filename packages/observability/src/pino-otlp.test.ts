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
 * import of pino bypasses that hook, so the test bundles `src/logging.ts` to CJS
 * in memory (esbuild, reached through tsup's dependency tree) and loads it with
 * Node's CJS loader. `pino` and `@opentelemetry/*` stay external, so they are
 * required — and patched — exactly as in production.
 */

import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const require = createRequire(import.meta.url);
const apiLogs = createRequire(require.resolve('@opentelemetry/instrumentation-pino'))(
  '@opentelemetry/api-logs'
) as typeof import('@opentelemetry/api-logs');

type CreateLogger = typeof import('./logging').createLogger;

/** Bundle src/logging.ts to CommonJS and load it through Node's CJS loader. */
function loadLoggingAsCommonJs(): { createLogger: CreateLogger } {
  const esbuild = createRequire(require.resolve('tsup'))('esbuild') as typeof import('esbuild');
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  const entry = path.join(srcDir, 'logging.ts');
  const out = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    external: ['pino', 'pino-pretty', '@opentelemetry/*'],
  });
  const mod = new Module(entry) as Module & {
    _compile(code: string, filename: string): void;
    paths: string[];
  };
  mod.filename = entry;
  mod.paths = (Module as unknown as { _nodeModulePaths(dir: string): string[] })._nodeModulePaths(
    srcDir
  );
  mod._compile(out.outputFiles[0].text, entry);
  return mod.exports as { createLogger: CreateLogger };
}

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
