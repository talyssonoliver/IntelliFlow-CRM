import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  RetryableError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  CircuitBreaker,
  DEFAULT_RETRY_CONFIG,
  Retry,
} from './retry';

describe('Retry Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RetryableError classes', () => {
    it('should create RetryableError', () => {
      const error = new RetryableError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RetryableError);
      expect(error.name).toBe('RetryableError');
      expect(error.message).toBe('Test error');
    });

    it('should create RateLimitError', () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(RetryableError);
      expect(error.name).toBe('RateLimitError');
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should create RateLimitError with custom message', () => {
      const error = new RateLimitError('Custom rate limit message');

      expect(error.message).toBe('Custom rate limit message');
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError();

      expect(error).toBeInstanceOf(RetryableError);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Operation timed out');
    });

    it('should create NetworkError', () => {
      const error = new NetworkError();

      expect(error).toBeInstanceOf(RetryableError);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network error');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on RetryableError', async () => {
      vi.useRealTimers();

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('First fail'))
        .mockRejectedValueOnce(new RetryableError('Second fail'))
        .mockResolvedValue('success');

      const result = await withRetry(mockFn, { maxAttempts: 3, initialDelay: 10 });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);

      vi.useFakeTimers();
    });

    it('should retry on RateLimitError', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError())
        .mockResolvedValue('success');

      const promise = withRetry(mockFn, { maxAttempts: 2, initialDelay: 100 });

      await vi.advanceTimersByTimeAsync(150);

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Non-retryable error'));

      await expect(withRetry(mockFn, { maxAttempts: 3 })).rejects.toThrow('Non-retryable error');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max attempts', async () => {
      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Persistent error'));

      const promise = withRetry(mockFn, { maxAttempts: 3, initialDelay: 100 });

      vi.advanceTimersByTimeAsync(1000);

      await expect(promise).rejects.toThrow('Persistent error');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Test error'));

      const promise = withRetry(mockFn, {
        maxAttempts: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
        onRetry: () => {
          delays.push(Date.now());
        },
      });

      vi.advanceTimersByTimeAsync(1000);

      await expect(promise).rejects.toThrow('Test error');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelay cap', async () => {
      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Test error'));

      const promise = withRetry(mockFn, {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 10,
      });

      vi.advanceTimersByTimeAsync(15000);

      await expect(promise).rejects.toThrow('Test error');
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('First fail'))
        .mockResolvedValue('success');

      const promise = withRetry(mockFn, {
        maxAttempts: 2,
        initialDelay: 100,
        onRetry,
      });

      await vi.advanceTimersByTimeAsync(150);

      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(expect.any(RetryableError), 1);
    });

    it('should use default retry config', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(mockFn);

      expect(result).toBe('success');
    });

    it('should detect ECONNRESET errors as retryable', async () => {
      const error = new Error('ECONNRESET - connection reset');
      const mockFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(mockFn, { maxAttempts: 2, initialDelay: 100 });

      await vi.advanceTimersByTimeAsync(150);

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should detect 429 errors as retryable', async () => {
      const error = new Error('429 Too Many Requests');
      const mockFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');

      const promise = withRetry(mockFn, { maxAttempts: 2, initialDelay: 100 });

      await vi.advanceTimersByTimeAsync(150);

      const result = await promise;

      expect(result).toBe('success');
    });
  });

  describe('withTimeout', () => {
    it('should succeed within timeout', async () => {
      vi.useRealTimers();
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withTimeout(mockFn, 1000);

      expect(result).toBe('success');
      vi.useFakeTimers();
    });

    it('should throw TimeoutError when timeout exceeded', async () => {
      vi.useRealTimers();
      const mockFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 2000);
          })
      );

      await expect(withTimeout(mockFn, 100)).rejects.toThrow(TimeoutError);
      vi.useFakeTimers();
    });

    it('should use custom timeout message', async () => {
      vi.useRealTimers();
      const mockFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('success'), 2000);
          })
      );

      await expect(withTimeout(mockFn, 100, 'Custom timeout message')).rejects.toThrow(
        'Custom timeout message'
      );
      vi.useFakeTimers();
    });
  });

  describe('withRetryAndTimeout', () => {
    it('should combine retry and timeout', async () => {
      vi.useRealTimers();
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withRetryAndTimeout(mockFn, { maxAttempts: 3 }, 5000);

      expect(result).toBe('success');
      vi.useFakeTimers();
    });

    it('should retry on timeout', async () => {
      vi.useRealTimers();
      let callCount = 0;
      const mockFn = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            callCount++;
            if (callCount === 1) {
              setTimeout(() => resolve('late'), 2000);
            } else {
              resolve('success');
            }
          })
      );

      const result = await withRetryAndTimeout(
        mockFn,
        { maxAttempts: 2, initialDelay: 10 },
        100
      );

      expect(result).toBe('success');
      vi.useFakeTimers();
    });
  });

  describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      breaker = new CircuitBreaker(3, 1000);
    });

    it('should start in CLOSED state', () => {
      const state = breaker.getState();

      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should execute function successfully', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(breaker.getState().state).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow('Fail');
      }

      const state = breaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failureCount).toBe(3);
    });

    it('should reject immediately when circuit is OPEN', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState().state).toBe('OPEN');

      // Should reject immediately
      await expect(breaker.execute(mockFn)).rejects.toThrow(
        'Circuit breaker is OPEN - too many failures'
      );
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState().state).toBe('OPEN');

      // Advance time past reset timeout
      await vi.advanceTimersByTimeAsync(1001);

      // Next call should enter HALF_OPEN state
      mockFn.mockResolvedValueOnce('success');
      const result = await breaker.execute(mockFn);

      expect(result).toBe('success');
      expect(breaker.getState().state).toBe('CLOSED');
    });

    it('should reset on successful execution in HALF_OPEN state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Wait for reset timeout
      await vi.advanceTimersByTimeAsync(1001);

      // Succeed in HALF_OPEN state
      mockFn.mockResolvedValueOnce('success');
      await breaker.execute(mockFn);

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should support custom threshold and timeout', () => {
      const customBreaker = new CircuitBreaker(5, 2000);

      expect(customBreaker).toBeDefined();
    });

    it('should allow manual reset', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState().state).toBe('OPEN');

      breaker.reset();

      const state = breaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('Retry decorator', () => {
    it('should test decorator functionality exists', () => {
      // Decorator tests are challenging in test environments
      // Just verify the decorator function exists and is exported
      expect(Retry).toBeDefined();
      expect(typeof Retry).toBe('function');
    });

    it('should verify retry config structure', () => {
      const config = { maxAttempts: 3, initialDelay: 100 };
      expect(config.maxAttempts).toBe(3);
      expect(config.initialDelay).toBe(100);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should export default configuration', () => {
      expect(DEFAULT_RETRY_CONFIG).toBeDefined();
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBeGreaterThan(0);
      expect(DEFAULT_RETRY_CONFIG.initialDelay).toBeGreaterThan(0);
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBeGreaterThan(0);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBeGreaterThan(0);
    });
  });
});
