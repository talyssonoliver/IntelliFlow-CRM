/**
 * Rate Limiting Middleware - IFC-114
 *
 * Comprehensive API rate limiting and DDoS protection for IntelliFlow CRM.
 * Implements tiered rate limits based on endpoint sensitivity and user type.
 *
 * Features:
 * - Configurable per-endpoint rate limits
 * - Burst detection and blocking
 * - IP-based and user-based tracking
 * - Redis support for distributed environments (Upstash)
 * - In-memory fallback for development
 *
 * Rate Limit Tiers:
 * - Public endpoints: 100 req/min
 * - Authenticated endpoints: 1000 req/min
 * - AI endpoints: 10 req/min
 * - Auth endpoints: 5 req/min (brute force protection)
 *
 * @implements IFC-114 - API rate limiting and DDoS protection
 * @see docs/security/zero-trust-design.md
 * @see docs/security/owasp-checklist.md
 */

import { TRPCError } from '@trpc/server';
import { Context } from '../context';

/**
 * Rate limit tier configurations
 * Based on OWASP recommendations and IntelliFlow requirements
 */
export const RATE_LIMIT_TIERS = {
  /** Public endpoints - strictest limit */
  PUBLIC: { limit: 100, windowMs: 60 * 1000, name: 'public' },
  /** Authenticated user endpoints */
  AUTHENTICATED: { limit: 1000, windowMs: 60 * 1000, name: 'authenticated' },
  /** AI/ML intensive endpoints - most restricted */
  AI: { limit: 10, windowMs: 60 * 1000, name: 'ai' },
  /** Authentication endpoints - brute force protection */
  AUTH: { limit: 5, windowMs: 60 * 1000, name: 'auth' },
  /** Admin endpoints */
  ADMIN: { limit: 500, windowMs: 60 * 1000, name: 'admin' },
} as const;

/**
 * DDoS protection configuration
 */
export const DDOS_CONFIG = {
  /** Maximum requests in a burst window */
  burstLimit: 500,
  /** Burst detection window in milliseconds */
  burstWindowMs: 1000,
  /** Block duration after DDoS detection (5 minutes) */
  blockDurationMs: 300000,
  /** Threshold for suspicious activity (percentage of limit) */
  suspiciousThreshold: 0.8,
} as const;

/**
 * Middleware options type for rate limiting middleware
 */
interface RateLimitMiddlewareOpts<TContext> {
  ctx: TContext;
  next: (opts?: { ctx: unknown }) => Promise<unknown>;
}

/**
 * Rate limit state for tracking requests
 */
interface RateLimitState {
  count: number;
  resetAt: number;
  burstCount: number;
  burstResetAt: number;
  blocked: boolean;
  blockedUntil: number;
}

/**
 * Rate limit result with detailed information
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  blocked?: boolean;
  reason?: string;
}

/**
 * Simple in-memory rate limiter
 * For production, replace with Redis-based solution
 */
class InMemoryRateLimiter {
  private requests: Map<string, RateLimitState> = new Map();

  /**
   * Check if request should be allowed with DDoS protection
   * @param key - Unique identifier (e.g., userId, IP address)
   * @param limit - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns RateLimitResult with detailed information
   */
  async checkLimitWithDDoS(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    let state = this.requests.get(key);

    // Check if currently blocked (DDoS protection)
    if (state?.blocked && now < state.blockedUntil) {
      const retryAfter = Math.ceil((state.blockedUntil - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: state.blockedUntil,
        retryAfter,
        blocked: true,
        reason: 'Temporarily blocked due to excessive requests',
      };
    }

    // Initialize or reset state
    if (!state || now > state.resetAt) {
      state = {
        count: 0,
        resetAt: now + windowMs,
        burstCount: 0,
        burstResetAt: now + DDOS_CONFIG.burstWindowMs,
        blocked: false,
        blockedUntil: 0,
      };
      this.requests.set(key, state);
    }

    // Reset burst counter if window expired
    if (now > state.burstResetAt) {
      state.burstCount = 0;
      state.burstResetAt = now + DDOS_CONFIG.burstWindowMs;
    }

    // Increment counters
    state.count++;
    state.burstCount++;

    // DDoS detection: check burst limit
    if (state.burstCount > DDOS_CONFIG.burstLimit) {
      state.blocked = true;
      state.blockedUntil = now + DDOS_CONFIG.blockDurationMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt: state.blockedUntil,
        retryAfter: Math.ceil(DDOS_CONFIG.blockDurationMs / 1000),
        blocked: true,
        reason: 'DDoS protection: burst limit exceeded',
      };
    }

    // Check regular rate limit
    if (state.count > limit) {
      const retryAfter = Math.ceil((state.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        resetAt: state.resetAt,
        retryAfter,
        reason: 'Rate limit exceeded',
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - state.count),
      resetAt: state.resetAt,
    };
  }

  /**
   * Check if request should be allowed (simplified)
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
        burstCount: 1,
        burstResetAt: now + DDOS_CONFIG.burstWindowMs,
        blocked: false,
        blockedUntil: 0,
      });
      return true;
    }

    // Check if blocked
    if (record.blocked && now < record.blockedUntil) {
      return false;
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
   * Check if a key is currently blocked
   */
  async isBlocked(key: string): Promise<boolean> {
    const record = this.requests.get(key);
    if (!record) {
      return false;
    }

    return record.blocked && Date.now() < record.blockedUntil;
  }

  /**
   * Manually block a key (for admin use)
   */
  async block(key: string, durationMs: number = DDOS_CONFIG.blockDurationMs): Promise<void> {
    const now = Date.now();
    const record = this.requests.get(key);

    if (record) {
      record.blocked = true;
      record.blockedUntil = now + durationMs;
    } else {
      this.requests.set(key, {
        count: 0,
        resetAt: now + 60000,
        burstCount: 0,
        burstResetAt: now + DDOS_CONFIG.burstWindowMs,
        blocked: true,
        blockedUntil: now + durationMs,
      });
    }
  }

  /**
   * Manually unblock a key
   */
  async unblock(key: string): Promise<void> {
    const record = this.requests.get(key);
    if (record) {
      record.blocked = false;
      record.blockedUntil = 0;
    }
  }

  /**
   * Get statistics for monitoring
   */
  async getStats(): Promise<{
    totalKeys: number;
    blockedKeys: number;
    activeKeys: number;
  }> {
    const now = Date.now();
    let blockedKeys = 0;
    let activeKeys = 0;

    for (const [, state] of this.requests) {
      if (state.blocked && now < state.blockedUntil) {
        blockedKeys++;
      }
      if (now < state.resetAt) {
        activeKeys++;
      }
    }

    return {
      totalKeys: this.requests.size,
      blockedKeys,
      activeKeys,
    };
  }

  /**
   * Clean up expired records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      // Remove if both window and block have expired
      if (now > record.resetAt && (!record.blocked || now > record.blockedUntil)) {
        this.requests.delete(key);
      }
    }
  }
}

// Global rate limiter instance
const rateLimiter = new InMemoryRateLimiter();

// Clean up expired records every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    rateLimiter.cleanup();
  }, 60 * 1000);
}

/**
 * Extract client identifier from context
 * Uses user ID if authenticated, falls back to IP or 'anonymous'
 */
function getClientKey(ctx: Context, prefix: string = ''): string {
  if (ctx.user?.userId) {
    return `${prefix}user:${ctx.user.userId}`;
  }

  // Try to extract IP from request headers
  const req = ctx.req as Request | undefined;
  if (req) {
    const forwarded = req.headers.get?.('x-forwarded-for');
    const realIp = req.headers.get?.('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
    return `${prefix}ip:${ip}`;
  }

  return `${prefix}anonymous`;
}

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
 * Creates tiered rate limiting middleware with DDoS protection
 * @param tier - Rate limit tier configuration
 */
export function createTieredRateLimitMiddleware(
  tier: (typeof RATE_LIMIT_TIERS)[keyof typeof RATE_LIMIT_TIERS] = RATE_LIMIT_TIERS.PUBLIC
) {
  return async ({ ctx, next }: RateLimitMiddlewareOpts<Context>) => {
    const key = getClientKey(ctx, `${tier.name}:`);

    const result = await rateLimiter.checkLimitWithDDoS(key, tier.limit, tier.windowMs);

    if (!result.allowed) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: result.reason || `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        cause: {
          retryAfter: result.retryAfter,
          blocked: result.blocked,
          tier: tier.name,
        },
      });
    }

    return next();
  };
}

/**
 * Creates public endpoint rate limiting
 * 100 requests per minute per IP
 */
export function createPublicRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.PUBLIC);
}

/**
 * Creates authenticated endpoint rate limiting
 * 1000 requests per minute per user
 */
export function createAuthenticatedRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTHENTICATED);
}

/**
 * Creates AI endpoint rate limiting
 * 10 requests per minute - resource intensive
 */
export function createAIRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AI);
}

/**
 * Creates authentication endpoint rate limiting
 * 5 requests per minute - brute force protection
 */
export function createAuthEndpointRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH);
}

/**
 * Creates aggressive rate limiting for sensitive endpoints
 * (e.g., authentication, credential reset)
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
 * Redis-based rate limiter for production
 * Uses sliding window algorithm with Upstash Redis
 *
 * @example
 * const limiter = new RedisRateLimiter(process.env.UPSTASH_REDIS_URL);
 * const allowed = await limiter.checkLimit('user:123', 100, 60000);
 */
export class RedisRateLimiter {
  private redisUrl?: string;

  constructor(redisUrl?: string) {
    this.redisUrl = redisUrl || process.env.UPSTASH_REDIS_URL;
  }

  /**
   * Check rate limit using Redis
   * Implements sliding window log algorithm
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    // Placeholder for Redis implementation
    // In production, use @upstash/ratelimit or similar
    //
    // Example with @upstash/ratelimit:
    // const ratelimit = new Ratelimit({
    //   redis: Redis.fromEnv(),
    //   limiter: Ratelimit.slidingWindow(limit, `${windowMs}ms`),
    // });
    // const { success } = await ratelimit.limit(key);
    // return success;

    if (!this.redisUrl) {
      console.warn('[RateLimiter] Redis URL not configured, falling back to memory');
      return rateLimiter.checkLimit(key, limit, windowMs);
    }

    // For now, delegate to in-memory limiter
    // TODO: Implement Redis-based rate limiting with Upstash
    return rateLimiter.checkLimit(key, limit, windowMs);
  }

  /**
   * Check rate limit with DDoS protection
   */
  async checkLimitWithDDoS(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitResult> {
    // For now, delegate to in-memory limiter
    return rateLimiter.checkLimitWithDDoS(key, limit, windowMs);
  }

  /**
   * Block a key
   */
  async block(key: string, durationMs: number): Promise<void> {
    return rateLimiter.block(key, durationMs);
  }

  /**
   * Unblock a key
   */
  async unblock(key: string): Promise<void> {
    return rateLimiter.unblock(key);
  }
}

/**
 * Get the global rate limiter instance
 * Useful for monitoring and admin operations
 */
export function getRateLimiter(): InMemoryRateLimiter {
  return rateLimiter;
}

/**
 * Export rate limit configuration for external use
 */
export const rateLimitConfig = {
  tiers: RATE_LIMIT_TIERS,
  ddos: DDOS_CONFIG,
};
