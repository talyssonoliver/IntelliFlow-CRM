import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryCache } from '../src/external/InMemoryCache';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set() and get()', () => {
    it('should set and retrieve string value', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get<string>('key1');

      expect(result).toBe('value1');
    });

    it('should set and retrieve number value', async () => {
      await cache.set('key1', 42);
      const result = await cache.get<number>('key1');

      expect(result).toBe(42);
    });

    it('should set and retrieve boolean value', async () => {
      await cache.set('key1', true);
      const result = await cache.get<boolean>('key1');

      expect(result).toBe(true);
    });

    it('should set and retrieve object value', async () => {
      const obj = { name: 'John', age: 30 };
      await cache.set('key1', obj);
      const result = await cache.get<typeof obj>('key1');

      expect(result).toEqual(obj);
    });

    it('should set and retrieve array value', async () => {
      const arr = [1, 2, 3, 4, 5];
      await cache.set('key1', arr);
      const result = await cache.get<typeof arr>('key1');

      expect(result).toEqual(arr);
    });

    it('should set and retrieve null value', async () => {
      await cache.set('key1', null);
      const result = await cache.get('key1');

      expect(result).toBe(null);
    });

    it('should set and retrieve undefined value', async () => {
      await cache.set('key1', undefined);
      const result = await cache.get('key1');

      expect(result).toBe(undefined);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent');

      expect(result).toBe(null);
    });

    it('should overwrite existing value', async () => {
      await cache.set('key1', 'original');
      await cache.set('key1', 'updated');
      const result = await cache.get<string>('key1');

      expect(result).toBe('updated');
    });

    it('should handle empty string key', async () => {
      await cache.set('', 'value');
      const result = await cache.get<string>('');

      expect(result).toBe('value');
    });

    it('should handle empty string value', async () => {
      await cache.set('key1', '');
      const result = await cache.get<string>('key1');

      expect(result).toBe('');
    });

    it('should handle zero as value', async () => {
      await cache.set('key1', 0);
      const result = await cache.get<number>('key1');

      expect(result).toBe(0);
    });

    it('should handle false as value', async () => {
      await cache.set('key1', false);
      const result = await cache.get<boolean>('key1');

      expect(result).toBe(false);
    });

    it('should store multiple keys independently', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      expect(await cache.get<string>('key1')).toBe('value1');
      expect(await cache.get<string>('key2')).toBe('value2');
      expect(await cache.get<string>('key3')).toBe('value3');
    });
  });

  describe('TTL expiration', () => {
    it('should set value with TTL and retrieve before expiration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 10); // 10 seconds TTL

      // Advance time by 5 seconds (before expiration)
      vi.setSystemTime(now + 5000);

      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });

    it('should return null after TTL expires', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5); // 5 seconds TTL

      // Advance time by 6 seconds (after expiration)
      vi.setSystemTime(now + 6000);

      const result = await cache.get('key1');
      expect(result).toBe(null);
    });

    it('should delete expired entry from cache on get', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      expect(cache.size()).toBe(1);

      // Advance time past expiration
      vi.setSystemTime(now + 6000);

      await cache.get('key1');

      // Entry should be deleted
      expect(cache.size()).toBe(0);
    });

    it('should handle exact TTL expiration boundary', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5); // 5 seconds TTL

      // At exact expiration time
      vi.setSystemTime(now + 5000);

      // Should still be valid (expiry is checked with <, not <=)
      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });

    it('should handle entry just past expiration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      // 1ms past expiration
      vi.setSystemTime(now + 5001);

      const result = await cache.get('key1');
      expect(result).toBe(null);
    });

    it('should not expire entries without TTL', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1'); // No TTL

      // Advance time significantly
      vi.setSystemTime(now + 1000000000);

      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });

    it('should handle zero TTL as no expiration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 0);

      vi.setSystemTime(now + 1000000);

      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });

    it('should handle negative TTL as immediate expiration', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', -10);

      const result = await cache.get<string>('key1');
      expect(result).toBe(null); // Negative TTL creates expiration in the past
    });

    it('should handle different TTLs for different keys', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);
      await cache.set('key2', 'value2', 10);

      // After 6 seconds, key1 expires but key2 doesn't
      vi.setSystemTime(now + 6000);

      expect(await cache.get('key1')).toBe(null);
      expect(await cache.get<string>('key2')).toBe('value2');
    });

    it('should update TTL when overwriting key', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      // Overwrite with longer TTL
      vi.setSystemTime(now + 3000);
      await cache.set('key1', 'value2', 10);

      // After original expiration time
      vi.setSystemTime(now + 6000);

      const result = await cache.get<string>('key1');
      expect(result).toBe('value2'); // Should still exist with new TTL
    });

    it('should handle very large TTL values', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 999999999);

      vi.setSystemTime(now + 1000000);

      const result = await cache.get<string>('key1');
      expect(result).toBe('value1');
    });
  });

  describe('delete()', () => {
    it('should delete existing key', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');

      const result = await cache.get('key1');
      expect(result).toBe(null);
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(cache.delete('non-existent')).resolves.toBeUndefined();
    });

    it('should delete only specified key', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.delete('key1');

      expect(await cache.get('key1')).toBe(null);
      expect(await cache.get<string>('key2')).toBe('value2');
    });

    it('should reduce cache size after deletion', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      expect(cache.size()).toBe(2);

      await cache.delete('key1');

      expect(cache.size()).toBe(1);
    });

    it('should handle deleting same key multiple times', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      await cache.delete('key1');
      await cache.delete('key1');

      expect(cache.size()).toBe(0);
    });
  });

  describe('exists()', () => {
    it('should return true for existing key', async () => {
      await cache.set('key1', 'value1');

      const result = await cache.exists('key1');
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const result = await cache.exists('non-existent');
      expect(result).toBe(false);
    });

    it('should return false for expired key', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      vi.setSystemTime(now + 6000);

      const result = await cache.exists('key1');
      expect(result).toBe(false);
    });

    it('should delete expired entry when checking existence', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      expect(cache.size()).toBe(1);

      vi.setSystemTime(now + 6000);

      await cache.exists('key1');

      expect(cache.size()).toBe(0);
    });

    it('should return true for key with null value', async () => {
      await cache.set('key1', null);

      const result = await cache.exists('key1');
      expect(result).toBe(true);
    });

    it('should return true for key with undefined value', async () => {
      await cache.set('key1', undefined);

      const result = await cache.exists('key1');
      expect(result).toBe(true);
    });

    it('should return false after deletion', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');

      const result = await cache.exists('key1');
      expect(result).toBe(false);
    });

    it('should check multiple keys independently', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      expect(await cache.exists('key1')).toBe(true);
      expect(await cache.exists('key2')).toBe(true);
      expect(await cache.exists('key3')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      await cache.clear();

      expect(await cache.get('key1')).toBe(null);
      expect(await cache.get('key2')).toBe(null);
      expect(await cache.get('key3')).toBe(null);
    });

    it('should set size to zero after clear', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.clear();

      expect(cache.size()).toBe(0);
    });

    it('should not throw when clearing empty cache', async () => {
      await expect(cache.clear()).resolves.toBeUndefined();
    });

    it('should allow adding entries after clear', async () => {
      await cache.set('key1', 'value1');
      await cache.clear();
      await cache.set('key2', 'value2');

      expect(await cache.get('key2')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should clear entries with TTL', async () => {
      await cache.set('key1', 'value1', 10);
      await cache.set('key2', 'value2', 20);

      await cache.clear();

      expect(cache.size()).toBe(0);
    });
  });

  describe('size()', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0);
    });

    it('should return correct size after adding entries', async () => {
      await cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      await cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      await cache.set('key3', 'value3');
      expect(cache.size()).toBe(3);
    });

    it('should not increase size when overwriting key', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key1', 'value2');

      expect(cache.size()).toBe(1);
    });

    it('should decrease size after deletion', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.delete('key1');

      expect(cache.size()).toBe(1);
    });

    it('should reflect automatic deletion of expired entries', async () => {
      const now = Date.now();
      vi.setSystemTime(now);

      await cache.set('key1', 'value1', 5);

      expect(cache.size()).toBe(1);

      vi.setSystemTime(now + 6000);

      await cache.get('key1'); // Triggers deletion

      expect(cache.size()).toBe(0);
    });
  });

  describe('type safety', () => {
    it('should preserve type information for different value types', async () => {
      await cache.set('string', 'text');
      await cache.set('number', 123);
      await cache.set('boolean', true);
      await cache.set('object', { key: 'value' });

      const str = await cache.get<string>('string');
      const num = await cache.get<number>('number');
      const bool = await cache.get<boolean>('boolean');
      const obj = await cache.get<{ key: string }>('object');

      expect(typeof str).toBe('string');
      expect(typeof num).toBe('number');
      expect(typeof bool).toBe('boolean');
      expect(typeof obj).toBe('object');
    });

    it('should handle complex nested objects', async () => {
      const complex = {
        user: {
          id: 123,
          name: 'John',
          tags: ['admin', 'user'],
          meta: {
            created: new Date(),
            active: true,
          },
        },
      };

      await cache.set('complex', complex);
      const result = await cache.get<typeof complex>('complex');

      expect(result).toEqual(complex);
    });
  });

  describe('isolation and test helpers', () => {
    it('should provide independent cache instances', async () => {
      const cache1 = new InMemoryCache();
      const cache2 = new InMemoryCache();

      await cache1.set('key1', 'value1');
      await cache2.set('key1', 'value2');

      expect(await cache1.get('key1')).toBe('value1');
      expect(await cache2.get('key1')).toBe('value2');
    });

    it('should allow clearing cache between tests', async () => {
      await cache.set('key1', 'value1');
      await cache.clear();

      expect(cache.size()).toBe(0);
      expect(await cache.get('key1')).toBe(null);
    });

    it('should maintain state across multiple operations', async () => {
      await cache.set('counter', 0);

      for (let i = 1; i <= 5; i++) {
        const current = (await cache.get<number>('counter')) ?? 0;
        await cache.set('counter', current + 1);
      }

      const final = await cache.get<number>('counter');
      expect(final).toBe(5);
    });
  });
});
