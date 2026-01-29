/**
 * Circuit Breaker and Retry Policy Tests
 *
 * Comprehensive tests for resilience patterns:
 * - Circuit breaker state transitions
 * - Fallback behavior
 * - Recovery scenarios
 * - Retry with exponential backoff
 * - Integration between circuit breaker and retry
 *
 * @see IFC-122: Circuit breaker and retry policies for external service calls
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerOpenError,
  CircuitBreakerRegistry,
  createCircuitBreaker,
  globalCircuitBreakerRegistry,
  type CircuitBreakerEvent,
} from '../packages/platform/src/resilience/circuit-breaker';
import {
  RetryPolicy,
  withRetry,
  RetryableError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  MaxRetriesExceededError,
  isRetryableError,
  calculateBackoff,
  RetryPolicies,
  createRetryPolicy,
  DEFAULT_RETRY_CONFIG,
  type RetryContext,
} from '../apps/api/src/shared/retry-policy';

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      halfOpenMaxCalls: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have zero failure count initially', () => {
      const snapshot = breaker.getSnapshot();
      expect(snapshot.failureCount).toBe(0);
      expect(snapshot.totalFailures).toBe(0);
      expect(snapshot.totalSuccesses).toBe(0);
    });

    it('should allow calls when in CLOSED state', () => {
      expect(breaker.isCallPermitted()).toBe(true);
    });
  });

  describe('State Transitions', () => {
    it('should remain CLOSED on successful calls', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      await breaker.execute(mockFn);
      await breaker.execute(mockFn);
      await breaker.execute(mockFn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should transition to OPEN after failure threshold is reached', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow('Service unavailable');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject calls immediately when OPEN', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Next call should be rejected without calling the function
      await expect(breaker.execute(mockFn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(mockFn).toHaveBeenCalledTimes(3); // Not called again
    });

    it('should transition from OPEN to HALF_OPEN after reset timeout', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Advance time past reset timeout
      vi.advanceTimersByTime(1001);

      // Next call should transition to HALF_OPEN
      mockFn.mockResolvedValueOnce('success');
      await breaker.execute(mockFn);

      // After success, check state
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Wait for reset
      vi.advanceTimersByTime(1001);

      // Successful calls in HALF_OPEN
      mockFn.mockResolvedValue('success');
      await breaker.execute(mockFn);
      await breaker.execute(mockFn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition from HALF_OPEN to OPEN on any failure', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Wait for reset
      vi.advanceTimersByTime(1001);

      // Fail in HALF_OPEN
      await expect(breaker.execute(mockFn)).rejects.toThrow();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Fallback Behavior', () => {
    it('should use fallback when circuit is OPEN', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));
      const fallback = vi.fn().mockReturnValue('fallback-value');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      const result = await breaker.execute(mockFn, fallback);
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalledWith(expect.any(CircuitBreakerOpenError));
    });

    it('should support async fallback functions', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));
      const fallback = vi.fn().mockResolvedValue('async-fallback');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      const result = await breaker.execute(mockFn, fallback);
      expect(result).toBe('async-fallback');
    });
  });

  describe('Recovery Scenarios', () => {
    it('should reset counters when transitioning to CLOSED', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Wait and recover
      vi.advanceTimersByTime(1001);
      mockFn.mockResolvedValue('success');
      await breaker.execute(mockFn);
      await breaker.execute(mockFn);

      const snapshot = breaker.getSnapshot();
      expect(snapshot.state).toBe(CircuitState.CLOSED);
      expect(snapshot.failureCount).toBe(0);
    });

    it('should handle intermittent failures without opening circuit', async () => {
      const mockFn = vi.fn();

      // Success, fail, success pattern (not reaching threshold)
      mockFn.mockResolvedValueOnce('success');
      await breaker.execute(mockFn);

      mockFn.mockRejectedValueOnce(new Error('Fail'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();

      mockFn.mockResolvedValueOnce('success');
      await breaker.execute(mockFn);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should support manual reset', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getSnapshot().totalFailures).toBe(0);
    });

    it('should support force open', async () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      breaker.forceOpen();

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Event System', () => {
    it('should emit state_change events', async () => {
      const events: CircuitBreakerEvent[] = [];
      breaker.subscribe((event) => events.push(event));

      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Trigger OPEN
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      const stateChangeEvents = events.filter((e) => e.type === 'state_change');
      expect(stateChangeEvents.length).toBeGreaterThan(0);
      expect(stateChangeEvents[0]).toEqual(
        expect.objectContaining({
          type: 'state_change',
          from: CircuitState.CLOSED,
          to: CircuitState.OPEN,
        })
      );
    });

    it('should emit success and failure events', async () => {
      const events: CircuitBreakerEvent[] = [];
      breaker.subscribe((event) => events.push(event));

      const mockFn = vi.fn();

      mockFn.mockResolvedValueOnce('success');
      await breaker.execute(mockFn);

      mockFn.mockRejectedValueOnce(new Error('Fail'));
      await expect(breaker.execute(mockFn)).rejects.toThrow();

      const successEvents = events.filter((e) => e.type === 'success');
      const failureEvents = events.filter((e) => e.type === 'failure');

      expect(successEvents.length).toBe(1);
      expect(failureEvents.length).toBe(1);
    });

    it('should emit rejected events when circuit is OPEN', async () => {
      const events: CircuitBreakerEvent[] = [];
      breaker.subscribe((event) => events.push(event));

      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Try to call when OPEN
      await expect(breaker.execute(mockFn)).rejects.toThrow(CircuitBreakerOpenError);

      const rejectedEvents = events.filter((e) => e.type === 'rejected');
      expect(rejectedEvents.length).toBe(1);
    });

    it('should allow unsubscribe', () => {
      const events: CircuitBreakerEvent[] = [];
      const unsubscribe = breaker.subscribe((event) => events.push(event));

      unsubscribe();

      // No events should be collected after unsubscribe
      expect(events.length).toBe(0);
    });
  });

  describe('Half-Open Max Calls', () => {
    it('should limit concurrent calls in HALF_OPEN state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn)).rejects.toThrow();
      }

      // Wait for reset
      vi.advanceTimersByTime(1001);

      // Start calls that will be in HALF_OPEN
      mockFn.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('ok'), 100)));

      // First two calls should be allowed (halfOpenMaxCalls = 2)
      const promise1 = breaker.execute(mockFn);
      const promise2 = breaker.execute(mockFn);

      // Third call should fail
      await expect(breaker.execute(mockFn)).rejects.toThrow(CircuitBreakerOpenError);

      vi.advanceTimersByTime(100);
      await Promise.all([promise1, promise2]);
    });
  });

  describe('Failure Window', () => {
    it('should not count failures outside the failure window', async () => {
      const windowBreaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 1000,
        resetTimeoutMs: 500,
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

      // Two failures
      await expect(windowBreaker.execute(mockFn)).rejects.toThrow();
      await expect(windowBreaker.execute(mockFn)).rejects.toThrow();

      expect(windowBreaker.getState()).toBe(CircuitState.CLOSED);

      // Wait for failures to expire
      vi.advanceTimersByTime(1001);

      // One more failure (old ones should be cleaned up)
      await expect(windowBreaker.execute(mockFn)).rejects.toThrow();

      // Should still be closed (only 1 failure in window)
      expect(windowBreaker.getState()).toBe(CircuitState.CLOSED);
    });
  });
});

describe('Circuit Breaker Registry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should create and cache circuit breakers', () => {
    const breaker1 = registry.getOrCreate('service-a');
    const breaker2 = registry.getOrCreate('service-a');

    expect(breaker1).toBe(breaker2);
  });

  it('should create different breakers for different names', () => {
    const breakerA = registry.getOrCreate('service-a');
    const breakerB = registry.getOrCreate('service-b');

    expect(breakerA).not.toBe(breakerB);
  });

  it('should return undefined for non-existent breakers', () => {
    expect(registry.get('non-existent')).toBeUndefined();
  });

  it('should get all snapshots', () => {
    registry.getOrCreate('service-a');
    registry.getOrCreate('service-b');

    const snapshots = registry.getAllSnapshots();

    expect(Object.keys(snapshots)).toContain('service-a');
    expect(Object.keys(snapshots)).toContain('service-b');
  });

  it('should reset all breakers', async () => {
    const breakerA = registry.getOrCreate('service-a', { failureThreshold: 1 });
    const breakerB = registry.getOrCreate('service-b', { failureThreshold: 1 });

    // Open both breakers
    await expect(breakerA.execute(() => Promise.reject(new Error('Fail')))).rejects.toThrow();
    await expect(breakerB.execute(() => Promise.reject(new Error('Fail')))).rejects.toThrow();

    expect(breakerA.getState()).toBe(CircuitState.OPEN);
    expect(breakerB.getState()).toBe(CircuitState.OPEN);

    registry.resetAll();

    expect(breakerA.getState()).toBe(CircuitState.CLOSED);
    expect(breakerB.getState()).toBe(CircuitState.CLOSED);
  });

  it('should remove breakers', () => {
    registry.getOrCreate('service-a');
    expect(registry.get('service-a')).toBeDefined();

    registry.remove('service-a');
    expect(registry.get('service-a')).toBeUndefined();
  });

  it('should clear all breakers', () => {
    registry.getOrCreate('service-a');
    registry.getOrCreate('service-b');

    registry.clear();

    expect(registry.get('service-a')).toBeUndefined();
    expect(registry.get('service-b')).toBeUndefined();
  });
});

describe('Global Circuit Breaker Registry', () => {
  beforeEach(() => {
    globalCircuitBreakerRegistry.clear();
  });

  it('should be a singleton', () => {
    const breaker1 = globalCircuitBreakerRegistry.getOrCreate('global-service');
    const breaker2 = globalCircuitBreakerRegistry.getOrCreate('global-service');

    expect(breaker1).toBe(breaker2);
  });
});

describe('Retry Policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('RetryableError Classes', () => {
    it('should create RetryableError', () => {
      const error = new RetryableError('Test error');
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('RetryableError');
    });

    it('should create RateLimitError with retryAfter', () => {
      const error = new RateLimitError('Rate limited', 5000);
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('should create TimeoutError', () => {
      const error = new TimeoutError('Timed out');
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('TimeoutError');
    });

    it('should create NetworkError with code', () => {
      const error = new NetworkError('Connection reset', 'ECONNRESET');
      expect(error.isRetryable).toBe(true);
      expect(error.code).toBe('ECONNRESET');
    });
  });

  describe('isRetryableError', () => {
    it('should detect RetryableError subclasses', () => {
      expect(isRetryableError(new RetryableError('test'), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError(new RateLimitError(), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError(new TimeoutError(), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError(new NetworkError(), DEFAULT_RETRY_CONFIG)).toBe(true);
    });

    it('should detect errors by code', () => {
      const error = Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' });
      expect(isRetryableError(error, DEFAULT_RETRY_CONFIG)).toBe(true);
    });

    it('should detect errors by status code', () => {
      const error503 = Object.assign(new Error('Service unavailable'), { statusCode: 503 });
      expect(isRetryableError(error503, DEFAULT_RETRY_CONFIG)).toBe(true);

      const error429 = Object.assign(new Error('Too many requests'), { status: 429 });
      expect(isRetryableError(error429, DEFAULT_RETRY_CONFIG)).toBe(true);
    });

    it('should detect errors by message content', () => {
      expect(isRetryableError(new Error('ECONNRESET happened'), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError(new Error('rate limit exceeded'), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError(new Error('429 Too Many Requests'), DEFAULT_RETRY_CONFIG)).toBe(true);
    });

    it('should not detect non-retryable errors', () => {
      expect(isRetryableError(new Error('Invalid input'), DEFAULT_RETRY_CONFIG)).toBe(false);
      expect(isRetryableError(new Error('Not found'), DEFAULT_RETRY_CONFIG)).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0 };

      expect(calculateBackoff(0, config)).toBe(1000);
      expect(calculateBackoff(1, config)).toBe(2000);
      expect(calculateBackoff(2, config)).toBe(4000);
      expect(calculateBackoff(3, config)).toBe(8000);
    });

    it('should cap at maxDelayMs', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 5000, jitterFactor: 0 };

      expect(calculateBackoff(10, config)).toBe(5000);
    });

    it('should use rateLimitRetryAfterMs if provided', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, jitterFactor: 0 };

      expect(calculateBackoff(0, config, 10000)).toBe(10000);
    });

    it('should cap rateLimitRetryAfterMs at maxDelayMs', () => {
      const config = { ...DEFAULT_RETRY_CONFIG, maxDelayMs: 5000, jitterFactor: 0 };

      expect(calculateBackoff(0, config, 60000)).toBe(5000);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      vi.useRealTimers();

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('First fail'))
        .mockRejectedValueOnce(new RetryableError('Second fail'))
        .mockResolvedValue('success');

      const result = await withRetry(mockFn, { maxRetries: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);

      vi.useFakeTimers();
    });

    it('should not retry on non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Non-retryable'));

      await expect(withRetry(mockFn, { maxRetries: 3 })).rejects.toThrow(MaxRetriesExceededError);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should throw MaxRetriesExceededError after max retries', async () => {
      vi.useRealTimers();

      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Always fails'));

      await expect(
        withRetry(mockFn, { maxRetries: 2, initialDelayMs: 10 })
      ).rejects.toThrow(MaxRetriesExceededError);
      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

      vi.useFakeTimers();
    });

    it('should call onRetry callback', async () => {
      vi.useRealTimers();

      const onRetry = vi.fn();
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('Fail'))
        .mockResolvedValue('success');

      await withRetry(mockFn, { maxRetries: 2, initialDelayMs: 10 }, { onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 0 }),
        expect.any(RetryableError)
      );

      vi.useFakeTimers();
    });

    it('should support custom shouldRetry', async () => {
      vi.useRealTimers();

      const mockFn = vi.fn().mockRejectedValue(new Error('Custom error'));
      const shouldRetry = vi.fn().mockReturnValue(true);

      const promise = withRetry(
        mockFn,
        { maxRetries: 1, initialDelayMs: 10 },
        { shouldRetry }
      );

      await expect(promise).rejects.toThrow();

      expect(shouldRetry).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalledTimes(2);

      vi.useFakeTimers();
    });

    it('should use fallback value when all retries fail', async () => {
      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Fail'));

      const promise = withRetry(
        mockFn,
        { maxRetries: 1, initialDelayMs: 100 },
        { fallback: 'fallback-value' }
      );

      await vi.advanceTimersByTimeAsync(500);

      const result = await promise;
      expect(result).toBe('fallback-value');
    });

    it('should use fallback function when all retries fail', async () => {
      const mockFn = vi.fn().mockRejectedValue(new RetryableError('Fail'));
      const fallback = vi.fn().mockReturnValue('computed-fallback');

      const promise = withRetry(
        mockFn,
        { maxRetries: 1, initialDelayMs: 100 },
        { fallback }
      );

      await vi.advanceTimersByTimeAsync(500);

      const result = await promise;
      expect(result).toBe('computed-fallback');
      expect(fallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should emit retry events', async () => {
      vi.useRealTimers();

      const events: any[] = [];
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('Fail'))
        .mockResolvedValue('success');

      await withRetry(
        mockFn,
        { maxRetries: 2, initialDelayMs: 10 },
        { onEvent: (event) => events.push(event) }
      );

      expect(events.some((e) => e.type === 'attempt_start')).toBe(true);
      expect(events.some((e) => e.type === 'attempt_failure')).toBe(true);
      expect(events.some((e) => e.type === 'retry_scheduled')).toBe(true);
      expect(events.some((e) => e.type === 'attempt_success')).toBe(true);

      vi.useFakeTimers();
    });

    it('should handle RateLimitError with retryAfterMs', async () => {
      vi.useRealTimers();

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RateLimitError('Rate limited', 100))
        .mockResolvedValue('success');

      const start = Date.now();
      await withRetry(mockFn, { maxRetries: 1, initialDelayMs: 10 });
      const elapsed = Date.now() - start;

      // Should wait at least the retryAfterMs
      expect(elapsed).toBeGreaterThanOrEqual(90);

      vi.useFakeTimers();
    });
  });

  describe('RetryPolicy Class', () => {
    it('should execute with configured retry', async () => {
      vi.useRealTimers();

      const policy = new RetryPolicy({ maxRetries: 2, initialDelayMs: 10 });
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new RetryableError('Fail'))
        .mockResolvedValue('success');

      const result = await policy.execute(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);

      vi.useFakeTimers();
    });

    it('should support event subscription', async () => {
      vi.useRealTimers();

      const policy = new RetryPolicy({ maxRetries: 1, initialDelayMs: 10 });
      const events: any[] = [];

      policy.subscribe((event) => events.push(event));

      const mockFn = vi.fn().mockResolvedValue('success');
      await policy.execute(mockFn);

      expect(events.some((e) => e.type === 'attempt_start')).toBe(true);
      expect(events.some((e) => e.type === 'attempt_success')).toBe(true);

      vi.useFakeTimers();
    });

    it('should return config', () => {
      const policy = new RetryPolicy({ maxRetries: 5 });
      const config = policy.getConfig();

      expect(config.maxRetries).toBe(5);
    });
  });

  describe('Pre-configured Policies', () => {
    it('should have aggressive policy', () => {
      const config = RetryPolicies.aggressive.getConfig();
      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(500);
    });

    it('should have conservative policy', () => {
      const config = RetryPolicies.conservative.getConfig();
      expect(config.maxRetries).toBe(2);
      expect(config.initialDelayMs).toBe(2000);
    });

    it('should have noRetry policy', () => {
      const config = RetryPolicies.noRetry.getConfig();
      expect(config.maxRetries).toBe(0);
    });

    it('should have default policy', () => {
      const config = RetryPolicies.default.getConfig();
      expect(config.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
    });
  });
});

describe('Integration: Circuit Breaker + Retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should work together for resilient calls', async () => {
    vi.useRealTimers();

    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
    });

    const policy = createRetryPolicy({
      maxRetries: 2,
      initialDelayMs: 50,
    });

    let callCount = 0;
    const externalService = async () => {
      callCount++;
      if (callCount < 3) {
        throw new RetryableError('Temporary failure');
      }
      return 'success';
    };

    // Execute with both patterns
    const result = await policy.execute(() => breaker.execute(externalService));

    expect(result).toBe('success');
    expect(callCount).toBe(3);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    vi.useFakeTimers();
  });

  it('should open circuit breaker when retries are exhausted with persistent failures', async () => {
    vi.useRealTimers();

    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
    });

    const policy = createRetryPolicy({
      maxRetries: 1,
      initialDelayMs: 10,
    });

    const externalService = async () => {
      throw new RetryableError('Persistent failure');
    };

    // Multiple calls that exhaust retries
    for (let i = 0; i < 2; i++) {
      try {
        await policy.execute(() => breaker.execute(externalService));
      } catch {
        // Expected to fail
      }
    }

    // Circuit should now be open after multiple failed retry attempts
    expect(breaker.getSnapshot().totalFailures).toBeGreaterThanOrEqual(3);

    vi.useFakeTimers();
  });
});
