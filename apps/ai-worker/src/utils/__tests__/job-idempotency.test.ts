/**
 * Job Idempotency Tests (IFC-095 P2)
 *
 * Tests for preventing duplicate prediction job processing.
 * Uses idempotency keys with TTL-based expiration.
 *
 * @see IFC-095: Churn Risk & Next Best Action
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PredictionJobIdempotency,
  generateIdempotencyKey,
  InMemoryIdempotencyStore,
} from '../job-idempotency';

describe('Job Idempotency (IFC-095 P2)', () => {
  let idempotency: PredictionJobIdempotency;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    idempotency = new PredictionJobIdempotency(store);
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK', 'corr-1');
      const key2 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK', 'corr-1');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different entity IDs', () => {
      const key1 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK');
      const key2 = generateIdempotencyKey('lead', 'uuid-2', 'CHURN_RISK');
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different prediction types', () => {
      const key1 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK');
      const key2 = generateIdempotencyKey('lead', 'uuid-1', 'NEXT_BEST_ACTION');
      expect(key1).not.toBe(key2);
    });

    it('should include entity type in key', () => {
      const key = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK');
      expect(key).toContain('lead');
    });

    it('should include entity ID in key', () => {
      const key = generateIdempotencyKey('lead', 'my-entity-uuid', 'CHURN_RISK');
      expect(key).toContain('my-entity-uuid');
    });

    it('should include prediction type in key', () => {
      const key = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK');
      expect(key).toContain('CHURN_RISK');
    });

    it('should handle missing correlation ID', () => {
      const key = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK');
      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(0);
    });

    it('should generate different keys with different correlation IDs', () => {
      const key1 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK', 'corr-1');
      const key2 = generateIdempotencyKey('lead', 'uuid-1', 'CHURN_RISK', 'corr-2');
      expect(key1).not.toBe(key2);
    });
  });

  describe('checkDuplicate', () => {
    it('should return null for new job', async () => {
      const result = await idempotency.checkDuplicate('new-key');
      expect(result).toBeNull();
    });

    it('should return cached result for completed job', async () => {
      const key = 'test-key';
      const cachedResult = { score: 0.5, confidence: 0.8 };

      await idempotency.markProcessing(key);
      await idempotency.storeResult(key, cachedResult);

      const result = await idempotency.checkDuplicate(key);
      expect(result).toEqual(cachedResult);
    });

    it('should return PROCESSING for in-progress job', async () => {
      const key = 'processing-key';
      await idempotency.markProcessing(key);

      const result = await idempotency.checkDuplicate(key);
      expect(result).toBe('PROCESSING');
    });
  });

  describe('markProcessing', () => {
    it('should mark job as processing', async () => {
      const key = 'test-processing';
      await idempotency.markProcessing(key);

      const result = await idempotency.checkDuplicate(key);
      expect(result).toBe('PROCESSING');
    });
  });

  describe('storeResult', () => {
    it('should store job result', async () => {
      const key = 'test-store';
      const result = { score: 0.75, confidence: 0.9 };

      await idempotency.storeResult(key, result);

      const retrieved = await idempotency.checkDuplicate(key);
      expect(retrieved).toEqual(result);
    });

    it('should overwrite processing status with result', async () => {
      const key = 'test-overwrite';
      const result = { score: 0.75, confidence: 0.9 };

      await idempotency.markProcessing(key);
      await idempotency.storeResult(key, result);

      const retrieved = await idempotency.checkDuplicate(key);
      expect(retrieved).toEqual(result);
      expect(retrieved).not.toBe('PROCESSING');
    });
  });

  describe('markFailed', () => {
    it('should remove failed job from store', async () => {
      const key = 'test-failed';

      await idempotency.markProcessing(key);
      await idempotency.markFailed(key);

      const result = await idempotency.checkDuplicate(key);
      expect(result).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire keys after TTL', async () => {
      vi.useFakeTimers();

      const shortTtlStore = new InMemoryIdempotencyStore();
      const shortTtl = new PredictionJobIdempotency(shortTtlStore, { ttlMs: 1000 });

      await shortTtl.storeResult('key', { data: 'test' });

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      const result = await shortTtl.checkDuplicate('key');
      expect(result).toBeNull();

      vi.useRealTimers();
    });

    it('should not expire keys before TTL', async () => {
      vi.useFakeTimers();

      const shortTtlStore = new InMemoryIdempotencyStore();
      const shortTtl = new PredictionJobIdempotency(shortTtlStore, { ttlMs: 2000 });

      await shortTtl.storeResult('key', { data: 'test' });

      // Advance time but not past TTL
      vi.advanceTimersByTime(1500);

      const result = await shortTtl.checkDuplicate('key');
      expect(result).toEqual({ data: 'test' });

      vi.useRealTimers();
    });
  });

  describe('InMemoryIdempotencyStore', () => {
    it('should implement get correctly', async () => {
      await store.set('test-key', {
        status: 'COMPLETED',
        result: { data: 'test' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });

      const entry = await store.get('test-key');
      expect(entry).not.toBeNull();
      expect(entry?.status).toBe('COMPLETED');
    });

    it('should implement delete correctly', async () => {
      await store.set('test-key', {
        status: 'PROCESSING',
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      });

      await store.delete('test-key');

      const entry = await store.get('test-key');
      expect(entry).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const entry = await store.get('non-existent');
      expect(entry).toBeNull();
    });

    it('should clean up expired entries on get', async () => {
      vi.useFakeTimers();

      await store.set('expired-key', {
        status: 'COMPLETED',
        result: { data: 'old' },
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000,
      });

      vi.advanceTimersByTime(2000);

      const entry = await store.get('expired-key');
      expect(entry).toBeNull();

      vi.useRealTimers();
    });
  });
});
