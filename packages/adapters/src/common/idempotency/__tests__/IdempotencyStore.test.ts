/**
 * IdempotencyStore Tests
 *
 * Tests for InMemoryIdempotencyStore implementation.
 * Covers all public methods: get, set, delete, cleanup, clear, size.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryIdempotencyStore, type IdempotencyRecord } from '../IdempotencyStore';

function createRecord(overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord {
  return {
    key: 'test-key',
    operation: 'create',
    resourceId: 'resource-1',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60000), // 1 minute from now
    ...overrides,
  };
}

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  describe('set', () => {
    it('should store a record', async () => {
      const record = createRecord();
      await store.set(record);
      expect(store.size()).toBe(1);
    });

    it('should overwrite an existing record with the same key', async () => {
      const record1 = createRecord({ result: 'success' });
      const record2 = createRecord({ result: 'failure' });

      await store.set(record1);
      await store.set(record2);

      expect(store.size()).toBe(1);
      const retrieved = await store.get('test-key');
      expect(retrieved?.result).toBe('failure');
    });
  });

  describe('get', () => {
    it('should return null for a non-existent key', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return a stored record', async () => {
      const record = createRecord({
        key: 'my-key',
        operation: 'update',
        resourceId: 'resource-42',
        externalId: 'ext-123',
        result: 'success',
        data: { foo: 'bar' },
      });

      await store.set(record);
      const result = await store.get('my-key');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('my-key');
      expect(result!.operation).toBe('update');
      expect(result!.resourceId).toBe('resource-42');
      expect(result!.externalId).toBe('ext-123');
      expect(result!.result).toBe('success');
      expect(result!.data).toEqual({ foo: 'bar' });
    });

    it('should return null for an expired record', async () => {
      const record = createRecord({
        key: 'expired-key',
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      });

      await store.set(record);
      const result = await store.get('expired-key');

      expect(result).toBeNull();
    });

    it('should delete the expired record from the store when accessed', async () => {
      const record = createRecord({
        key: 'expired-key',
        expiresAt: new Date(Date.now() - 1000),
      });

      await store.set(record);
      expect(store.size()).toBe(1);

      await store.get('expired-key');
      expect(store.size()).toBe(0);
    });

    it('should return a record that has not yet expired', async () => {
      const record = createRecord({
        key: 'valid-key',
        expiresAt: new Date(Date.now() + 60000),
      });

      await store.set(record);
      const result = await store.get('valid-key');

      expect(result).not.toBeNull();
      expect(result!.key).toBe('valid-key');
    });
  });

  describe('delete', () => {
    it('should remove a record from the store', async () => {
      const record = createRecord({ key: 'to-delete' });
      await store.set(record);

      expect(store.size()).toBe(1);
      await store.delete('to-delete');
      expect(store.size()).toBe(0);
    });

    it('should not throw when deleting a non-existent key', async () => {
      await expect(store.delete('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove records expired before the given date', async () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 10000);
      const futureExpiry = new Date(now.getTime() + 60000);

      await store.set(createRecord({ key: 'expired-1', expiresAt: pastExpiry }));
      await store.set(createRecord({ key: 'expired-2', expiresAt: pastExpiry }));
      await store.set(createRecord({ key: 'valid-1', expiresAt: futureExpiry }));

      const removed = await store.cleanup(now);

      expect(removed).toBe(2);
      expect(store.size()).toBe(1);
      expect(await store.get('valid-1')).not.toBeNull();
    });

    it('should return 0 when no records are expired', async () => {
      const futureExpiry = new Date(Date.now() + 60000);

      await store.set(createRecord({ key: 'valid-1', expiresAt: futureExpiry }));
      await store.set(createRecord({ key: 'valid-2', expiresAt: futureExpiry }));

      const removed = await store.cleanup(new Date(Date.now() - 60000));
      expect(removed).toBe(0);
      expect(store.size()).toBe(2);
    });

    it('should return 0 for an empty store', async () => {
      const removed = await store.cleanup(new Date());
      expect(removed).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all records from the store', async () => {
      await store.set(createRecord({ key: 'key-1' }));
      await store.set(createRecord({ key: 'key-2' }));
      await store.set(createRecord({ key: 'key-3' }));

      expect(store.size()).toBe(3);
      store.clear();
      expect(store.size()).toBe(0);
    });

    it('should not throw when clearing an empty store', () => {
      expect(() => store.clear()).not.toThrow();
    });
  });

  describe('size', () => {
    it('should return 0 for an empty store', () => {
      expect(store.size()).toBe(0);
    });

    it('should return the correct count after insertions', async () => {
      await store.set(createRecord({ key: 'a' }));
      await store.set(createRecord({ key: 'b' }));
      expect(store.size()).toBe(2);
    });

    it('should reflect deletions', async () => {
      await store.set(createRecord({ key: 'a' }));
      await store.set(createRecord({ key: 'b' }));
      await store.delete('a');
      expect(store.size()).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle records with error field', async () => {
      const record = createRecord({
        key: 'error-record',
        result: 'failure',
        error: 'Something went wrong',
      });

      await store.set(record);
      const retrieved = await store.get('error-record');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.result).toBe('failure');
      expect(retrieved!.error).toBe('Something went wrong');
    });

    it('should handle records without optional fields', async () => {
      const record: IdempotencyRecord = {
        key: 'minimal-record',
        operation: 'read',
        resourceId: 'res-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
      };

      await store.set(record);
      const retrieved = await store.get('minimal-record');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.externalId).toBeUndefined();
      expect(retrieved!.result).toBeUndefined();
      expect(retrieved!.error).toBeUndefined();
      expect(retrieved!.data).toBeUndefined();
    });

    it('should handle many records without issues', async () => {
      for (let i = 0; i < 100; i++) {
        await store.set(createRecord({ key: `key-${i}` }));
      }
      expect(store.size()).toBe(100);

      const record = await store.get('key-50');
      expect(record).not.toBeNull();
    });
  });
});
