/**
 * OpenTelemetry bootstrap — must be the FIRST import of main.ts.
 *
 * Auto-instrumentation patches modules (http, pg, ioredis, ...) as they are
 * required. Starting the SDK after the server, Prisma and queue modules were
 * already loaded leaves them unpatched, so production would emit almost no
 * spans even with export enabled. Same pattern as apps/ai-worker/src/index.ts.
 */
import { startTracing } from './tracing/otel';

if (process.env.OTEL_ENABLED !== 'false') {
  startTracing();
}
