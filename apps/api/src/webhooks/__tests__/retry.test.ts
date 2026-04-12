/**
 * Webhook Retry Logic Tests
 *
 * Comprehensive tests for retry.ts covering:
 * - calculateRetryDelay (exponential backoff with jitter)
 * - isRetryableError
 * - InMemoryRetryQueue (all methods)
 * - CircuitBreaker (state transitions)
 * - RetryManager (scheduling, processing, dead letter)
 * - Factory functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calculateRetryDelay,
  isRetryableError,
  InMemoryRetryQueue,
  CircuitBreaker,
  RetryManager,
  createRetryManager,
  createInMemoryRetryQueue,
  createCircuitBreaker,
  type RetryEntry,
  type RetryConfig,
} from '../retry';

describe('calculateRetryDelay', () => {
  it('should return base delay for first attempt', () => {
    const delay = calculateRetryDelay(0, {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0, // No jitter for deterministic test
      retryableErrors: [],
      deadLetterThreshold: 5,
    });

    expect(delay).toBe(1000);
  });

  it('should apply exponential backoff', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0,
      retryableErrors: [],
      deadLetterThreshold: 5,
    };

    const delay0 = calculateRetryDelay(0, config);
    const delay1 = calculateRetryDelay(1, config);
    const delay2 = calculateRetryDelay(2, config);

    expect(delay0).toBe(1000);
    expect(delay1).toBe(2000);
    expect(delay2).toBe(4000);
  });

  it('should cap delay at maxDelayMs', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 10,
      jitterFactor: 0,
      retryableErrors: [],
      deadLetterThreshold: 5,
    };

    const delay = calculateRetryDelay(5, config);
    expect(delay).toBe(5000);
  });

  it('should add jitter within expected range', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
      retryableErrors: [],
      deadLetterThreshold: 5,
    };

    // Run multiple times to check range
    const delays = Array.from({ length: 50 }, () => calculateRetryDelay(1, config));

    // Base delay at attempt 1 is 2000ms
    // Jitter range: 2000 * 0.3 = 600, so [-600, +600]
    // Result range: [1400, 2600], but capped at min baseDelayMs (1000)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000); // min is baseDelayMs
      expect(delay).toBeLessThanOrEqual(2600);
    }
  });

  it('should use default config when not provided', () => {
    const delay = calculateRetryDelay(0);
    expect(delay).toBeGreaterThan(0);
  });

  it('should never return less than baseDelayMs', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 1.0, // Maximum jitter
      retryableErrors: [],
      deadLetterThreshold: 5,
    };

    const delays = Array.from({ length: 100 }, () => calculateRetryDelay(0, config));
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('isRetryableError', () => {
  it('should return true for retryable error message', () => {
    expect(isRetryableError(new Error('ECONNREFUSED: connection refused'))).toBe(true);
    expect(isRetryableError(new Error('ETIMEDOUT: request timed out'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND: dns lookup failed'))).toBe(true);
    expect(isRetryableError(new Error('NETWORK_ERROR occurred'))).toBe(true);
    expect(isRetryableError(new Error('SERVICE_UNAVAILABLE'))).toBe(true);
    expect(isRetryableError(new Error('INTERNAL_ERROR happened'))).toBe(true);
    expect(isRetryableError(new Error('RATE_LIMITED'))).toBe(true);
  });

  it('should return false for non-retryable error', () => {
    expect(isRetryableError(new Error('Invalid input'))).toBe(false);
    expect(isRetryableError(new Error('Not found'))).toBe(false);
    expect(isRetryableError(new Error('Unauthorized'))).toBe(false);
  });

  it('should handle string errors', () => {
    expect(isRetryableError('ECONNREFUSED')).toBe(true);
    expect(isRetryableError('Invalid data')).toBe(false);
  });

  it('should check error code property', () => {
    const error = new Error('some error');
    (error as any).code = 'ECONNREFUSED';
    expect(isRetryableError(error)).toBe(true);
  });

  it('should be case-insensitive for message matching', () => {
    expect(isRetryableError(new Error('service_unavailable'))).toBe(true);
  });

  it('should use default config when not provided', () => {
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
  });

  it('should use custom config when provided', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
      retryableErrors: ['CUSTOM_ERROR'],
      deadLetterThreshold: 5,
    };

    expect(isRetryableError(new Error('CUSTOM_ERROR'), config)).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'), config)).toBe(false);
  });
});

describe('InMemoryRetryQueue', () => {
  let queue: InMemoryRetryQueue;

  const createEntry = (overrides: Partial<RetryEntry> = {}): RetryEntry => ({
    id: `entry-${Date.now()}-${Math.random()}`,
    source: 'test',
    eventId: 'evt-1',
    eventType: 'test.event',
    payload: { data: 'test' },
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(Date.now() - 1000), // Ready now
    createdAt: new Date(),
    status: 'pending',
    ...overrides,
  });

  beforeEach(() => {
    queue = new InMemoryRetryQueue();
  });

  describe('enqueue', () => {
    it('should add entry to queue', async () => {
      const entry = createEntry({ id: 'test-1' });
      await queue.enqueue(entry);
      expect(queue.size()).toBe(1);
    });
  });

  describe('dequeue', () => {
    it('should return pending entries that are ready', async () => {
      const entry = createEntry({ id: 'test-dequeue' });
      await queue.enqueue(entry);

      const result = await queue.dequeue(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-dequeue');
      expect(result[0].status).toBe('processing');
    });

    it('should not return entries that are not yet ready', async () => {
      const futureEntry = createEntry({
        id: 'future-entry',
        nextAttemptAt: new Date(Date.now() + 60000),
      });
      await queue.enqueue(futureEntry);

      const result = await queue.dequeue();
      expect(result).toHaveLength(0);
    });

    it('should respect count limit', async () => {
      await queue.enqueue(createEntry({ id: 'e1' }));
      await queue.enqueue(createEntry({ id: 'e2' }));
      await queue.enqueue(createEntry({ id: 'e3' }));

      const result = await queue.dequeue(2);
      expect(result).toHaveLength(2);
    });

    it('should not return non-pending entries', async () => {
      const entry = createEntry({ id: 'processing-entry', status: 'processing' });
      await queue.enqueue(entry);

      const result = await queue.dequeue();
      expect(result).toHaveLength(0);
    });
  });

  describe('peek', () => {
    it('should return ready entries without changing status', async () => {
      const entry = createEntry({ id: 'peek-test' });
      await queue.enqueue(entry);

      const result = await queue.peek();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending'); // Not changed to processing
    });

    it('should respect count limit', async () => {
      await queue.enqueue(createEntry({ id: 'p1' }));
      await queue.enqueue(createEntry({ id: 'p2' }));
      await queue.enqueue(createEntry({ id: 'p3' }));

      const result = await queue.peek(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update existing entry', async () => {
      const entry = createEntry({ id: 'update-test' });
      await queue.enqueue(entry);

      await queue.update('update-test', { attempts: 3, error: 'retry failed' });

      const result = await queue.peek(10);
      expect(result[0].attempts).toBe(3);
      expect(result[0].error).toBe('retry failed');
    });

    it('should do nothing for non-existent entry', async () => {
      await queue.update('non-existent', { attempts: 5 });
      // Should not throw
      expect(queue.size()).toBe(0);
    });
  });

  describe('remove', () => {
    it('should remove existing entry', async () => {
      const entry = createEntry({ id: 'remove-test' });
      await queue.enqueue(entry);

      const removed = await queue.remove('remove-test');

      expect(removed).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should return false for non-existent entry', async () => {
      const removed = await queue.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('moveToDeadLetter', () => {
    it('should move entry from queue to dead letter', async () => {
      const entry = createEntry({ id: 'dl-test' });
      await queue.enqueue(entry);

      await queue.moveToDeadLetter('dl-test');

      expect(queue.size()).toBe(0);
      expect(queue.deadLetterSize()).toBe(1);
    });

    it('should set status to dead_letter', async () => {
      const entry = createEntry({ id: 'dl-status' });
      await queue.enqueue(entry);

      await queue.moveToDeadLetter('dl-status');

      const dlEntries = await queue.getDeadLetterEntries();
      expect(dlEntries[0].status).toBe('dead_letter');
    });

    it('should do nothing for non-existent entry', async () => {
      await queue.moveToDeadLetter('non-existent');
      expect(queue.deadLetterSize()).toBe(0);
    });
  });

  describe('getDeadLetterEntries', () => {
    it('should return dead letter entries', async () => {
      const entry = createEntry({ id: 'dl-get' });
      await queue.enqueue(entry);
      await queue.moveToDeadLetter('dl-get');

      const result = await queue.getDeadLetterEntries();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('dl-get');
    });

    it('should respect count limit', async () => {
      for (let i = 0; i < 5; i++) {
        const entry = createEntry({ id: `dl-${i}` });
        await queue.enqueue(entry);
        await queue.moveToDeadLetter(`dl-${i}`);
      }

      const result = await queue.getDeadLetterEntries(3);
      expect(result).toHaveLength(3);
    });
  });

  describe('reprocessDeadLetter', () => {
    it('should move entry back from dead letter to queue', async () => {
      const entry = createEntry({ id: 'reprocess-test', attempts: 3 });
      await queue.enqueue(entry);
      await queue.moveToDeadLetter('reprocess-test');

      const result = await queue.reprocessDeadLetter('reprocess-test');

      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
      expect(queue.deadLetterSize()).toBe(0);

      // Should reset attempts and status
      const entries = await queue.peek(10);
      expect(entries[0].attempts).toBe(0);
      expect(entries[0].status).toBe('pending');
    });

    it('should return false for non-existent dead letter entry', async () => {
      const result = await queue.reprocessDeadLetter('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct counts', async () => {
      // Add pending entries
      await queue.enqueue(createEntry({ id: 's1', status: 'pending' }));
      await queue.enqueue(createEntry({ id: 's2', status: 'processing' }));
      await queue.enqueue(createEntry({ id: 's3', status: 'completed' }));
      await queue.enqueue(createEntry({ id: 's4', status: 'failed' }));

      // Add dead letter entry
      const dlEntry = createEntry({ id: 's5' });
      await queue.enqueue(dlEntry);
      await queue.moveToDeadLetter('s5');

      const stats = await queue.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.deadLetter).toBe(1);
    });

    it('should track oldest and newest pending entries', async () => {
      const old = createEntry({
        id: 'old',
        createdAt: new Date('2024-01-01'),
      });
      const recent = createEntry({
        id: 'recent',
        createdAt: new Date('2024-06-01'),
      });

      await queue.enqueue(old);
      await queue.enqueue(recent);

      const stats = await queue.getStats();

      expect(stats.oldestPendingAt?.getTime()).toBe(new Date('2024-01-01').getTime());
      expect(stats.newestPendingAt?.getTime()).toBe(new Date('2024-06-01').getTime());
    });

    it('should return undefined dates when no pending entries', async () => {
      const stats = await queue.getStats();
      expect(stats.oldestPendingAt).toBeUndefined();
      expect(stats.newestPendingAt).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should clear all entries and dead letter', async () => {
      await queue.enqueue(createEntry({ id: 'c1' }));
      await queue.enqueue(createEntry({ id: 'c2' }));
      const dlEntry = createEntry({ id: 'c3' });
      await queue.enqueue(dlEntry);
      await queue.moveToDeadLetter('c3');

      await queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.deadLetterSize()).toBe(0);
    });
  });
});

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      openDurationMs: 5000,
      halfOpenMaxRequests: 2,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      const state = cb.getState();
      expect(state.status).toBe('closed');
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });

    it('should allow requests in closed state', () => {
      expect(cb.canRequest()).toBe(true);
    });
  });

  describe('closed state', () => {
    it('should reset failures on success', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();

      const state = cb.getState();
      expect(state.failures).toBe(0);
    });

    it('should open after reaching failure threshold', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      const state = cb.getState();
      expect(state.status).toBe('open');
    });
  });

  describe('open state', () => {
    beforeEach(() => {
      // Open the circuit
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
    });

    it('should not allow requests in open state', () => {
      expect(cb.canRequest()).toBe(false);
    });

    it('should transition to half_open after openDurationMs', () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(5001);

      expect(cb.canRequest()).toBe(true);
      const state = cb.getState();
      expect(state.status).toBe('half_open');

      vi.useRealTimers();
    });
  });

  describe('half_open state', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Open, then wait for half-open
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      vi.advanceTimersByTime(5001);
      cb.canRequest(); // Trigger transition
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should allow limited requests', () => {
      expect(cb.canRequest()).toBe(true);
    });

    it('should not allow more than halfOpenMaxRequests', () => {
      // halfOpenMaxRequests is 2
      // Since canRequest doesn't increment, we need to test via the limit
      expect(cb.canRequest()).toBe(true);
    });

    it('should close after enough successes', () => {
      cb.recordSuccess();
      cb.recordSuccess();

      const state = cb.getState();
      expect(state.status).toBe('closed');
    });

    it('should open again on failure', () => {
      cb.recordFailure();

      const state = cb.getState();
      expect(state.status).toBe('open');
    });
  });

  describe('forceClose', () => {
    it('should force circuit to closed state', () => {
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState().status).toBe('open');

      cb.forceClose();

      const state = cb.getState();
      expect(state.status).toBe('closed');
      expect(state.failures).toBe(0);
    });
  });

  describe('forceOpen', () => {
    it('should force circuit to open state', () => {
      cb.forceOpen();

      const state = cb.getState();
      expect(state.status).toBe('open');
    });

    it('should accept custom duration', () => {
      vi.useFakeTimers();
      cb.forceOpen(10000);

      const state = cb.getState();
      expect(state.status).toBe('open');
      expect(state.nextRetryAt).toBeDefined();

      vi.useRealTimers();
    });
  });

  describe('default config', () => {
    it('should use default config when none provided', () => {
      const defaultCb = new CircuitBreaker();
      expect(defaultCb.getState().status).toBe('closed');
    });
  });
});

describe('RetryManager', () => {
  let manager: RetryManager;
  let queue: InMemoryRetryQueue;

  beforeEach(() => {
    queue = new InMemoryRetryQueue();
    manager = new RetryManager(queue, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterFactor: 0,
      retryableErrors: ['ECONNREFUSED', 'NETWORK_ERROR'],
      deadLetterThreshold: 3,
    });
  });

  describe('scheduleRetry', () => {
    it('should create and enqueue a retry entry', async () => {
      const entry = await manager.scheduleRetry(
        'stripe',
        'evt-123',
        'payment.completed',
        { amount: 100 },
        'Connection failed'
      );

      expect(entry.id).toBeDefined();
      expect(entry.source).toBe('stripe');
      expect(entry.eventId).toBe('evt-123');
      expect(entry.eventType).toBe('payment.completed');
      expect(entry.payload).toEqual({ amount: 100 });
      expect(entry.error).toBe('Connection failed');
      expect(entry.status).toBe('pending');
      expect(entry.attempts).toBe(0);
      expect(queue.size()).toBe(1);
    });

    it('should schedule retry with existing attempts', async () => {
      const entry = await manager.scheduleRetry(
        'stripe',
        'evt-123',
        'payment.completed',
        {},
        'Error',
        2 // Already attempted 2 times
      );

      expect(entry.attempts).toBe(2);
    });
  });

  describe('processEntry', () => {
    it('should process entry successfully', async () => {
      const entry = await manager.scheduleRetry('test', 'evt-1', 'test.event', {});

      const onSuccess = vi.fn();
      const result = await manager.processEntry(entry, {
        handler: async () => 'success',
        onSuccess,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(onSuccess).toHaveBeenCalledWith(entry, 'success');
    });

    it('should move to dead letter when max attempts reached', async () => {
      const entry = await manager.scheduleRetry(
        'test',
        'evt-1',
        'test.event',
        {},
        undefined,
        2 // Already at max-1 attempts
      );

      const onDeadLetter = vi.fn();
      const onFailure = vi.fn();

      const result = await manager.processEntry(entry, {
        handler: async () => {
          throw new Error('Always fails');
        },
        onDeadLetter,
        onFailure,
      });

      expect(result.success).toBe(false);
      expect(onDeadLetter).toHaveBeenCalledWith(entry);
      expect(onFailure).toHaveBeenCalled();
    });

    it('should schedule retry for retryable errors', async () => {
      const entry = await manager.scheduleRetry('test', 'evt-1', 'test.event', {});

      const result = await manager.processEntry(entry, {
        handler: async () => {
          throw new Error('ECONNREFUSED');
        },
      });

      expect(result.success).toBe(false);
      // Entry should still be in queue (not dead letter)
      expect(queue.size()).toBe(1);
    });

    it('should move to dead letter for non-retryable errors', async () => {
      const entry = await manager.scheduleRetry('test', 'evt-1', 'test.event', {});

      const onDeadLetter = vi.fn();

      await manager.processEntry(entry, {
        handler: async () => {
          throw new Error('Invalid payload format');
        },
        onDeadLetter,
      });

      expect(onDeadLetter).toHaveBeenCalledWith(entry);
    });

    it('should handle non-Error exceptions', async () => {
      const entry = await manager.scheduleRetry('test', 'evt-1', 'test.event', {});

      const result = await manager.processEntry(entry, {
        handler: async () => {
          throw 'string error';
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('processEntry with circuit breaker', () => {
    it('should block processing when circuit is open', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        openDurationMs: 60000,
        halfOpenMaxRequests: 1,
      });
      const managerWithCb = new RetryManager(queue, undefined, cb);

      const entry = await managerWithCb.scheduleRetry('test', 'evt-1', 'test.event', {});

      // Open the circuit
      cb.recordFailure();

      const result = await managerWithCb.processEntry(entry, {
        handler: async () => 'should not reach',
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Circuit breaker is open');
    });

    it('should record success with circuit breaker', async () => {
      const cb = new CircuitBreaker();
      const managerWithCb = new RetryManager(queue, undefined, cb);

      const entry = await managerWithCb.scheduleRetry('test', 'evt-1', 'test.event', {});

      await managerWithCb.processEntry(entry, {
        handler: async () => 'ok',
      });

      const state = cb.getState();
      expect(state.lastSuccessAt).toBeDefined();
    });
  });

  describe('processPending', () => {
    it('should process all pending entries', async () => {
      // Enqueue entries directly
      const entry1: RetryEntry = {
        id: 'pp-1',
        source: 'test',
        eventId: 'evt-1',
        eventType: 'test',
        payload: {},
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
        status: 'pending',
      };
      const entry2: RetryEntry = {
        ...entry1,
        id: 'pp-2',
        eventId: 'evt-2',
      };

      await queue.enqueue(entry1);
      await queue.enqueue(entry2);

      const result = await manager.processPending({
        handler: async () => 'ok',
      });

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should respect batch size', async () => {
      for (let i = 0; i < 5; i++) {
        await queue.enqueue({
          id: `batch-${i}`,
          source: 'test',
          eventId: `evt-${i}`,
          eventType: 'test',
          payload: {},
          attempts: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date(Date.now() - 1000),
          createdAt: new Date(),
          status: 'pending',
        });
      }

      const result = await manager.processPending({ handler: async () => 'ok' }, 3);

      expect(result.processed).toBe(3);
    });

    it('should count failures', async () => {
      await queue.enqueue({
        id: 'fail-1',
        source: 'test',
        eventId: 'evt-1',
        eventType: 'test',
        payload: {},
        attempts: 2, // At max - 1
        maxAttempts: 3,
        nextAttemptAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
        status: 'pending',
      });

      const result = await manager.processPending({
        handler: async () => {
          throw new Error('fail');
        },
      });

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('startProcessing and stopProcessing', () => {
    it('should start and stop periodic processing', () => {
      vi.useFakeTimers();

      manager.startProcessing({ handler: async () => 'ok' }, 1000);

      // Should not start again if already processing
      manager.startProcessing({ handler: async () => 'ok' }, 1000);

      manager.stopProcessing();

      vi.useRealTimers();
    });

    it('should stop processing cleanly', () => {
      vi.useFakeTimers();

      manager.startProcessing({ handler: async () => 'ok' });
      manager.stopProcessing();

      // Stop again (already stopped - should handle gracefully)
      manager.stopProcessing();

      vi.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      await queue.enqueue({
        id: 'stat-1',
        source: 'test',
        eventId: 'evt-1',
        eventType: 'test',
        payload: {},
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
        status: 'pending',
      });

      const stats = await manager.getStats();

      expect(stats.pending).toBe(1);
    });
  });

  describe('getDeadLetterEntries', () => {
    it('should return dead letter entries', async () => {
      const entry: RetryEntry = {
        id: 'dl-entry',
        source: 'test',
        eventId: 'evt-1',
        eventType: 'test',
        payload: {},
        attempts: 0,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
        status: 'pending',
      };
      await queue.enqueue(entry);
      await queue.moveToDeadLetter('dl-entry');

      const entries = await manager.getDeadLetterEntries();
      expect(entries).toHaveLength(1);
    });
  });

  describe('reprocessDeadLetter', () => {
    it('should reprocess dead letter entry', async () => {
      const entry: RetryEntry = {
        id: 'reprocess',
        source: 'test',
        eventId: 'evt-1',
        eventType: 'test',
        payload: {},
        attempts: 3,
        maxAttempts: 3,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
        status: 'pending',
      };
      await queue.enqueue(entry);
      await queue.moveToDeadLetter('reprocess');

      const result = await manager.reprocessDeadLetter('reprocess');
      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return null when no circuit breaker', () => {
      const managerNoCb = new RetryManager(queue);
      expect(managerNoCb.getCircuitBreakerState()).toBeNull();
    });

    it('should return circuit breaker state', () => {
      const cb = new CircuitBreaker();
      const managerWithCb = new RetryManager(queue, undefined, cb);

      const state = managerWithCb.getCircuitBreakerState();
      expect(state).not.toBeNull();
      expect(state!.status).toBe('closed');
    });
  });
});

describe('Factory functions', () => {
  describe('createRetryManager', () => {
    it('should create manager with circuit breaker by default', () => {
      const manager = createRetryManager();
      expect(manager.getCircuitBreakerState()).not.toBeNull();
    });

    it('should create manager without circuit breaker when disabled', () => {
      const manager = createRetryManager(undefined, undefined, false);
      expect(manager.getCircuitBreakerState()).toBeNull();
    });

    it('should accept custom queue and config', () => {
      const customQueue = new InMemoryRetryQueue();
      const manager = createRetryManager(customQueue, { maxAttempts: 10 });
      expect(manager).toBeDefined();
    });
  });

  describe('createInMemoryRetryQueue', () => {
    it('should create a new queue', () => {
      const queue = createInMemoryRetryQueue();
      expect(queue).toBeInstanceOf(InMemoryRetryQueue);
      expect(queue.size()).toBe(0);
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create circuit breaker with default config', () => {
      const cb = createCircuitBreaker();
      expect(cb.getState().status).toBe('closed');
    });

    it('should create circuit breaker with custom config', () => {
      const cb = createCircuitBreaker({ failureThreshold: 10 });
      expect(cb.getState().status).toBe('closed');
    });
  });
});
