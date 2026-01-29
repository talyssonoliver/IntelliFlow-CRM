import { CachePort } from '@intelliflow/application';

/**
 * In-Memory Cache
 * Simple cache for testing and development
 * For production, use Redis
 */
interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
}

export class InMemoryCache implements CachePort {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) return null;

    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    };

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  // Test helper
  size(): number {
    return this.cache.size;
  }
}
