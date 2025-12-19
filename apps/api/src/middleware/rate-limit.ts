/**
 * Rate Limiting Middleware
 *
 * Protects API endpoints from abuse by limiting request rates.
 * Uses in-memory storage for development.
 * In production, should use Redis (Upstash) for distributed rate limiting.
 */

import { TRPCError } from '@trpc/server';
import { Context } from '../context';

/**
 * Middleware options type for rate limiting middleware
 */
interface RateLimitMiddlewareOpts<TContext> {
  ctx: TContext;
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
}

/**
 * Simple in-memory rate limiter
 * For production, replace with Redis-based solution
 */
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetAt: number }> = new Map();

  /**
   * Check if request should be allowed
   * @param key - Unique identifier (e.g., userId, IP address)
   * @param limit - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if allowed, false if rate limit exceeded
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const record = this.requests.get(key);

    // No previous record or window has expired
    if (!record || now > record.resetAt) {
      this.requests.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    // Increment count
    record.count++;

    // Check if limit exceeded
    if (record.count > limit) {
      return false;
    }

    return true;
  }

  /**
   * Get remaining requests for a key
   */
  async getRemaining(key: string, limit: number): Promise<number> {
    const record = this.requests.get(key);
    if (!record) {
      return limit;
    }

    return Math.max(0, limit - record.count);
  }

  /**
   * Get time until reset
   */
  async getResetTime(key: string): Promise<number | null> {
    const record = this.requests.get(key);
    if (!record) {
      return null;
    }

    return record.resetAt;
  }

  /**
   * Clean up expired records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetAt) {
        this.requests.delete(key);
      }
    }
  }
}

// Global rate limiter instance
const rateLimiter = new InMemoryRateLimiter();

// Clean up expired records every minute
setInterval(() => {
  rateLimiter.cleanup();
}, 60 * 1000);

/**
 * Creates rate limiting middleware
 * Limits requests per user
 * Use with t.middleware() in server.ts
 */
export function createRateLimitMiddleware(
  limit: number = 100,
  windowMs: number = 60 * 1000 // 1 minute
) {
  return async ({ ctx, next }: RateLimitMiddlewareOpts<Context>) => {
    const key = ctx.user?.userId || 'anonymous';

    const allowed = await rateLimiter.checkLimit(key, limit, windowMs);

    if (!allowed) {
      const resetTime = await rateLimiter.getResetTime(key);
      const retryAfter = resetTime ? Math.ceil((resetTime - Date.now()) / 1000) : 60;

      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      });
    }

    return next();
  };
}

/**
 * Creates aggressive rate limiting for sensitive endpoints
 * (e.g., authentication, password reset)
 * Use with t.middleware() in server.ts
 */
export function createStrictRateLimitMiddleware() {
  return createRateLimitMiddleware(10, 60 * 1000); // 10 per minute
}

/**
 * Creates lenient rate limiting for read-only endpoints
 * Use with t.middleware() in server.ts
 */
export function createLenientRateLimitMiddleware() {
  return createRateLimitMiddleware(1000, 60 * 1000); // 1000 per minute
}

/**
 * Redis-based rate limiter (for production)
 * TODO: Implement with Upstash Redis
 */
export class RedisRateLimiter {
  // private redis: Redis;

  constructor() {
    // this.redis = new Redis(process.env.REDIS_URL);
  }

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    // TODO: Implement Redis-based rate limiting
    // Use Redis INCR and EXPIRE commands
    // More efficient and works across multiple instances
    return true;
  }
}
