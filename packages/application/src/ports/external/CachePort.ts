/**
 * Cache Port
 * Defines the contract for caching
 * Implementation lives in adapters layer (Redis, in-memory, etc.)
 */

export interface CachePort {
  /**
   * Get a value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists
   */
  exists(key: string): Promise<boolean>;

  /**
   * Clear all cache
   */
  clear(): Promise<void>;
}
