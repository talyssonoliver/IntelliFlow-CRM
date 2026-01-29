/**
 * Correlation ID Utilities
 *
 * Provides request correlation IDs for distributed tracing across services.
 *
 * Features:
 * - Generate unique request IDs
 * - Extract correlation IDs from headers
 * - Propagate IDs across service boundaries
 * - Store IDs in async context (AsyncLocalStorage)
 *
 * Headers:
 * - X-Request-ID: Client-provided request ID
 * - X-Correlation-ID: Server-generated correlation ID
 *
 * @see https://www.rapid7.com/blog/post/2016/12/23/the-value-of-correlation-ids/
 */

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request context stored in AsyncLocalStorage
 */
interface RequestContext {
  correlationId: string;
  requestId?: string;
  userId?: string;
  startTime: number;
}

/**
 * AsyncLocalStorage for request context
 *
 * Allows accessing correlation ID from anywhere in the request lifecycle
 * without explicitly passing it through function parameters.
 */
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new correlation ID
 *
 * Uses crypto.randomUUID() for RFC 4122 compliant UUIDs.
 *
 * @returns New correlation ID (UUID v4)
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Extract request ID from headers
 *
 * Checks common header names used by load balancers and proxies:
 * - X-Request-ID (standard)
 * - X-Request-Id (lowercase variant)
 * - X-Amzn-Trace-Id (AWS)
 * - X-Cloud-Trace-Context (GCP)
 *
 * @param headers - Request headers
 * @returns Request ID or undefined
 */
export function extractRequestId(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const headerNames = ['x-request-id', 'x-request-Id', 'x-amzn-trace-id', 'x-cloud-trace-context'];

  for (const headerName of headerNames) {
    const value = headers[headerName] ?? headers[headerName.toLowerCase()];
    if (value) {
      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

/**
 * Initialize request context
 *
 * Creates a new request context with correlation ID and stores it in AsyncLocalStorage.
 * Call this at the beginning of each request.
 *
 * @param headers - Request headers
 * @param userId - Optional user ID
 * @returns Request context
 */
export function initializeRequestContext(
  headers: Record<string, string | string[] | undefined>,
  userId?: string
): RequestContext {
  const correlationId = generateCorrelationId();
  const requestId = extractRequestId(headers);

  const context: RequestContext = {
    correlationId,
    requestId,
    userId,
    startTime: Date.now(),
  };

  return context;
}

/**
 * Run code with request context
 *
 * Executes the provided function with the request context stored in AsyncLocalStorage.
 * This allows accessing the context from anywhere in the call stack.
 *
 * @param context - Request context
 * @param fn - Function to execute
 * @returns Result of the function
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get current request context
 *
 * Retrieves the request context from AsyncLocalStorage.
 * Returns undefined if called outside of a request context.
 *
 * @returns Request context or undefined
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get current correlation ID
 *
 * Convenience method to get just the correlation ID.
 *
 * @returns Correlation ID or undefined
 */
export function getCorrelationId(): string | undefined {
  return getRequestContext()?.correlationId;
}

/**
 * Get current request ID
 *
 * @returns Request ID or undefined
 */
export function getRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}

/**
 * Get current user ID
 *
 * @returns User ID or undefined
 */
export function getUserId(): string | undefined {
  return getRequestContext()?.userId;
}

/**
 * Get request duration in milliseconds
 *
 * @returns Duration since request start or undefined
 */
export function getRequestDuration(): number | undefined {
  const context = getRequestContext();
  return context ? Date.now() - context.startTime : undefined;
}

/**
 * Create correlation ID header object
 *
 * Returns headers to propagate correlation IDs to downstream services.
 *
 * @returns Headers object
 */
export function createCorrelationHeaders(): Record<string, string> {
  const context = getRequestContext();

  if (!context) {
    return {};
  }

  const headers: Record<string, string> = {
    'X-Correlation-ID': context.correlationId,
  };

  if (context.requestId) {
    headers['X-Request-ID'] = context.requestId;
  }

  return headers;
}

/**
 * Enhanced console.log that includes correlation ID
 *
 * Use this instead of console.log for request-scoped logging.
 *
 * @param message - Log message
 * @param data - Additional data to log
 */
export function logWithCorrelation(message: string, data?: unknown): void {
  const context = getRequestContext();
  const correlationId = context?.correlationId ?? 'no-context';
  const duration = context ? getRequestDuration() : undefined;

  const logData: Record<string, unknown> = {
    correlationId,
    message,
  };

  if (context?.requestId) {
    logData.requestId = context.requestId;
  }
  if (context?.userId) {
    logData.userId = context.userId;
  }
  if (duration !== undefined) {
    logData.durationMs = duration;
  }
  if (data) {
    logData.data = data;
  }

  console.log(JSON.stringify(logData));
}
