/**
 * Retry Policy Implementation
 *
 * Implements retry policies with exponential backoff and jitter for external service calls.
 * Designed to work with circuit breaker for comprehensive fault tolerance.
 *
 * @module apps/api/src/shared/retry-policy
 * @see IFC-122: Circuit breaker and retry policies for external service calls
 */

import { z } from 'zod';

/**
 * Retry policy configuration schema
 */
export const retryPolicyConfigSchema = z.object({
  /** Maximum number of retry attempts (not including initial attempt) */
  maxRetries: z.number().min(0).default(3),
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: z.number().min(0).default(1000),
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: z.number().min(0).default(30000),
  /** Multiplier for exponential backoff */
  backoffMultiplier: z.number().min(1).default(2),
  /** Jitter factor (0-1) to add randomness to delays */
  jitterFactor: z.number().min(0).max(1).default(0.25),
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes: z.array(z.number()).default([408, 429, 500, 502, 503, 504]),
  /** Error codes that should trigger a retry */
  retryableErrorCodes: z
    .array(z.string())
    .default(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE']),
  /** Whether to retry on timeout errors */
  retryOnTimeout: z.boolean().default(true),
  /** Timeout in milliseconds for each attempt (0 = no timeout) */
  attemptTimeoutMs: z.number().min(0).default(0),
});

export type RetryPolicyConfig = z.infer<typeof retryPolicyConfigSchema>;

/**
 * Default retry policy configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryPolicyConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.25,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrorCodes: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE'],
  retryOnTimeout: true,
  attemptTimeoutMs: 0,
};

/**
 * Context provided to retry callbacks
 */
export interface RetryContext {
  attempt: number;
  maxRetries: number;
  totalElapsedMs: number;
  lastError: Error | null;
  nextDelayMs: number;
}

/**
 * Retry policy event types
 */
export type RetryEvent =
  | { type: 'attempt_start'; context: RetryContext; timestamp: number }
  | { type: 'attempt_success'; context: RetryContext; duration: number; timestamp: number }
  | { type: 'attempt_failure'; context: RetryContext; error: Error; timestamp: number }
  | { type: 'retry_scheduled'; context: RetryContext; delayMs: number; timestamp: number }
  | { type: 'max_retries_exceeded'; context: RetryContext; timestamp: number };

/**
 * Retry event listener type
 */
export type RetryEventListener = (event: RetryEvent) => void;

/**
 * Retryable error base class
 */
export class RetryableError extends Error {
  readonly isRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends RetryableError {
  readonly retryAfterMs: number;

  constructor(message = 'Rate limit exceeded', retryAfterMs = 0) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends RetryableError {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Network error
 */
export class NetworkError extends RetryableError {
  readonly code: string;

  constructor(message = 'Network error', code = 'NETWORK_ERROR') {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}

/**
 * Max retries exceeded error
 */
export class MaxRetriesExceededError extends Error {
  readonly attempts: number;
  readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`Max retries (${attempts}) exceeded. Last error: ${lastError.message}`);
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Check if an error is retryable based on configuration
 */
export function isRetryableError(error: Error, config: RetryPolicyConfig): boolean {
  // Explicit retryable errors
  if (error instanceof RetryableError) {
    return true;
  }

  // Check error code
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (config.retryableErrorCodes.includes(code)) {
      return true;
    }
  }

  // Check HTTP status
  if ('statusCode' in error && typeof (error as { statusCode: unknown }).statusCode === 'number') {
    const statusCode = (error as { statusCode: number }).statusCode;
    if (config.retryableStatusCodes.includes(statusCode)) {
      return true;
    }
  }

  if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
    const status = (error as { status: number }).status;
    if (config.retryableStatusCodes.includes(status)) {
      return true;
    }
  }

  // Check common retryable patterns in message
  const message = error.message.toLowerCase();
  if (
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('rate limit') ||
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoff(
  attempt: number,
  config: RetryPolicyConfig,
  rateLimitRetryAfterMs?: number
): number {
  // If rate limited with explicit retry-after, use that
  if (rateLimitRetryAfterMs && rateLimitRetryAfterMs > 0) {
    return Math.min(rateLimitRetryAfterMs, config.maxDelayMs);
  }

  // Exponential backoff
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Add jitter to prevent thundering herd
  // NOSONAR: Math.random() is safe here - not used for security/cryptography,
  // only for distributing retry timing to avoid synchronized retries
  const jitter = exponentialDelay * config.jitterFactor * Math.random(); // NOSONAR

  // Cap at max delay
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with timeout
 */
async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) {
    return fn();
  }

  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Retry policy options for execution
 */
export interface RetryOptions<T> {
  /** Function to determine if error is retryable (overrides default) */
  shouldRetry?: (error: Error, context: RetryContext) => boolean;
  /** Callback before each retry */
  onRetry?: (context: RetryContext, error: Error) => void;
  /** Fallback value or function if all retries fail */
  fallback?: T | ((error: Error) => T | Promise<T>);
  /** Event listener for retry events */
  onEvent?: RetryEventListener;
}

/**
 * Execute a function with retry policy
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => await fetchData(),
 *   { maxRetries: 3, initialDelayMs: 1000 },
 *   { onRetry: (ctx, err) => console.log(`Retry ${ctx.attempt}: ${err.message}`) }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryPolicyConfig> = {},
  options: RetryOptions<T> = {}
): Promise<T> {
  const parsedConfig = retryPolicyConfigSchema.parse({
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  });

  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= parsedConfig.maxRetries; attempt++) {
    const context: RetryContext = {
      attempt,
      maxRetries: parsedConfig.maxRetries,
      totalElapsedMs: Date.now() - startTime,
      lastError,
      nextDelayMs: attempt < parsedConfig.maxRetries ? calculateBackoff(attempt, parsedConfig) : 0,
    };

    options.onEvent?.({
      type: 'attempt_start',
      context,
      timestamp: Date.now(),
    });

    const attemptStart = Date.now();

    try {
      const result = await withTimeout(fn, parsedConfig.attemptTimeoutMs);

      options.onEvent?.({
        type: 'attempt_success',
        context,
        duration: Date.now() - attemptStart,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      options.onEvent?.({
        type: 'attempt_failure',
        context: { ...context, lastError },
        error: lastError,
        timestamp: Date.now(),
      });

      // Check if we've exhausted retries
      if (attempt >= parsedConfig.maxRetries) {
        options.onEvent?.({
          type: 'max_retries_exceeded',
          context: { ...context, lastError },
          timestamp: Date.now(),
        });
        break;
      }

      // Check if error is retryable
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(lastError, context)
        : isRetryableError(lastError, parsedConfig);

      if (!shouldRetry) {
        break;
      }

      // Calculate delay
      const rateLimitDelay =
        lastError instanceof RateLimitError ? lastError.retryAfterMs : undefined;
      const delayMs = calculateBackoff(attempt, parsedConfig, rateLimitDelay);

      options.onEvent?.({
        type: 'retry_scheduled',
        context: { ...context, nextDelayMs: delayMs },
        delayMs,
        timestamp: Date.now(),
      });

      // Call onRetry callback
      options.onRetry?.({ ...context, nextDelayMs: delayMs }, lastError);

      // Wait before retry
      await sleep(delayMs);
    }
  }

  // All retries exhausted or non-retryable error
  if (options.fallback !== undefined) {
    if (typeof options.fallback === 'function') {
      return (options.fallback as (error: Error) => T | Promise<T>)(lastError!);
    }
    return options.fallback;
  }

  throw new MaxRetriesExceededError(parsedConfig.maxRetries + 1, lastError!);
}

/**
 * Retry policy class for reusable retry behavior
 */
export class RetryPolicy {
  private readonly config: RetryPolicyConfig;
  private readonly listeners: Set<RetryEventListener> = new Set();

  constructor(config: Partial<RetryPolicyConfig> = {}) {
    this.config = retryPolicyConfigSchema.parse({
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    });
  }

  /**
   * Execute a function with this retry policy
   */
  async execute<T>(fn: () => Promise<T>, options: RetryOptions<T> = {}): Promise<T> {
    return withRetry(fn, this.config, {
      ...options,
      onEvent: (event) => {
        options.onEvent?.(event);
        this.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch {
            // Ignore listener errors
          }
        });
      },
    });
  }

  /**
   * Subscribe to retry events
   */
  subscribe(listener: RetryEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get the configuration
   */
  getConfig(): Readonly<RetryPolicyConfig> {
    return { ...this.config };
  }
}

/**
 * Create a retry policy with the given configuration
 */
export function createRetryPolicy(config: Partial<RetryPolicyConfig> = {}): RetryPolicy {
  return new RetryPolicy(config);
}

/**
 * Decorator for adding retry behavior to async methods
 */
export function Retry(config: Partial<RetryPolicyConfig> = {}) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}

/**
 * Combine retry policy with circuit breaker for comprehensive fault tolerance
 */
export interface ResilientCallOptions<T> extends RetryOptions<T> {
  retryConfig?: Partial<RetryPolicyConfig>;
}

/**
 * Pre-configured retry policies for common use cases
 */
export const RetryPolicies = {
  /** Aggressive retry for critical operations */
  aggressive: createRetryPolicy({
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 1.5,
  }),

  /** Conservative retry for non-critical operations */
  conservative: createRetryPolicy({
    maxRetries: 2,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  }),

  /** No retry - fail immediately */
  noRetry: createRetryPolicy({
    maxRetries: 0,
  }),

  /** Default retry policy */
  default: createRetryPolicy(),
};
