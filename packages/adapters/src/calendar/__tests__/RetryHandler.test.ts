import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryHandler, RateLimiter, DEFAULT_RETRY_CONFIG } from '../shared/RetryHandler';
import { Result, DomainError } from '@intelliflow/domain';
import { CalendarRateLimitError } from '@intelliflow/application';

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    handler = new RetryHandler();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('executeWithRetry', () => {
    it('should return success on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue(Result.ok('success'));

      const result = await handler.executeWithRetry(operation);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = vi
        .fn()
        .mockResolvedValueOnce(
          Result.fail({ code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limited' } as DomainError)
        )
        .mockResolvedValueOnce(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation);

      // Advance timers to process retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isSuccess).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should stop retrying after max retries', async () => {
      const error = { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limited' } as DomainError;
      const operation = vi.fn().mockResolvedValue(Result.fail(error));

      const resultPromise = handler.executeWithRetry(operation);

      // Advance timers to process all retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(operation).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxRetries + 1);
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = { code: 'INVALID_INPUT', message: 'Bad request' } as DomainError;
      const operation = vi.fn().mockResolvedValue(Result.fail(nonRetryableError));

      const result = await handler.executeWithRetry(operation);

      expect(result.isFailure).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      let capturedAttempt = -1;
      const onRetry = vi.fn((context) => {
        capturedAttempt = context.attempt;
      });
      const operation = vi
        .fn()
        .mockResolvedValueOnce(
          Result.fail({ code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limited' } as DomainError)
        )
        .mockResolvedValue(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation, { onRetry });

      // Advance timers to process retry delays
      await vi.runAllTimersAsync();

      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(capturedAttempt).toBe(0);
      expect(onRetry).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' })
      );
    });

    it('should use custom shouldRetry function', async () => {
      const customError = { code: 'CUSTOM_ERROR', message: 'Custom' } as DomainError;
      const operation = vi
        .fn()
        .mockResolvedValueOnce(Result.fail(customError))
        .mockResolvedValue(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation, {
        shouldRetry: (error) => error.code === 'CUSTOM_ERROR',
      });

      // Advance timers to process retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isSuccess).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle thrown exceptions', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network error'));

      const resultPromise = handler.executeWithRetry(operation);

      // Advance timers to process all retry delays
      await vi.runAllTimersAsync();

      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Unexpected calendar error');
    });
  });

  describe('isRetryable', () => {
    it('should return true for rate limit errors', () => {
      const error = new CalendarRateLimitError('Rate limited', 30);

      expect(handler.isRetryable(error)).toBe(true);
    });

    it('should return true for retryable error codes', () => {
      for (const code of DEFAULT_RETRY_CONFIG.retryableErrorCodes) {
        const error = { code, message: 'Error' } as DomainError;
        expect(handler.isRetryable(error)).toBe(true);
      }
    });

    it('should return true for retryable status codes', () => {
      for (const statusCode of DEFAULT_RETRY_CONFIG.retryableStatusCodes) {
        const error = { statusCode, code: 'HTTP_ERROR', message: 'Error' } as DomainError & {
          statusCode: number;
        };
        expect(handler.isRetryable(error)).toBe(true);
      }
    });

    it('should return false for non-retryable errors', () => {
      const error = { code: 'INVALID_INPUT', message: 'Bad request' } as DomainError;

      expect(handler.isRetryable(error)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should use retry-after for rate limit errors', () => {
      const error = new CalendarRateLimitError('Rate limited', 30);

      const delay = handler.calculateDelay(0, error);

      expect(delay).toBe(30000);
    });

    it('should apply exponential backoff', () => {
      const delay0 = handler.calculateDelay(0);
      const delay1 = handler.calculateDelay(1);
      const delay2 = handler.calculateDelay(2);

      // Each delay should be roughly double the previous (plus jitter)
      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should not exceed max delay', () => {
      const delay = handler.calculateDelay(10);

      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canMakeRequest', () => {
    it('should allow requests under limit', () => {
      for (let i = 0; i < 4; i++) {
        limiter.recordRequest();
      }

      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should deny requests at limit', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }

      expect(limiter.canMakeRequest()).toBe(false);
    });

    it('should allow requests after window expires', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }
      expect(limiter.canMakeRequest()).toBe(false);

      // Advance time past window
      vi.advanceTimersByTime(61000);

      expect(limiter.canMakeRequest()).toBe(true);
    });
  });

  describe('recordRequest', () => {
    it('should record requests', () => {
      limiter.recordRequest();
      limiter.recordRequest();

      // After 2 requests, 3 more should be allowed
      expect(limiter.canMakeRequest()).toBe(true);
    });
  });

  describe('getTimeUntilAllowed', () => {
    it('should return 0 when under limit', () => {
      limiter.recordRequest();

      expect(limiter.getTimeUntilAllowed()).toBe(0);
    });

    it('should return time until window expires when at limit', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }

      const timeUntilAllowed = limiter.getTimeUntilAllowed();

      expect(timeUntilAllowed).toBeGreaterThan(0);
      expect(timeUntilAllowed).toBeLessThanOrEqual(60000);
    });
  });

  describe('reset', () => {
    it('should reset all recorded requests', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordRequest();
      }
      expect(limiter.canMakeRequest()).toBe(false);

      limiter.reset();

      expect(limiter.canMakeRequest()).toBe(true);
    });
  });
});
