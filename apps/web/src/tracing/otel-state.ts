/**
 * Whether our OpenTelemetry NodeSDK is running in this process (IFC-319).
 *
 * `startTracing()` in ./otel sets it; `sentry.server.config` reads it to turn
 * off Sentry's own HTTP spans. Kept apart from ./otel so reading it does not
 * load the SDK (the same split as apps/api/src/tracing/otel-state.ts).
 */
let started = false;

export function setNodeSdkStarted(value: boolean): void {
  started = value;
}

export function isNodeSdkStarted(): boolean {
  return started;
}
