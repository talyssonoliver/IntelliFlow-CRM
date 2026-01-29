/**
 * Tracing and Observability Module
 *
 * Exports all observability utilities for IntelliFlow CRM API.
 *
 * Components:
 * - OpenTelemetry: Distributed tracing and metrics
 * - Sentry: Error tracking and monitoring
 * - Correlation IDs: Request tracking across services
 * - tRPC Middleware: Automatic tracing for API procedures
 *
 * Usage:
 *   import { startTracing, initializeSentry } from './tracing';
 *
 *   // At application startup
 *   startTracing();
 *   initializeSentry();
 *
 * @see IFC-074: Full Stack Observability
 */

// OpenTelemetry
export {
  startTracing,
  initializeOpenTelemetry,
  shutdownOpenTelemetry,
  getSDKInstance,
} from './otel';

// Sentry
export {
  initializeSentry,
  captureException,
  captureMessage,
  startSpan,
  setUser,
  setTag,
  setContext,
  flushSentry,
  closeSentry,
} from './sentry';

// Correlation IDs
export {
  generateCorrelationId,
  extractRequestId,
  initializeRequestContext,
  runWithContext,
  getRequestContext,
  getCorrelationId,
  getRequestId,
  getUserId,
  getRequestDuration,
  createCorrelationHeaders,
  logWithCorrelation,
} from './correlation';

// tRPC Middleware
export {
  tracingMiddleware,
  metricsMiddleware,
  tracedPublicProcedure,
  tracedProtectedProcedure,
} from './middleware';
