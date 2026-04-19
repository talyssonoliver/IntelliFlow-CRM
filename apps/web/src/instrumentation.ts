/**
 * Next.js Instrumentation Hook
 *
 * Automatically loaded by Next.js 16 before the application starts.
 * Only runs on the Node.js runtime (not on Edge runtime or in the browser).
 *
 * Initialises the OpenTelemetry NodeSDK for server-side tracing.
 * Client-side instrumentation (React Server Components spans, Web Vitals as
 * OTel metrics) is out of scope for sprint 18 — requires frontend team sign-off.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTracing } = await import('./tracing/otel.js');
    startTracing();
  }
}
