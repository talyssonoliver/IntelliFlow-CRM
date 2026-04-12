import { AdapterError } from './AdapterError';

/**
 * Base rate limit error for all adapters
 * Provides standard retry-after handling
 */
export class RateLimitError extends AdapterError {
  readonly code: string;
  readonly retryAfterSeconds: number;
  readonly rateLimitType?: 'global' | 'endpoint' | 'user';

  constructor(
    code: string,
    retryAfterSeconds: number,
    provider: string,
    options?: {
      rateLimitType?: 'global' | 'endpoint' | 'user';
      requestId?: string;
    }
  ) {
    super(
      `Rate limited by ${provider}. Retry after ${retryAfterSeconds} seconds.`,
      provider,
      options?.requestId
    );
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.rateLimitType = options?.rateLimitType;
  }

  /**
   * Get retry delay in milliseconds
   */
  getRetryDelayMs(): number {
    return this.retryAfterSeconds * 1000;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfterSeconds: this.retryAfterSeconds,
      rateLimitType: this.rateLimitType,
    };
  }
}
