import { Result, DomainError } from '@intelliflow/domain';
import { RateLimitError } from '../errors/RateLimitError';
import { UnexpectedAdapterError } from '../errors/AdapterError';

/**
 * Retry Handler
 * Implements exponential backoff and rate limit handling for adapter API calls
 *
 * Extracted from calendar/shared/RetryHandler.ts and generalized for all adapters
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
 * Generic Retry Handler for adapter API operations
 */
export class RetryHandler {
  private config: RetryConfig;
  private provider: string;

  constructor(provider: string, config: Partial<RetryConfig> = {}) {
    this.provider = provider;
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
          unexpectedError instanceof Error
            ? unexpectedError
            : new Error(String(unexpectedError));

        context.lastError = error;

        if (attempt === this.config.maxRetries) {
          return Result.fail(
            new UnexpectedAdapterError(error.message, this.provider)
          );
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
    // Always retry rate limit errors (common RateLimitError)
    if (error instanceof RateLimitError) {
      return true;
    }

    // Check for retryAfterSeconds property (backward compat with existing rate limit errors)
    if ('retryAfterSeconds' in error) {
      return true;
    }

    // Check error code
    if ('code' in error) {
      const code = (error as { code: string }).code;
      if (this.config.retryableErrorCodes.includes(code)) {
        return true;
      }
      // Also check for rate limit codes
      if (code.includes('RATE_LIMIT')) {
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
    if (error instanceof RateLimitError) {
      return Math.min(error.getRetryDelayMs(), this.config.maxDelayMs);
    }

    // Check for retryAfterSeconds property (backward compat with existing errors)
    if (error && 'retryAfterSeconds' in error) {
      const retryAfter = (error as { retryAfterSeconds: number }).retryAfterSeconds;
      return Math.min(retryAfter * 1000, this.config.maxDelayMs);
    }

    // Exponential backoff with jitter
    const baseDelay =
      this.config.initialDelayMs *
      Math.pow(this.config.backoffMultiplier, attempt);

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
