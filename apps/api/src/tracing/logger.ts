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
let failureReported = false;

/** The api's pino logger, named after the OTel service (default `intelliflow-api`). */
export function getApiLogger(): Logger {
  apiLogger ??= createLogger({
    name: process.env.OTEL_SERVICE_NAME?.trim() || 'intelliflow-api',
  });
  return apiLogger;
}

/**
 * Emit one record. Logging must never fail or change a request: a logger that
 * cannot be built (e.g. pino rejects an unknown LOG_LEVEL) or a write that
 * throws is swallowed, and reported once on stderr so the gap is visible.
 */
export function apiLog(
  level: 'info' | 'warn' | 'error',
  record: Record<string, unknown>,
  message: string
): void {
  try {
    getApiLogger()[level](record, message);
  } catch (error) {
    if (!failureReported) {
      failureReported = true;
      console.error(
        `[api-logger] structured logging unavailable: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }
}

/** Drop the cached logger so the next call builds a new one (tests only). */
export function resetApiLoggerForTests(): void {
  apiLogger = undefined;
  failureReported = false;
}
