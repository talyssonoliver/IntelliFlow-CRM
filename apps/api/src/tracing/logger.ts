/**
 * API structured logger (IFC-074)
 *
 * The api's per-request records go through pino so the OTel pino
 * instrumentation (registered by ./otel via
 * `@intelliflow/observability/node-instrumentations`) exports them over OTLP to
 * Loki with the active span's trace_id/span_id attached.
 *
 * The logger is created lazily, on first use: instrumentation-pino patches the
 * `pino()` factory when it is called, so a logger built when this module is
 * imported — before `instrument.ts` has started the SDK — would never export
 * its records (proved by packages/observability/src/pino-otlp.test.ts).
 */

import { createLogger, type Logger } from '@intelliflow/observability';

let apiLogger: Logger | undefined;

/** The api's pino logger, named after the OTel service (default `intelliflow-api`). */
export function getApiLogger(): Logger {
  apiLogger ??= createLogger({
    name: process.env.OTEL_SERVICE_NAME?.trim() || 'intelliflow-api',
  });
  return apiLogger;
}

/** Drop the cached logger so the next call builds a new one (tests only). */
export function resetApiLoggerForTests(): void {
  apiLogger = undefined;
}
