/**
 * tRPC Tracing Middleware
 *
 * Provides observability for tRPC procedures:
 * - Correlation IDs for request tracking
 * - OpenTelemetry spans for distributed tracing
 * - Performance metrics (latency, throughput)
 * - Error tracking with Sentry
 *
 * Usage:
 *   export const tracedProcedure = publicProcedure.use(tracingMiddleware);
 *
 * @see https://trpc.io/docs/server/middlewares
 */

import { TRPCError, initTRPC } from '@trpc/server';
import { initializeRequestContext, runWithContext, getCorrelationId } from './correlation';
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import { captureException, setUser, setTag, setContext } from './sentry';
import { runWithQueryBudget, budgetForRoute, getQueryBudgetSnapshot } from '@intelliflow/db';
import type { Context } from '../context';

// Initialize tRPC for middleware
const t = initTRPC.context<Context>().create();

/**
 * Tracer for creating spans
 */
const tracer = trace.getTracer('intelliflow-api', '0.1.0');

/**
 * ADR-053: surface the request's query-budget snapshot onto the active span so
 * N+1 / over-budget requests are visible in distributed traces, not just the
 * warn-only structured log emitter. Extracted from the middleware body to keep
 * the middleware's cognitive complexity within the sonar budget.
 */
function applyQueryBudgetToSpan(
  span: Span,
  snapshot: NonNullable<ReturnType<typeof getQueryBudgetSnapshot>>
): void {
  span.setAttribute('db.query.count', snapshot.count);
  span.setAttribute('db.query.budget', snapshot.budget);
  span.setAttribute('db.query.over_budget', snapshot.exceeded);
  if (snapshot.repeated.length > 0) {
    span.setAttribute(
      'db.query.repeated_fingerprints',
      snapshot.repeated.map((r) => `${r.fingerprint}x${r.count}`).join('; ')
    );
  }
}

/**
 * Tracing middleware for tRPC procedures
 *
 * Features:
 * - Creates OpenTelemetry span for each procedure call
 * - Initializes correlation ID context
 * - Tracks performance metrics
 * - Captures errors to Sentry
 * - Logs slow requests (>50ms)
 *
 * Applied to all procedures when used.
 */
export const tracingMiddleware = t.middleware(async ({ path, type, next, ctx }) => {
  // Initialize request context with correlation ID. Forward the INCOMING request
  // headers so a boundary-provided `x-request-id` (set by apps/web/proxy.ts) is
  // adopted as the requestId instead of always minting a fresh one — this is the
  // id the ADR-053 query-budget events and cross-service traces correlate on.
  const reqHeaders = (ctx as { req?: { headers?: Headers } }).req?.headers;
  const incomingHeaders: Record<string, string> = {};
  if (reqHeaders && typeof reqHeaders.forEach === 'function') {
    reqHeaders.forEach((value, key) => {
      incomingHeaders[key.toLowerCase()] = value;
    });
  }
  const requestContext = initializeRequestContext(incomingHeaders, ctx.user?.userId);

  // Run procedure within correlation context
  return runWithContext(requestContext, async () => {
    const correlationId = getCorrelationId();
    const safeCorrelationId = correlationId ?? 'unknown';

    // Create OpenTelemetry span
    return tracer.startActiveSpan(
      `trpc.${type}.${path}`,
      {
        attributes: {
          'trpc.path': path,
          'trpc.type': type,
          'correlation.id': safeCorrelationId,
          ...(ctx.user?.userId && { 'user.id': ctx.user.userId }),
        },
      },
      async (span) => {
        const startTime = Date.now();

        try {
          // Set Sentry context
          if (ctx.user) {
            setUser({
              id: ctx.user.userId,
              email: ctx.user.email,
            });
          }
          setTag('trpc.path', path);
          setTag('trpc.type', type);
          setTag('correlation.id', safeCorrelationId);
          setContext('request', {
            path,
            type,
            correlationId: safeCorrelationId,
            tenantId: ctx.user?.tenantId,
          });

          // Execute procedure within the ADR-053 query-budget context so the
          // Prisma extension counts this request's queries. AsyncLocalStorage
          // propagates through the awaited resolver continuations where Prisma
          // runs. Observe/report-only in prod; throws only in test mode.
          const route = `trpc.${type}.${path}`;
          let budgetSnapshot: ReturnType<typeof getQueryBudgetSnapshot>;
          const result = await runWithQueryBudget(
            {
              requestId: requestContext.requestId ?? safeCorrelationId,
              route,
              method: type,
              context: 'request',
              budget: budgetForRoute(route),
            },
            async () => {
              const r = await next();
              // Snapshot WHILE the budget ALS context is still active.
              budgetSnapshot = getQueryBudgetSnapshot();
              return r;
            }
          );

          // Calculate duration
          const duration = Date.now() - startTime;

          // Record success
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('duration.ms', duration);

          // ADR-053: surface the request's query-budget snapshot onto the span
          // (correlated by requestId) so over-budget requests are visible in
          // distributed traces.
          if (budgetSnapshot) {
            applyQueryBudgetToSpan(span, budgetSnapshot);
          }
          span.end();

          // Log slow requests
          if (duration > 50) {
            console.warn(
              `[Tracing] SLOW REQUEST: ${type} ${path} took ${duration}ms (target: <50ms)`,
              { correlationId }
            );
          }

          // Log successful request
          console.log(
            JSON.stringify({
              type: 'trpc.request',
              correlationId,
              path,
              method: type,
              durationMs: duration,
              status: 'success',
            })
          );

          return result;
        } catch (error) {
          // Calculate duration
          const duration = Date.now() - startTime;

          // Record error in span
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          span.recordException(error as Error);
          span.setAttribute('duration.ms', duration);
          span.end();

          // Capture to Sentry
          if (error instanceof Error) {
            captureException(error, {
              user: ctx.user ? { id: ctx.user.userId, email: ctx.user.email } : undefined,
              tags: {
                'trpc.path': path,
                'trpc.type': type,
                'correlation.id': safeCorrelationId,
              },
              extra: {
                duration,
              },
            });
          }

          // Log error
          console.error(
            JSON.stringify({
              type: 'trpc.error',
              correlationId,
              path,
              method: type,
              durationMs: duration,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
              ...(error instanceof TRPCError && { code: error.code }),
            })
          );

          // Re-throw error
          throw error;
        }
      }
    );
  });
});

/**
 * Performance monitoring middleware
 *
 * Lighter-weight alternative to tracingMiddleware that only tracks metrics
 * without creating full traces. Use when you need metrics but not spans.
 */
export const metricsMiddleware = t.middleware(async ({ path, type, next }) => {
  const startTime = Date.now();

  try {
    const result = await next();
    const duration = Date.now() - startTime;

    // Log metrics
    console.log(
      JSON.stringify({
        type: 'trpc.metrics',
        path,
        method: type,
        durationMs: duration,
        status: 'success',
      })
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error metrics
    console.error(
      JSON.stringify({
        type: 'trpc.metrics',
        path,
        method: type,
        durationMs: duration,
        status: 'error',
      })
    );

    throw error;
  }
});

/**
 * Traced procedure builders
 *
 * @deprecated Tracing is now applied globally to all procedures in trpc.ts.
 * Use publicProcedure and protectedProcedure directly instead.
 *
 * These are kept as lazy re-exports for backward compatibility.
 */
export const tracedPublicProcedure = t.procedure.use(tracingMiddleware);
export const tracedProtectedProcedure = t.procedure.use(tracingMiddleware);
