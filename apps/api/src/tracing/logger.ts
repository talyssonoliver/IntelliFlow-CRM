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
let loggerUnavailable = false;
let failureReported = false;

function reportFailureOnce(error: unknown): void {
  if (failureReported) return;
  failureReported = true;
  console.error(
    `[api-logger] structured logging unavailable: ${error instanceof Error ? error.message : 'unknown error'}`
  );
}

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
 * throws is swallowed, and reported once on stderr so the gap is visible. A
 * failed build is remembered and not retried per request (each attempt can
 * start a pino-pretty worker in development before pino throws).
 */
export function apiLog(
  level: 'info' | 'warn' | 'error',
  record: Record<string, unknown>,
  message: string
): void {
  if (loggerUnavailable) return;
  let logger: Logger;
  try {
    logger = getApiLogger();
  } catch (error) {
    loggerUnavailable = true;
    reportFailureOnce(error);
    return;
  }
  try {
    logger[level](record, message);
  } catch (error) {
    reportFailureOnce(error);
  }
}

/** Drop the cached logger and any remembered failure (tests only). */
export function resetApiLoggerForTests(): void {
  apiLogger = undefined;
  loggerUnavailable = false;
  failureReported = false;
}
