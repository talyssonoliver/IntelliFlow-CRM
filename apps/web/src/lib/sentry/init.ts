/**
 * Shared Sentry initialisation for the browser, Node.js and Edge runtimes.
 *
 * The DSN comes from the environment only (`NEXT_PUBLIC_SENTRY_DSN` for the
 * browser, `SENTRY_DSN` for server and edge). With no DSN this is a no-op, so
 * local, test and CI runs never initialise or contact Sentry.
 *
 * Error tracking only: no `tracesSampleRate` (tracing off) and no replay, so
 * no session content leaves the browser. `sendDefaultPii` is off and every
 * event passes through `scrubEvent`.
 */
import * as Sentry from '@sentry/nextjs';
import { filterBreadcrumb, scrubEvent } from './scrub';

export type SentryRuntime = 'browser' | 'nodejs' | 'edge';

export interface InitSentryInput {
  readonly dsn: string | undefined;
  readonly runtime: SentryRuntime;
  readonly environment?: string | undefined;
  readonly release?: string | undefined;
  /**
   * True when our OpenTelemetry NodeSDK is already running (OTLP export to
   * Grafana Cloud, IFC-319). It traces every request, so Sentry's HTTP
   * integration keeps request isolation and breadcrumbs but adds no second
   * server span (the api does the same, #1098). Node runtime only.
   */
  readonly nodeSdkStarted?: boolean;
}

/** Returns true when Sentry was initialised. */
export function initSentry({
  dsn,
  runtime,
  environment,
  release,
  nodeSdkStarted = false,
}: InitSentryInput): boolean {
  const trimmed = dsn?.trim();
  if (!trimmed) return false;

  Sentry.init({
    dsn: trimmed,
    environment: environment?.trim() || process.env.NODE_ENV,
    release: release?.trim() || undefined,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: filterBreadcrumb,
    initialScope: { tags: { runtime } },
    ...(nodeSdkStarted ? { integrations: [Sentry.httpIntegration({ spans: false })] } : {}),
  });
  return true;
}

/** True when the server-side DSN is configured (used to pick the OTel owner). */
export function isServerSentryEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return Boolean(env.SENTRY_DSN?.trim());
}
