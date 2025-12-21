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
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { captureException, setUser, setTag } from './sentry';
import type { Context } from '../context';

// Initialize tRPC for middleware
const t = initTRPC.context<Context>().create();

/**
 * Tracer for creating spans
 */
const tracer = trace.getTracer('intelliflow-api', '0.1.0');

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
  // Initialize request context with correlation ID
  const requestContext = initializeRequestContext({}, ctx.user?.userId);

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

          // Execute procedure
          const result = await next();

          // Calculate duration
          const duration = Date.now() - startTime;

          // Record success
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('duration.ms', duration);
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
 * Create traced procedure builders
 *
 * These can be imported and used instead of the default procedure builders
 * to automatically add tracing to all procedures.
 */
import { publicProcedure, protectedProcedure } from '../trpc';

export const tracedPublicProcedure = publicProcedure.use(tracingMiddleware);
export const tracedProtectedProcedure = protectedProcedure.use(tracingMiddleware);
