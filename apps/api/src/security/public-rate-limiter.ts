/**
 * Public Rate Limiter — PG-126
 *
 * In-memory TTL LRU rate limiter for anonymous public endpoints.
 *
 * Scope: Sprint 17 ships a single-process limiter. Multi-worker / Redis-
 * backed rate limiting is deferred (see ADR-051 + PG-126 spec Out of Scope).
 *
 * Keys are hashed with sha256(ip + salt) so raw IPs never reach persistence
 * or logs.
 */
import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';

export interface PublicRateLimiterOptions {
  /** Max number of keys retained before LRU eviction. Default 10_000. */
  capacity?: number;
  /** Window in milliseconds. Default 10 * 60 * 1000 (10 min). */
  windowMs?: number;
  /**
   * Injected clock for tests. Returns milliseconds since epoch.
   * Defaults to Date.now.
   */
  now?: () => number;
}

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

/**
 * TTL LRU rate limiter — one hit per window per key.
 *
 * check() throws TRPCError('TOO_MANY_REQUESTS') when a key is still within
 * its window; otherwise it records the new timestamp and returns.
 */
export class PublicRateLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  // Map preserves insertion order, giving us O(1) LRU eviction.
  private readonly hits = new Map<string, number>();

  constructor(options: PublicRateLimiterOptions = {}) {
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** Deterministic IP hash. Raw IP never persists. */
  static hashIp(ip: string, salt: string): string {
    return createHash('sha256').update(`${ip}|${salt}`, 'utf8').digest('hex');
  }

  /**
   * Record a hit for `key`. Throws TRPCError TOO_MANY_REQUESTS if the key is
   * still within its window. Evicts oldest when over capacity.
   */
  check(key: string): void {
    const now = this.now();
    const previous = this.hits.get(key);

    if (previous !== undefined && now - previous < this.windowMs) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please try again in a few minutes.',
      });
    }

    // Refresh position / insert.
    if (previous !== undefined) {
      this.hits.delete(key);
    }
    this.hits.set(key, now);

    // LRU eviction — oldest first.
    if (this.hits.size > this.capacity) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
  }

  /** Clear all state — exposed for tests. */
  reset(): void {
    this.hits.clear();
  }
}

/**
 * Singleton limiter for the public-feedback endpoint. Constructed once per
 * process and reused across requests.
 */
export const publicFeedbackLimiter = new PublicRateLimiter();
