import { Result, DomainError } from '@intelliflow/domain';
import { CalendarRateLimitError } from '@intelliflow/application';

/**
 * Retry Handler
 * Implements exponential backoff and rate limit handling for calendar API calls
 *
 * @see IFC-138: Error handling and retries
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrorCodes: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrorCodes: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'RATE_LIMIT_EXCEEDED',
  ],
};

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  startTime: Date;
  totalDelayMs: number;
}

/**
 * Retry Handler for calendar API operations
 */
export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: (context: RetryContext) => Promise<Result<T, DomainError>>,
    options?: {
      onRetry?: (context: RetryContext, error: DomainError) => void;
      shouldRetry?: (error: DomainError, context: RetryContext) => boolean;
    }
  ): Promise<Result<T, DomainError>> {
    const context: RetryContext = {
      attempt: 0,
      startTime: new Date(),
      totalDelayMs: 0,
    };

    let lastResult: Result<T, DomainError>;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      context.attempt = attempt;

      try {
        lastResult = await operation(context);

        if (lastResult.isSuccess) {
          return lastResult;
        }

        const error = lastResult.error;

        // Check if we should retry
        const shouldRetry = options?.shouldRetry
          ? options.shouldRetry(error, context)
          : this.isRetryable(error);

        if (!shouldRetry || attempt === this.config.maxRetries) {
          return lastResult;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, error);
        context.totalDelayMs += delay;

        // Notify retry callback
        options?.onRetry?.(context, error);

        // Wait before retry
        await this.sleep(delay);
      } catch (unexpectedError) {
        // Handle unexpected errors (not Result failures)
        const error =
          unexpectedError instanceof Error ? unexpectedError : new Error(String(unexpectedError));

        context.lastError = error;

        if (attempt === this.config.maxRetries) {
          return Result.fail(new UnexpectedCalendarError(error.message));
        }

        const delay = this.calculateDelay(attempt);
        context.totalDelayMs += delay;
        await this.sleep(delay);
      }
    }

    // Should not reach here, but return last result as safety
    return lastResult!;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: DomainError): boolean {
    // Always retry rate limit errors
    if (error instanceof CalendarRateLimitError) {
      return true;
    }

    // Check error code
    if ('code' in error) {
      const code = (error as { code: string }).code;
      if (this.config.retryableErrorCodes.includes(code)) {
        return true;
      }
    }

    // Check HTTP status if available
    if ('statusCode' in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      if (this.config.retryableStatusCodes.includes(statusCode)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  calculateDelay(attempt: number, error?: DomainError): number {
    // If rate limited, use the retry-after hint
    if (error instanceof CalendarRateLimitError) {
      return Math.min(error.retryAfterSeconds * 1000, this.config.maxDelayMs);
    }

    // Exponential backoff with jitter
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);

    // Add random jitter (0-25% of base delay)
    const jitter = baseDelay * Math.random() * 0.25;

    return Math.min(baseDelay + jitter, this.config.maxDelayMs);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Unexpected calendar error (for wrapping non-domain errors)
 */
class UnexpectedCalendarError extends DomainError {
  readonly code = 'CALENDAR_UNEXPECTED_ERROR';
  constructor(message: string) {
    super(`Unexpected calendar error: ${message}`);
  }
}

/**
 * Rate limiter for calendar API calls
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private requests: number[] = [];

  constructor(options: { windowMs?: number; maxRequests?: number } = {}) {
    this.windowMs = options.windowMs ?? 60000; // 1 minute default
    this.maxRequests = options.maxRequests ?? 100; // 100 requests per window
  }

  /**
   * Check if request is allowed
   */
  canMakeRequest(): boolean {
    this.cleanup();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * Get time until next request is allowed (in ms)
   */
  getTimeUntilAllowed(): number {
    if (this.canMakeRequest()) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    const expiresAt = oldestRequest + this.windowMs;
    return Math.max(0, expiresAt - Date.now());
  }

  /**
   * Cleanup expired requests
   */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter((ts) => ts > cutoff);
  }

  /**
   * Reset limiter (for testing)
   */
  reset(): void {
    this.requests = [];
  }
}
