/**
 * Logging Middleware
 *
 * Logs all tRPC requests and responses for debugging and monitoring.
 * Includes:
 * - Request timing
 * - Error tracking
 * - Performance metrics
 * - Structured logging with correlation IDs
 */

import { Context } from '../context';

/**
 * Middleware options type for logging middleware
 */
interface LoggingMiddlewareOpts<TContext> {
  ctx: TContext;
  path: string;
  type: string;
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
  rawInput?: unknown;
}

/**
 * Generate a unique correlation ID for request tracing
 * NOSONAR: Math.random() is safe here - correlation IDs are for logging/debugging only,
 * not for security purposes. They just need reasonable uniqueness, not cryptographic security.
 */
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`; // NOSONAR
}

/**
 * Creates middleware for request/response logging
 * Use with t.middleware() in server.ts
 */
export function createLoggingMiddleware() {
  return async ({ ctx, path, type, next }: LoggingMiddlewareOpts<Context>) => {
    const correlationId = generateCorrelationId();
    const startTime = Date.now();

    // Log request
    console.log({
      correlationId,
      type: 'request',
      method: type,
      path,
      userId: ctx.user?.userId,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await next({
        ctx: {
          ...ctx,
          correlationId,
        },
      });

      // Log successful response
      const duration = Date.now() - startTime;
      console.log({
        correlationId,
        type: 'response',
        method: type,
        path,
        duration,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      // Log error
      const duration = Date.now() - startTime;
      console.error({
        correlationId,
        type: 'error',
        method: type,
        path,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  };
}

/**
 * Creates performance monitoring middleware
 * Logs slow requests for optimization
 * Use with t.middleware() in server.ts
 */
export function createPerformanceMiddleware(thresholdMs = 1000) {
  return async ({ ctx, path, type, next }: LoggingMiddlewareOpts<Context>) => {
    const startTime = Date.now();

    const result = await next();

    const duration = Date.now() - startTime;

    // Log slow requests
    if (duration > thresholdMs) {
      console.warn({
        type: 'slow_request',
        method: type,
        path,
        duration,
        threshold: thresholdMs,
        userId: ctx.user?.userId,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  };
}

/**
 * Creates error tracking middleware
 * Sends errors to monitoring service (e.g., Sentry)
 * Use with t.middleware() in server.ts
 */
export function createErrorTrackingMiddleware() {
  return async ({ ctx, path, type, next }: LoggingMiddlewareOpts<Context>) => {
    try {
      return await next();
    } catch (error) {
      // TODO: Send to error tracking service (Sentry, etc.)
      console.error({
        type: 'unhandled_error',
        method: type,
        path,
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
        userId: ctx.user?.userId,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  };
}
