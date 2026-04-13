import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisCacheAdapter, type RedisLike } from '../RedisCacheAdapter';

function createMockRedis(): RedisLike & Record<string, any> {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    exists: vi.fn().mockResolvedValue(0),
    scan: vi.fn().mockResolvedValue(['0', []]),
  };
}

describe('RedisCacheAdapter', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let onError: ReturnType<typeof vi.fn>;
  let adapter: RedisCacheAdapter;

  beforeEach(() => {
    redis = createMockRedis();
    onError = vi.fn();
    adapter = new RedisCacheAdapter(redis, { keyPrefix: 'ifc:', onError });
  });

  describe('get', () => {
    it('returns parsed value when redis returns JSON string', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }));
      const result = await adapter.get<{ foo: string }>('summary:t1:u1');
      expect(result).toEqual({ foo: 'bar' });
      expect(redis.get).toHaveBeenCalledWith('ifc:summary:t1:u1');
    });

    it('returns null when redis returns null', async () => {
      redis.get.mockResolvedValueOnce(null);
      expect(await adapter.get('missing')).toBeNull();
    });

    it('returns null and fires onError on malformed JSON', async () => {
      redis.get.mockResolvedValueOnce('not-json{');
      expect(await adapter.get('bad')).toBeNull();
      expect(onError).toHaveBeenCalledWith('get.parse', 'ifc:bad', expect.any(Error));
    });

    it('returns null and fires onError when redis.get throws', async () => {
      redis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(await adapter.get('x')).toBeNull();
      expect(onError).toHaveBeenCalledWith('get', 'ifc:x', expect.any(Error));
    });
  });

  describe('set', () => {
    it('calls setex with ttlSeconds when provided', async () => {
      await adapter.set('k', { a: 1 }, 60);
      expect(redis.setex).toHaveBeenCalledWith('ifc:k', 60, JSON.stringify({ a: 1 }));
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('calls set (no TTL) when ttlSeconds omitted', async () => {
      await adapter.set('k', 'value');
      expect(redis.set).toHaveBeenCalledWith('ifc:k', JSON.stringify('value'));
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('calls set when ttlSeconds is zero', async () => {
      await adapter.set('k', 'v', 0);
      expect(redis.set).toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('swallows error when serialisation fails (circular ref)', async () => {
      const circular: any = {};
      circular.self = circular;
      await adapter.set('k', circular);
      expect(onError).toHaveBeenCalledWith('set.stringify', 'ifc:k', expect.any(Error));
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('swallows error when redis.setex throws', async () => {
      redis.setex.mockRejectedValueOnce(new Error('timeout'));
      await expect(adapter.set('k', 'v', 60)).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith('set', 'ifc:k', expect.any(Error));
    });
  });

  describe('delete', () => {
    it('calls del with prefixed key', async () => {
      await adapter.delete('home:summary:t1:u1');
      expect(redis.del).toHaveBeenCalledWith('ifc:home:summary:t1:u1');
    });

    it('swallows error when redis.del throws', async () => {
      redis.del.mockRejectedValueOnce(new Error('down'));
      await expect(adapter.delete('x')).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith('delete', 'ifc:x', expect.any(Error));
    });
  });

  describe('exists', () => {
    it('returns true when exists returns 1', async () => {
      redis.exists.mockResolvedValueOnce(1);
      expect(await adapter.exists('k')).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith('ifc:k');
    });

    it('returns false when exists returns 0', async () => {
      redis.exists.mockResolvedValueOnce(0);
      expect(await adapter.exists('k')).toBe(false);
    });

    it('returns false and fires onError when exists throws', async () => {
      redis.exists.mockRejectedValueOnce(new Error('down'));
      expect(await adapter.exists('k')).toBe(false);
      expect(onError).toHaveBeenCalledWith('exists', 'ifc:k', expect.any(Error));
    });
  });

  describe('clear', () => {
    it('uses SCAN cursor loop and DEL (never FLUSHDB)', async () => {
      redis.scan
        .mockResolvedValueOnce(['3', ['ifc:a', 'ifc:b']])
        .mockResolvedValueOnce(['0', ['ifc:c']]);

      await adapter.clear();

      expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'ifc:*', 'COUNT', 100);
      expect(redis.scan).toHaveBeenCalledWith('3', 'MATCH', 'ifc:*', 'COUNT', 100);
      expect(redis.del).toHaveBeenCalledWith('ifc:a', 'ifc:b');
      expect(redis.del).toHaveBeenCalledWith('ifc:c');
      expect((redis as any).flushdb).toBeUndefined();
    });

    it('handles empty scan batches without calling del', async () => {
      redis.scan.mockResolvedValueOnce(['0', []]);
      await adapter.clear();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('swallows error and fires onError when scan throws', async () => {
      redis.scan.mockRejectedValueOnce(new Error('down'));
      await expect(adapter.clear()).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith('clear', 'ifc:*', expect.any(Error));
    });
  });

  describe('keyPrefix', () => {
    it('applies empty prefix when not provided', async () => {
      const bare = new RedisCacheAdapter(redis, {});
      await bare.delete('foo');
      expect(redis.del).toHaveBeenCalledWith('foo');
    });
  });
});
