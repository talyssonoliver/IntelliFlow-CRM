import * as Sentry from '@sentry/nextjs';
import { initSentry } from './lib/sentry/init';
import { isNodeSdkStarted } from './tracing/otel-state';

initSentry({
  dsn: process.env.SENTRY_DSN,
  runtime: 'nodejs',
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  // instrumentation.ts starts the NodeSDK first when an OTLP endpoint is set; it
  // already traces every request, so Sentry's HTTP integration adds no span.
  integrations: isNodeSdkStarted() ? [Sentry.httpIntegration({ spans: false })] : undefined,
});
