import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IdempotencyManager, calculateContentHash, DEFAULT_IDEMPOTENCY_CONFIG } from '../IdempotencyManager';
import { InMemoryIdempotencyStore } from '../IdempotencyStore';

describe('IdempotencyManager', () => {
  let store: InMemoryIdempotencyStore;
  let manager: IdempotencyManager;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    manager = new IdempotencyManager(store, 'test-provider');
  });

  describe('generateKey', () => {
    it('deterministic', () => {
      const k1 = manager.generateKey('res-1', 'create');
      const k2 = manager.generateKey('res-1', 'create');
      expect(k1).toBe(k2);
      expect(k1).toMatch(/^idem_[a-f0-9]{16}/);
    });
    it('different for different resources', () => {
      expect(manager.generateKey('r1', 'create')).not.toBe(manager.generateKey('r2', 'create'));
    });
    it('different for different ops', () => {
      expect(manager.generateKey('r1', 'create')).not.toBe(manager.generateKey('r1', 'update'));
    });
  });

  describe('generateContentKey', () => {
    it('includes content hash', () => {
      expect(manager.generateContentKey('r1', 'up', 'h1')).not.toBe(manager.generateContentKey('r1', 'up', 'h2'));
    });
    it('deterministic', () => {
      expect(manager.generateContentKey('r1', 'up', 'h1')).toBe(manager.generateContentKey('r1', 'up', 'h1'));
    });
  });

  describe('checkDuplicate', () => {
    it('false for new key', async () => {
      const r = await manager.checkDuplicate('new');
      expect(r.isDuplicate).toBe(false);
      expect(r.previousResult).toBeUndefined();
    });
    it('true after recording', async () => {
      await manager.recordSuccess('k', 'r', 'op');
      const r = await manager.checkDuplicate('k');
      expect(r.isDuplicate).toBe(true);
      expect(r.previousResult!.result).toBe('success');
    });
  });

  describe('recordSuccess', () => {
    it('stores with options', async () => {
      await manager.recordSuccess('k', 'r', 'op', { externalId: 'e1', data: { x: 1 } });
      const r = await manager.checkDuplicate('k');
      expect(r.previousResult!.externalId).toBe('e1');
      expect(r.previousResult!.data).toEqual({ x: 1 });
    });
    it('sets TTL', async () => {
      await manager.recordSuccess('k', 'r', 'op');
      const rec = await store.get('k');
      expect(rec!.expiresAt.getTime()).toBe(rec!.createdAt.getTime() + DEFAULT_IDEMPOTENCY_CONFIG.ttlMinutes * 60 * 1000);
    });
  });

  describe('recordFailure', () => {
    it('stores error', async () => {
      await manager.recordFailure('k', 'r', 'op', 'err msg');
      const r = await manager.checkDuplicate('k');
      expect(r.previousResult!.result).toBe('failure');
      expect(r.previousResult!.error).toBe('err msg');
    });
    it('uses failure TTL', async () => {
      await manager.recordFailure('k', 'r', 'op', 'e');
      const rec = await store.get('k');
      expect(rec!.expiresAt.getTime()).toBe(rec!.createdAt.getTime() + DEFAULT_IDEMPOTENCY_CONFIG.failureTtlMinutes * 60 * 1000);
    });
  });

  describe('clearRecord', () => {
    it('removes', async () => {
      await manager.recordSuccess('k', 'r', 'op');
      await manager.clearRecord('k');
      expect((await manager.checkDuplicate('k')).isDuplicate).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('delegates to store', async () => {
      const spy = vi.spyOn(store, 'cleanup');
      await manager.cleanup();
      expect(spy).toHaveBeenCalledWith(expect.any(Date));
    });
  });

  it('custom TTL', async () => {
    const m = new IdempotencyManager(store, 'p', { ttlMinutes: 120 });
    await m.recordSuccess('k', 'r', 'op');
    const rec = await store.get('k');
    expect(rec!.expiresAt.getTime()).toBe(rec!.createdAt.getTime() + 120 * 60 * 1000);
  });
});

describe('calculateContentHash', () => {
  it('consistent', () => { expect(calculateContentHash({a:1})).toBe(calculateContentHash({a:1})); });
  it('different content', () => { expect(calculateContentHash({a:1})).not.toBe(calculateContentHash({a:2})); });
  it('normalizes keys', () => { expect(calculateContentHash({b:2,a:1})).toBe(calculateContentHash({a:1,b:2})); });
  it('16-char hex', () => { expect(calculateContentHash({x:'y'})).toMatch(/^[a-f0-9]{16}/); });
});
