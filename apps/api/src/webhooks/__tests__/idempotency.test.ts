/**
 * Idempotency Middleware Tests
 *
 * Tests for apps/api/src/webhooks/idempotency.ts
 *
 * Validates:
 * - InMemoryIdempotencyStore: CRUD, locking, cleanup, clear/size
 * - IdempotencyMiddleware: check(), startProcessing(), completeProcessing(), failProcessing()
 * - wrap() helper for wrapping handlers
 * - middleware() for Express/Hono-style middleware
 * - Key generation with generateKey()
 * - Factory functions: createIdempotencyMiddleware, createInMemoryStore
 * - Helper: createWebhookIdempotencyKey
 * - Cleanup timer start/stop
 * - Edge cases: expired entries, max retries, processing lock
 *
 * KPI Target: Zero duplicate webhooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InMemoryIdempotencyStore,
  IdempotencyMiddleware,
  createIdempotencyMiddleware,
  createInMemoryStore,
  createWebhookIdempotencyKey,
} from '../idempotency';
import type { IdempotencyEntry } from '../idempotency';

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  describe('get/set', () => {
    it('should return null for non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should store and retrieve an entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'test-key',
        status: 'processing',
        createdAt: new Date(),
        attempts: 1,
      };

      await store.set('test-key', entry);
      const result = await store.get('test-key');

      expect(result).toBeDefined();
      expect(result!.key).toBe('test-key');
      expect(result!.status).toBe('processing');
    });
  });

  describe('update', () => {
    it('should update an existing entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'update-key',
        status: 'processing',
        createdAt: new Date(),
        attempts: 1,
      };

      await store.set('update-key', entry);
      await store.update('update-key', { status: 'completed', completedAt: new Date() });

      const result = await store.get('update-key');
      expect(result!.status).toBe('completed');
      expect(result!.completedAt).toBeDefined();
    });

    it('should do nothing when updating non-existent entry', async () => {
      // Should not throw
      await store.update('non-existent', { status: 'completed' });
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'delete-key',
        status: 'completed',
        createdAt: new Date(),
        attempts: 1,
      };

      await store.set('delete-key', entry);
      const deleted = await store.delete('delete-key');

      expect(deleted).toBe(true);
      expect(await store.get('delete-key')).toBeNull();
    });

    it('should return false for non-existent key', async () => {
      const deleted = await store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('acquire/release', () => {
    it('should acquire a lock', async () => {
      const acquired = await store.acquire('lock-key', 5000);
      expect(acquired).toBe(true);
    });

    it('should fail to acquire if lock is held', async () => {
      await store.acquire('lock-key', 5000);
      const second = await store.acquire('lock-key', 5000);
      expect(second).toBe(false);
    });

    it('should acquire after lock expires', async () => {
      // Acquire lock with 0ms duration (immediately expired)
      await store.acquire('lock-key', -1);
      const acquired = await store.acquire('lock-key', 5000);
      expect(acquired).toBe(true);
    });

    it('should release a lock', async () => {
      await store.acquire('lock-key', 5000);
      await store.release('lock-key');
      const acquired = await store.acquire('lock-key', 5000);
      expect(acquired).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const oldEntry: IdempotencyEntry = {
        key: 'old-key',
        status: 'completed',
        createdAt: new Date(Date.now() - 100000), // 100 seconds ago
        attempts: 1,
      };

      const newEntry: IdempotencyEntry = {
        key: 'new-key',
        status: 'completed',
        createdAt: new Date(),
        attempts: 1,
      };

      await store.set('old-key', oldEntry);
      await store.set('new-key', newEntry);

      const removed = await store.cleanup(50000); // maxAge 50 seconds

      expect(removed).toBe(1);
      expect(await store.get('old-key')).toBeNull();
      expect(await store.get('new-key')).not.toBeNull();
    });

    it('should return 0 when no entries need cleanup', async () => {
      const entry: IdempotencyEntry = {
        key: 'fresh-key',
        status: 'completed',
        createdAt: new Date(),
        attempts: 1,
      };

      await store.set('fresh-key', entry);
      const removed = await store.cleanup(100000);
      expect(removed).toBe(0);
    });
  });

  describe('clear/size', () => {
    it('should clear all entries and locks', () => {
      store.clear();
      expect(store.size()).toBe(0);
    });

    it('should report correct size', async () => {
      await store.set('a', { key: 'a', status: 'completed', createdAt: new Date(), attempts: 1 });
      await store.set('b', { key: 'b', status: 'completed', createdAt: new Date(), attempts: 1 });
      expect(store.size()).toBe(2);
    });
  });
});

describe('IdempotencyMiddleware', () => {
  let middleware: IdempotencyMiddleware;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    middleware = new IdempotencyMiddleware(store, { cleanupIntervalMs: 0 });
  });

  afterEach(() => {
    middleware.stopCleanup();
  });

  describe('generateKey', () => {
    it('should generate a deterministic key', () => {
      const key1 = middleware.generateKey('stripe', 'evt_123');
      const key2 = middleware.generateKey('stripe', 'evt_123');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = middleware.generateKey('stripe', 'evt_123');
      const key2 = middleware.generateKey('stripe', 'evt_456');
      expect(key1).not.toBe(key2);
    });

    it('should include additional data in key generation', () => {
      const key1 = middleware.generateKey('stripe', 'evt_123');
      const key2 = middleware.generateKey('stripe', 'evt_123', 'extra');
      expect(key1).not.toBe(key2);
    });

    it('should include key prefix', () => {
      const key = middleware.generateKey('stripe', 'evt_123');
      expect(key).toMatch(/^idempotency:/);
    });
  });

  describe('check', () => {
    it('should return shouldProcess=true for new key', async () => {
      const result = await middleware.check('new-key');
      expect(result.shouldProcess).toBe(true);
      expect(result.isDuplicate).toBe(false);
    });

    it('should return shouldProcess=false for completed entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'completed-key',
        status: 'completed',
        createdAt: new Date(),
        attempts: 1,
        response: { data: 'cached' },
      };
      await store.set('completed-key', entry);

      const result = await middleware.check('completed-key');
      expect(result.shouldProcess).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.previousResult).toEqual({ data: 'cached' });
      expect(result.reason).toContain('Already processed');
    });

    it('should allow retry for failed entry under max retries', async () => {
      const entry: IdempotencyEntry = {
        key: 'failed-key',
        status: 'failed',
        createdAt: new Date(),
        attempts: 1,
        error: 'Network error',
      };
      await store.set('failed-key', entry);

      const result = await middleware.check('failed-key');
      expect(result.shouldProcess).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Retry attempt');
    });

    it('should reject retry for failed entry at max retries', async () => {
      const entry: IdempotencyEntry = {
        key: 'max-retry-key',
        status: 'failed',
        createdAt: new Date(),
        attempts: 3, // maxRetries default is 3
        error: 'Persistent error',
      };
      await store.set('max-retry-key', entry);

      const result = await middleware.check('max-retry-key');
      expect(result.shouldProcess).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Max retries exceeded');
    });

    it('should return shouldProcess=false for currently processing entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'processing-key',
        status: 'processing',
        createdAt: new Date(),
        attempts: 1,
        lockUntil: new Date(Date.now() + 30000), // lock expires in 30 seconds
      };
      await store.set('processing-key', entry);

      const result = await middleware.check('processing-key');
      expect(result.shouldProcess).toBe(false);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Currently being processed');
    });

    it('should allow retry when processing lock has expired', async () => {
      const entry: IdempotencyEntry = {
        key: 'expired-lock-key',
        status: 'processing',
        createdAt: new Date(),
        attempts: 1,
        lockUntil: new Date(Date.now() - 1000), // lock already expired
      };
      await store.set('expired-lock-key', entry);

      const result = await middleware.check('expired-lock-key');
      expect(result.shouldProcess).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('Previous processing timed out');
    });

    it('should allow processing when entry TTL has expired', async () => {
      // Create middleware with very short TTL
      const shortTTLMiddleware = new IdempotencyMiddleware(store, {
        ttlMs: 1, // 1ms TTL
        cleanupIntervalMs: 0,
      });

      const entry: IdempotencyEntry = {
        key: 'expired-ttl-key',
        status: 'completed',
        createdAt: new Date(Date.now() - 1000), // 1 second ago
        attempts: 1,
      };
      await store.set('expired-ttl-key', entry);

      const result = await shortTTLMiddleware.check('expired-ttl-key');
      expect(result.shouldProcess).toBe(true);
      expect(result.isDuplicate).toBe(false);
      expect(result.reason).toContain('Previous entry expired');
      shortTTLMiddleware.stopCleanup();
    });
  });

  describe('startProcessing', () => {
    it('should acquire lock and set processing status', async () => {
      const acquired = await middleware.startProcessing('new-key');
      expect(acquired).toBe(true);

      const entry = await middleware.getEntry('new-key');
      expect(entry).toBeDefined();
      expect(entry!.status).toBe('processing');
      expect(entry!.attempts).toBe(1);
    });

    it('should return false if lock cannot be acquired', async () => {
      // First call acquires lock
      await middleware.startProcessing('locked-key');
      // Second call should fail
      const acquired = await middleware.startProcessing('locked-key');
      expect(acquired).toBe(false);
    });

    it('should increment attempts on existing entry', async () => {
      const entry: IdempotencyEntry = {
        key: 'retry-key',
        status: 'failed',
        createdAt: new Date(),
        attempts: 2,
      };
      await store.set('retry-key', entry);

      // Release any lock so startProcessing can acquire it
      await store.release('retry-key');
      const acquired = await middleware.startProcessing('retry-key');
      expect(acquired).toBe(true);

      const updated = await middleware.getEntry('retry-key');
      expect(updated!.attempts).toBe(3);
    });
  });

  describe('completeProcessing', () => {
    it('should mark entry as completed with response', async () => {
      await middleware.startProcessing('complete-key');
      await middleware.completeProcessing('complete-key', { success: true });

      const entry = await middleware.getEntry('complete-key');
      expect(entry!.status).toBe('completed');
      expect(entry!.response).toEqual({ success: true });
      expect(entry!.completedAt).toBeDefined();
    });
  });

  describe('failProcessing', () => {
    it('should mark entry as failed with error', async () => {
      await middleware.startProcessing('fail-key');
      await middleware.failProcessing('fail-key', 'Something went wrong');

      const entry = await middleware.getEntry('fail-key');
      expect(entry!.status).toBe('failed');
      expect(entry!.error).toBe('Something went wrong');
      expect(entry!.completedAt).toBeDefined();
    });
  });

  describe('wrap', () => {
    it('should execute handler and cache result', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 123 });
      const wrapped = middleware.wrap(
        (input: string) => middleware.generateKey('test', input),
        handler
      );

      const result = await wrapped('event-1');
      expect(result).toEqual({ result: { id: 123 }, fromCache: false });
      expect(handler).toHaveBeenCalledWith('event-1');
    });

    it('should return cached result for duplicate request', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 123 });
      const wrapped = middleware.wrap(
        (input: string) => middleware.generateKey('test', input),
        handler
      );

      // First call
      await wrapped('event-1');

      // Second call - should use cache
      const result = await wrapped('event-1');
      expect(result).toEqual({ result: { id: 123 }, fromCache: true });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should rethrow errors from handler', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      const wrapped = middleware.wrap(
        (input: string) => middleware.generateKey('test', input),
        handler
      );

      await expect(wrapped('event-1')).rejects.toThrow('Handler failed');
    });

    it('should return error for duplicate that had no previousResult', async () => {
      // Manually set a processing entry to simulate a duplicate without a result
      const key = middleware.generateKey('test', 'dup-evt');
      const entry: IdempotencyEntry = {
        key,
        status: 'completed',
        createdAt: new Date(),
        attempts: 1,
        // no response set
      };
      await store.set(key, entry);

      const handler = vi.fn();
      const wrapped = middleware.wrap(
        (input: string) => middleware.generateKey('test', input),
        handler
      );

      const result = await wrapped('dup-evt');
      // When completed but no response, previousResult is undefined,
      // so the isDuplicate path should return an error message
      expect((result as any).fromCache).toBe(true);
    });

    it('should return error when lock cannot be acquired', async () => {
      const key = middleware.generateKey('test', 'lock-evt');
      // Pre-acquire lock
      await store.acquire(key, 60000);

      const handler = vi.fn();
      const wrapped = middleware.wrap(
        (input: string) => middleware.generateKey('test', input),
        handler
      );

      const result = await wrapped('lock-evt');
      expect((result as any).error).toContain('Failed to acquire processing lock');
      expect((result as any).fromCache).toBe(false);
    });
  });

  describe('middleware()', () => {
    it('should process new request and return result', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'test' },
        headers: { 'idempotency-key': 'unique-key-1' },
      };

      const result = await mw(req, async () => ({ processed: true }));

      expect(result.status).toBe(200);
      expect(result.response).toEqual({ processed: true });
    });

    it('should replay cached response for duplicate', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'test' },
        headers: { 'idempotency-key': 'dup-key-1' },
      };

      // First call
      await mw(req, async () => ({ processed: true }));

      // Second call (duplicate)
      const result = await mw(req, async () => ({ processed: true }));
      expect(result.status).toBe(200);
      expect(result.headers?.['x-idempotent-replayed']).toBe('true');
    });

    it('should use x-idempotency-key header', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'test' },
        headers: { 'x-idempotency-key': 'x-key-1' },
      };

      const result = await mw(req, async () => ({ ok: true }));
      expect(result.status).toBe(200);
    });

    it('should generate key from body when no header', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'auto-key' },
        headers: {} as Record<string, string>,
      };

      const result = await mw(req, async () => ({ ok: true }));
      expect(result.status).toBe(200);
    });

    it('should return 409 when lock cannot be acquired', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'test' },
        headers: { 'idempotency-key': 'conflict-key' },
      };

      // Start processing to hold the lock
      const key = `idempotency:conflict-key`;
      await store.acquire(key, 60000);

      const result = await mw(req, async () => ({ ok: true }));
      expect(result.status).toBe(409);
    });

    it('should return 500 when handler throws', async () => {
      const mw = middleware.middleware();
      const req = {
        body: { event: 'test' },
        headers: { 'idempotency-key': 'error-key' },
      };

      const result = await mw(req, async () => {
        throw new Error('Handler error');
      });

      expect(result.status).toBe(500);
      expect((result.response as any).error).toBe('Handler error');
    });
  });

  describe('cleanup', () => {
    it('should clean up old entries manually', async () => {
      const entry: IdempotencyEntry = {
        key: 'old-entry',
        status: 'completed',
        createdAt: new Date(Date.now() - 999999999),
        attempts: 1,
      };
      await store.set('old-entry', entry);

      const removed = await middleware.cleanup();
      expect(removed).toBe(1);
    });
  });

  describe('getEntry/deleteEntry', () => {
    it('should get an entry by key', async () => {
      await middleware.startProcessing('get-test');
      const entry = await middleware.getEntry('get-test');
      expect(entry).toBeDefined();
    });

    it('should delete an entry by key', async () => {
      await middleware.startProcessing('delete-test');
      const deleted = await middleware.deleteEntry('delete-test');
      expect(deleted).toBe(true);
    });
  });

  describe('stopCleanup', () => {
    it('should stop the cleanup timer', () => {
      // Create middleware with cleanup enabled
      const mw = new IdempotencyMiddleware(store, { cleanupIntervalMs: 60000 });
      mw.stopCleanup(); // Should not throw
      mw.stopCleanup(); // Calling again should also not throw
    });
  });

  describe('constructor with cleanup enabled', () => {
    it('should start cleanup timer when cleanupIntervalMs > 0', () => {
      const mw = new IdempotencyMiddleware(store, { cleanupIntervalMs: 60000 });
      // Clean up
      mw.stopCleanup();
    });

    it('should use default store when none provided', () => {
      const mw = new IdempotencyMiddleware(undefined, { cleanupIntervalMs: 0 });
      expect(mw).toBeDefined();
      mw.stopCleanup();
    });
  });
});

describe('Factory Functions', () => {
  describe('createIdempotencyMiddleware', () => {
    it('should create a middleware instance', () => {
      const mw = createIdempotencyMiddleware(undefined, { cleanupIntervalMs: 0 });
      expect(mw).toBeDefined();
      expect(mw).toBeInstanceOf(IdempotencyMiddleware);
      mw.stopCleanup();
    });

    it('should accept custom store', () => {
      const store = createInMemoryStore();
      const mw = createIdempotencyMiddleware(store, { cleanupIntervalMs: 0 });
      expect(mw).toBeDefined();
      mw.stopCleanup();
    });
  });

  describe('createInMemoryStore', () => {
    it('should create an InMemoryIdempotencyStore instance', () => {
      const store = createInMemoryStore();
      expect(store).toBeDefined();
      expect(store).toBeInstanceOf(InMemoryIdempotencyStore);
    });
  });

  describe('createWebhookIdempotencyKey', () => {
    it('should create a deterministic key', () => {
      const key1 = createWebhookIdempotencyKey('stripe', 'evt_123');
      const key2 = createWebhookIdempotencyKey('stripe', 'evt_123');
      expect(key1).toBe(key2);
    });

    it('should include event type in key', () => {
      const key1 = createWebhookIdempotencyKey('stripe', 'evt_123');
      const key2 = createWebhookIdempotencyKey('stripe', 'evt_123', 'invoice.paid');
      expect(key1).not.toBe(key2);
    });

    it('should handle undefined event type', () => {
      const key = createWebhookIdempotencyKey('stripe', 'evt_123', undefined);
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBe(32);
    });
  });
});
