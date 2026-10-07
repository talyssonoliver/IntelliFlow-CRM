import { initSentry } from './lib/sentry/init';

initSentry({
  dsn: process.env.SENTRY_DSN,
  runtime: 'nodejs',
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
});
