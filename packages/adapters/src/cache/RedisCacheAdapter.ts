import type { CachePort } from '@intelliflow/application';

/**
 * Minimal Redis client shape used by RedisCacheAdapter.
 * Matches ioredis's Redis class for the methods we call. Tests can pass a
 * hand-rolled mock without pulling in ioredis. Production passes an
 * ioredis.Redis instance.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  scan(cursor: string | number, ...args: (string | number)[]): Promise<[string, string[]]>;
}

export interface RedisCacheAdapterOptions {
  keyPrefix?: string;
  onError?: (op: string, key: string, err: unknown) => void;
}

export class RedisCacheAdapter implements CachePort {
  private readonly prefix: string;

  constructor(
    private readonly redis: RedisLike,
    private readonly opts: RedisCacheAdapterOptions = {}
  ) {
    this.prefix = opts.keyPrefix ?? '';
  }

  private applyPrefix(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.applyPrefix(key);
    try {
      const raw = await this.redis.get(fullKey);
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch (err) {
        this.opts.onError?.('get.parse', fullKey, err);
        return null;
      }
    } catch (err) {
      this.opts.onError?.('get', fullKey, err);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.applyPrefix(key);
    let serialised: string;
    try {
      serialised = JSON.stringify(value);
    } catch (err) {
      this.opts.onError?.('set.stringify', fullKey, err);
      return;
    }
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await this.redis.setex(fullKey, ttlSeconds, serialised);
      } else {
        await this.redis.set(fullKey, serialised);
      }
    } catch (err) {
      this.opts.onError?.('set', fullKey, err);
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.applyPrefix(key);
    try {
      await this.redis.del(fullKey);
    } catch (err) {
      this.opts.onError?.('delete', fullKey, err);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.applyPrefix(key);
    try {
      const result = await this.redis.exists(fullKey);
      return result > 0;
    } catch (err) {
      this.opts.onError?.('exists', fullKey, err);
      return false;
    }
  }

  /**
   * Clear all keys matching the configured prefix.
   * Uses SCAN cursor loop + DEL in batches. NEVER calls FLUSHDB because
   * Redis is shared with BullMQ queues.
   */
  async clear(): Promise<void> {
    const pattern = `${this.prefix}*`;
    let cursor: string | number = '0';
    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        cursor = nextCursor;
      } while (String(cursor) !== '0');
    } catch (err) {
      this.opts.onError?.('clear', pattern, err);
    }
  }
}
