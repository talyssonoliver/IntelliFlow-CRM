/**
 * Next.js Instrumentation Hook
 *
 * Automatically loaded by Next.js 16 before the application starts.
 * Only runs on the Node.js runtime (not on Edge runtime or in the browser).
 *
 * Initialises the OpenTelemetry NodeSDK and Sentry (errors only).
 *
 * With an OTLP endpoint (OTEL_EXPORTER_OTLP_ENDPOINT) the NodeSDK starts FIRST,
 * so it owns the global tracer provider and exports to Grafana Cloud; Sentry
 * then initialises with its HTTP integration's spans off, keeping error
 * capture, request isolation and breadcrumbs (the api runs the same way,
 * #1098; owner ruling 2026-11-12: web telemetry goes to Grafana as well as
 * Sentry, IFC-319). With a DSN and no endpoint, Sentry runs alone as before;
 * with neither, tracing starts exactly as before.
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
    const otlpEndpoint = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim());
    if (otlpEndpoint || !isServerSentryEnabled()) {
      const { startTracing } = await import('./tracing/otel');
      startTracing();
    }
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
