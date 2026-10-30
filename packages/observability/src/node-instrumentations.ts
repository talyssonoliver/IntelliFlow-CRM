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

// /health, /api/health and their sub-paths, matched on the whole path so
// routes such as /healthcare or /api/healthz are still traced.
const HEALTH_PROBE_PATH = /^(?:\/api)?\/health(?:\/[^?#]*)?(?:[?#].*)?$/;

/**
 * #1098: health probes get no SERVER span. Our HTTP server span is named by
 * method only ("GET"), so the api SLOs' span_name health exclusion cannot
 * match it; without this, probes would count towards availability and latency.
 */
function isHealthProbe(req: { url?: string }): boolean {
  return HEALTH_PROBE_PATH.test(req.url ?? '');
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
      ignoreIncomingRequestHook: isHealthProbe,
    },
    '@opentelemetry/instrumentation-pino': {
      disableLogSending: false,
    },
  });
}
