/**
 * RetryHandler Tests
 * Tests for the generalized retry handler with exponential backoff
 *
 * @see IFC-138: Error handling and retries
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Result, DomainError } from '@intelliflow/domain';
import { RetryHandler, DEFAULT_RETRY_CONFIG } from '../RetryHandler';
import { RateLimitError } from '../../errors/RateLimitError';
import { UnexpectedAdapterError } from '../../errors/AdapterError';

// ==================== Helpers ====================

class TestDomainError extends DomainError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

class TestDomainErrorWithStatusCode extends DomainError {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number) {
    super(`HTTP ${statusCode} error`);
    this.code = code;
    this.statusCode = statusCode;
  }
}

class TestRateLimitErrorWithRetryAfter extends DomainError {
  readonly code: string;
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited, retry after ${retryAfterSeconds}s`);
    this.code = 'CUSTOM_RATE_LIMIT';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ==================== Tests ====================

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    handler = new RetryHandler('test-provider');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const h = new RetryHandler('test');
      expect(h).toBeInstanceOf(RetryHandler);
    });

    it('should merge partial config with defaults', () => {
      const h = new RetryHandler('test', { maxRetries: 5 });
      // Verify by checking behavior: 5 retries + 1 initial = 6 calls
      const operation = vi.fn().mockResolvedValue(
        Result.fail(new TestDomainError('RATE_LIMIT_EXCEEDED', 'rate limited'))
      );

      const resultPromise = h.executeWithRetry(operation);
      vi.runAllTimersAsync().then(() => {});

      return resultPromise.then(() => {
        expect(operation).toHaveBeenCalledTimes(6);
      });
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.retryableStatusCodes).toEqual([408, 429, 500, 502, 503, 504]);
      expect(DEFAULT_RETRY_CONFIG.retryableErrorCodes).toContain('ECONNRESET');
      expect(DEFAULT_RETRY_CONFIG.retryableErrorCodes).toContain('ETIMEDOUT');
      expect(DEFAULT_RETRY_CONFIG.retryableErrorCodes).toContain('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('executeWithRetry', () => {
    it('should return success on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue(Result.ok('success'));

      const result = await handler.executeWithRetry(operation);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should pass retry context to operation', async () => {
      const operation = vi.fn().mockResolvedValue(Result.ok('success'));

      await handler.executeWithRetry(operation);

      expect(operation).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 0,
          startTime: expect.any(Date),
          totalDelayMs: 0,
        })
      );
    });

    it('should retry on retryable Result failure and eventually succeed', async () => {
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      const operation = vi
        .fn()
        .mockResolvedValueOnce(Result.fail(error))
        .mockResolvedValueOnce(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should stop retrying after max retries', async () => {
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      const operation = vi.fn().mockResolvedValue(Result.fail(error));

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      // 1 initial attempt + 3 retries = 4 calls
      expect(operation).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxRetries + 1);
    });

    it('should not retry non-retryable Result errors', async () => {
      const error = new TestDomainError('INVALID_INPUT', 'Bad request');
      const operation = vi.fn().mockResolvedValue(Result.fail(error));

      const result = await handler.executeWithRetry(operation);

      expect(result.isFailure).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback on each retry', async () => {
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      const capturedAttempts: number[] = [];
      const onRetry = vi.fn((ctx) => {
        capturedAttempts.push(ctx.attempt);
      });
      const operation = vi
        .fn()
        .mockResolvedValueOnce(Result.fail(error))
        .mockResolvedValueOnce(Result.fail(error))
        .mockResolvedValueOnce(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation, { onRetry });
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      // onRetry is called with context and error
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: expect.any(Date) }),
        error
      );
      // Verify attempts were 0 and 1
      expect(capturedAttempts).toContain(0);
      expect(capturedAttempts).toContain(1);
    });

    it('should use custom shouldRetry function when provided', async () => {
      const customError = new TestDomainError('CUSTOM_ERROR', 'Custom');
      const operation = vi
        .fn()
        .mockResolvedValueOnce(Result.fail(customError))
        .mockResolvedValueOnce(Result.ok('success'));

      const resultPromise = handler.executeWithRetry(operation, {
        shouldRetry: (err) => err.code === 'CUSTOM_ERROR',
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isSuccess).toBe(true);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry when custom shouldRetry returns false', async () => {
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      const operation = vi.fn().mockResolvedValue(Result.fail(error));

      const result = await handler.executeWithRetry(operation, {
        shouldRetry: () => false,
      });

      expect(result.isFailure).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle thrown exceptions (not Result failures)', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Network error'));

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(UnexpectedAdapterError);
      expect(result.error.message).toContain('test-provider');
      expect(result.error.message).toContain('Network error');
    });

    it('should handle thrown non-Error objects', async () => {
      const operation = vi.fn().mockRejectedValue('string error');

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(UnexpectedAdapterError);
      expect(result.error.message).toContain('string error');
    });

    it('should track total delay across retries', async () => {
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      let capturedContext: any;
      const operation = vi
        .fn()
        .mockResolvedValueOnce(Result.fail(error))
        .mockImplementation((ctx) => {
          capturedContext = ctx;
          return Promise.resolve(Result.ok('success'));
        });

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(capturedContext.totalDelayMs).toBeGreaterThan(0);
    });

    it('should retry thrown exceptions until max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('persistent error'));

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isFailure).toBe(true);
      expect(operation).toHaveBeenCalledTimes(DEFAULT_RETRY_CONFIG.maxRetries + 1);
    });

    it('should record lastError in context for thrown exceptions', async () => {
      const error1 = new Error('error 1');
      let capturedContext: any;
      const operation = vi
        .fn()
        .mockRejectedValueOnce(error1)
        .mockImplementation((ctx) => {
          capturedContext = ctx;
          return Promise.resolve(Result.ok('success'));
        });

      const resultPromise = handler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      expect(capturedContext.lastError).toBe(error1);
    });
  });

  describe('isRetryable', () => {
    it('should return true for RateLimitError instances', () => {
      const error = new RateLimitError('RATE_LIMIT', 30, 'test-provider');
      expect(handler.isRetryable(error)).toBe(true);
    });

    it('should return true for errors with retryAfterSeconds property', () => {
      const error = new TestRateLimitErrorWithRetryAfter(30);
      expect(handler.isRetryable(error)).toBe(true);
    });

    it('should return true for each retryable error code', () => {
      for (const code of DEFAULT_RETRY_CONFIG.retryableErrorCodes) {
        const error = new TestDomainError(code, 'Error');
        expect(handler.isRetryable(error)).toBe(true);
      }
    });

    it('should return true for error codes containing RATE_LIMIT', () => {
      const error = new TestDomainError('GMAIL_RATE_LIMIT', 'Gmail rate limited');
      expect(handler.isRetryable(error)).toBe(true);
    });

    it('should return true for errors with retryable HTTP status codes', () => {
      for (const statusCode of DEFAULT_RETRY_CONFIG.retryableStatusCodes) {
        const error = new TestDomainErrorWithStatusCode('HTTP_ERROR', statusCode);
        expect(handler.isRetryable(error)).toBe(true);
      }
    });

    it('should return false for non-retryable errors', () => {
      const error = new TestDomainError('INVALID_INPUT', 'Bad request');
      expect(handler.isRetryable(error)).toBe(false);
    });

    it('should return false for non-retryable status codes', () => {
      const error = new TestDomainErrorWithStatusCode('HTTP_ERROR', 400);
      expect(handler.isRetryable(error)).toBe(false);
    });

    it('should return false for 404 status code', () => {
      const error = new TestDomainErrorWithStatusCode('HTTP_ERROR', 404);
      expect(handler.isRetryable(error)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('should use retry delay from RateLimitError', () => {
      const error = new RateLimitError('RATE_LIMIT', 30, 'test-provider');
      const delay = handler.calculateDelay(0, error);
      expect(delay).toBe(30000); // 30 seconds in ms
    });

    it('should cap RateLimitError delay at maxDelayMs', () => {
      const error = new RateLimitError('RATE_LIMIT', 60, 'test-provider');
      const delay = handler.calculateDelay(0, error);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });

    it('should use retryAfterSeconds from error with that property', () => {
      const error = new TestRateLimitErrorWithRetryAfter(10);
      const delay = handler.calculateDelay(0, error);
      expect(delay).toBe(10000);
    });

    it('should cap retryAfterSeconds delay at maxDelayMs', () => {
      const error = new TestRateLimitErrorWithRetryAfter(60);
      const delay = handler.calculateDelay(0, error);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });

    it('should apply exponential backoff for regular errors', () => {
      // Seed random for predictable jitter (disable jitter by checking range)
      const delay0 = handler.calculateDelay(0);
      const delay1 = handler.calculateDelay(1);
      const delay2 = handler.calculateDelay(2);

      // Base: 1000 * 2^0 = 1000, with jitter up to 25% => [1000, 1250]
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1250);

      // Base: 1000 * 2^1 = 2000, with jitter up to 25% => [2000, 2500]
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2500);

      // Base: 1000 * 2^2 = 4000, with jitter up to 25% => [4000, 5000]
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(5000);
    });

    it('should not exceed max delay for high attempt numbers', () => {
      const delay = handler.calculateDelay(20);
      expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
    });

    it('should work without error parameter', () => {
      const delay = handler.calculateDelay(0);
      expect(delay).toBeGreaterThan(0);
    });

    it('should work with non-rate-limit domain error', () => {
      const error = new TestDomainError('SOME_ERROR', 'Error');
      const delay = handler.calculateDelay(1, error);
      expect(delay).toBeGreaterThan(0);
    });
  });

  describe('custom config', () => {
    it('should respect custom maxRetries', async () => {
      const customHandler = new RetryHandler('test', { maxRetries: 1 });
      const error = new TestDomainError('RATE_LIMIT_EXCEEDED', 'Rate limited');
      const operation = vi.fn().mockResolvedValue(Result.fail(error));

      const resultPromise = customHandler.executeWithRetry(operation);
      await vi.runAllTimersAsync();
      await resultPromise;

      // 1 initial + 1 retry = 2
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect custom retryableErrorCodes', async () => {
      const customHandler = new RetryHandler('test', {
        maxRetries: 1,
        retryableErrorCodes: ['CUSTOM_RETRYABLE'],
      });

      const retryableError = new TestDomainError('CUSTOM_RETRYABLE', 'retryable');
      const nonRetryableError = new TestDomainError('ECONNRESET', 'not retryable with custom config');

      expect(customHandler.isRetryable(retryableError)).toBe(true);
      // ECONNRESET is only in default config, not custom
      expect(customHandler.isRetryable(nonRetryableError)).toBe(false);
    });

    it('should respect custom retryableStatusCodes', () => {
      const customHandler = new RetryHandler('test', {
        retryableStatusCodes: [502],
      });

      const error502 = new TestDomainErrorWithStatusCode('HTTP_ERROR', 502);
      const error500 = new TestDomainErrorWithStatusCode('HTTP_ERROR', 500);

      expect(customHandler.isRetryable(error502)).toBe(true);
      // 500 is only in default config, not custom
      expect(customHandler.isRetryable(error500)).toBe(false);
    });
  });
});
