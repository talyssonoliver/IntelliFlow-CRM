/**
 * Standard Node auto-instrumentation set, shared by every service that runs
 * the OpenTelemetry NodeSDK directly (apps/api, apps/ai-worker — see their
 * src/tracing/otel.ts). Centralised here so this config exists in exactly one
 * place instead of being copy-pasted into each service's otel.ts.
 *
 * #809 (IFC-032 follow-up): forward pino log records to the OTel Logs SDK so
 * they reach the same OTLP gateway as traces/metrics, with trace_id/span_id
 * already attached for Grafana's "Logs for this trace". disableLogSending:
 * false is this instrumentation's own default — spelled out here so the
 * decision is visible and tested rather than depending on the
 * auto-instrumentations-node bundle's implicit default. Log correlation
 * (trace_id/span_id/trace_flags) is left at its default too: it composes with
 * an existing pino `mixin` option (this package's own `logging.ts` mixin, or
 * a caller's) instead of overwriting it, so the two cannot conflict.
 *
 * Import this via the `@intelliflow/observability/node-instrumentations`
 * subpath, NOT the package root: the root barrel loads logging.ts (and so
 * `pino`) eagerly, which would load pino before the pino instrumentation is
 * registered and leave the shared loggers unpatched.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/**
 * Incoming request paths whose URL itself is a credential (PG-208: the
 * task-automation webhook token is a path segment). Such requests get no HTTP
 * span, so the token never reaches the trace backend. apps/api's Sentry setup
 * applies the same rule (`apps/api/src/tracing/sentry.ts`).
 */
export const SECRET_BEARING_PATH_MARKERS: readonly string[] = ['/webhooks/task-automation/'];

export function isSecretBearingPath(url: string | undefined): boolean {
  return url !== undefined && SECRET_BEARING_PATH_MARKERS.some((marker) => url.includes(marker));
}

/**
 * Build the Node auto-instrumentations array for a service's NodeSDK.
 *
 * @returns the value to spread/assign into `new NodeSDK({ instrumentations })`
 */
export function getStandardNodeInstrumentations(): ReturnType<typeof getNodeAutoInstrumentations> {
  return getNodeAutoInstrumentations({
    // Disable filesystem instrumentation — too noisy
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-http': {
      enabled: true,
      ignoreIncomingRequestHook: (request) => isSecretBearingPath(request.url),
    },
    '@opentelemetry/instrumentation-pino': {
      disableLogSending: false,
    },
  });
}
