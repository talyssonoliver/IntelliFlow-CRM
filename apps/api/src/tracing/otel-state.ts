/**
 * Whether our OpenTelemetry NodeSDK is running in this process (#1098).
 *
 * otel.ts sets it once startTracing() has started the SDK; sentry.ts reads it
 * to decide who owns the HTTP server span. Kept apart from otel.ts so sentry.ts
 * can read it without loading the NodeSDK and its instrumentations.
 */
let nodeSdkStarted = false;

export function setNodeSdkStarted(started: boolean): void {
  nodeSdkStarted = started;
}

export function isNodeSdkStarted(): boolean {
  return nodeSdkStarted;
}
