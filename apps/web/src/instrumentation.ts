/**
 * Next.js Instrumentation Hook
 *
 * Automatically loaded by Next.js 16 before the application starts.
 * Only runs on the Node.js runtime (not on Edge runtime or in the browser).
 *
 * Initialises Sentry (errors only) and the OpenTelemetry NodeSDK for
 * server-side tracing. Sentry v10 installs its own OpenTelemetry provider, and
 * two providers cannot both own the global tracer, so when `SENTRY_DSN` is set
 * Sentry owns the provider and the NodeSDK is not started. With no DSN the
 * behaviour is exactly as before.
 *
 * Client-side instrumentation (React Server Components spans, Web Vitals as
 * OTel metrics) is out of scope for sprint 18 — requires frontend team sign-off.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry
 */

import * as Sentry from '@sentry/nextjs';
import { isServerSentryEnabled } from './lib/sentry/init';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    if (isServerSentryEnabled()) {
      if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
        console.warn(
          '[OpenTelemetry] SENTRY_DSN is set; Sentry owns the tracer provider, so the OTLP NodeSDK is not started.'
        );
      }
      return;
    }
    const { startTracing } = await import('./tracing/otel');
    startTracing();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
