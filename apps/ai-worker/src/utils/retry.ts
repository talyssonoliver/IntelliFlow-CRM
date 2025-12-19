import { aiConfig } from '../config/ai.config';
import { createLogger } from './logger';

const logger = createLogger('retry');

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Default retry configuration from AI config
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: aiConfig.performance.retryAttempts,
  initialDelay: aiConfig.performance.retryDelay,
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

/**
 * Common retryable error types
 */
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class RateLimitError extends RetryableError {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class TimeoutError extends RetryableError {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends RetryableError {
  constructor(message = 'Network error') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, config: RetryConfig): boolean {
  // Check if error matches configured retryable errors
  if (config.retryableErrors) {
    return config.retryableErrors.some((ErrorClass) => error instanceof ErrorClass);
  }

  // Default retryable errors
  return (
    error instanceof RetryableError ||
    error instanceof RateLimitError ||
    error instanceof TimeoutError ||
    error instanceof NetworkError ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('Rate limit') ||
    error.message.includes('429')
  );
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const { initialDelay, maxDelay = 30000, backoffMultiplier = 2 } = config;

  const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);

  // Add jitter to prevent thundering herd
  // NOSONAR: Math.random() is safe here - not used for security/cryptography,
  // only for distributing retry timing to avoid synchronized retries
  const jitter = Math.random() * 0.1 * delay; // NOSONAR

  return Math.min(delay + jitter, maxDelay);
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      logger.debug({ attempt, maxAttempts: retryConfig.maxAttempts }, 'Attempting operation');

      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= retryConfig.maxAttempts) {
        logger.error({ attempt, error: lastError.message }, 'Max retry attempts reached');
        break;
      }

      if (!isRetryableError(lastError, retryConfig)) {
        logger.debug({ error: lastError.message }, 'Error is not retryable, throwing immediately');
        throw lastError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, retryConfig);

      logger.warn(
        {
          attempt,
          maxAttempts: retryConfig.maxAttempts,
          error: lastError.message,
          delay,
        },
        'Operation failed, retrying'
      );

      // Call onRetry callback if provided
      if (retryConfig.onRetry) {
        retryConfig.onRetry(lastError, attempt);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry decorator for methods
 */
export function Retry(config: Partial<RetryConfig> = {}) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), config);
    };

    return descriptor;
  };
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(timeoutMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Retry with timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  retryConfig: Partial<RetryConfig> = {},
  timeoutMs = 30000
): Promise<T> {
  return withRetry(() => withTimeout(fn, timeoutMs), retryConfig);
}

/**
 * Circuit breaker pattern for preventing cascading failures
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeout = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime > this.resetTimeout) {
      logger.info('Circuit breaker entering HALF_OPEN state');
      this.state = 'HALF_OPEN';
      this.failureCount = 0;
    }

    // Reject if circuit is open
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN - too many failures');
    }

    try {
      const result = await fn();

      // Reset on success
      if (this.state === 'HALF_OPEN') {
        logger.info('Circuit breaker reset to CLOSED state');
        this.state = 'CLOSED';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        logger.error(
          {
            failureCount: this.failureCount,
            threshold: this.failureThreshold,
          },
          'Circuit breaker opened due to too many failures'
        );
        this.state = 'OPEN';
      }

      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
