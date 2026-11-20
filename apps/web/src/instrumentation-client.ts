// First, before anything that builds a zod schema: stops zod's `new Function` probe, which a
// Content-Security-Policy without unsafe-eval reports on every page load.
import './lib/security/zod-jitless';
import * as Sentry from '@sentry/nextjs';
import { initSentry } from './lib/sentry/init';

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced
// literally here rather than read through a dynamic lookup.
initSentry({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  runtime: 'browser',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
