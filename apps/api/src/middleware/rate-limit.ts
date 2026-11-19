/**
 * Rate Limiting Middleware - IFC-114
 *
 * In-memory rate limiter for tRPC endpoints with tiered limits and DDoS protection.
 *
 * @task IFC-114 - API rate limiting and DDoS protection
 */

import { TRPCError } from '@trpc/server';
import type { Context } from '../context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitTier {
  limit: number;
  windowMs: number;
  name: string;
}

interface WindowState {
  count: number;
  windowStart: number;
}

interface MiddlewareOpts {
  ctx: Context;

  next: (opts?: { ctx: unknown }) => Promise<any>;
}

// ---------------------------------------------------------------------------
// Tier & DDoS Configuration
// ---------------------------------------------------------------------------

export const RATE_LIMIT_TIERS = {
  PUBLIC: { limit: 100, windowMs: 60000, name: 'public' } as RateLimitTier,
  AUTHENTICATED: { limit: 1000, windowMs: 60000, name: 'authenticated' } as RateLimitTier,
  AI: { limit: 10, windowMs: 60000, name: 'ai' } as RateLimitTier,
  AUTH: { limit: 5, windowMs: 60000, name: 'auth' } as RateLimitTier,
};

export const DDOS_CONFIG = {
  burstLimit: 500,
  burstWindowMs: 1000,
  blockDurationMs: 300000,
};

export const rateLimitConfig = {
  tiers: RATE_LIMIT_TIERS,
  ddos: DDOS_CONFIG,
};

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Client IP for anonymous callers, from headers the edge sets, never from one the client can
 * write.
 *
 * 1. `x-real-ip`: set by the Railway/Vercel edge to the connecting client.
 * 2. `x-forwarded-for`: a client can PREPEND hops to it but cannot append, so the entry
 *    `TRUSTED_PROXY_HOPS` from the right (default 1: the hop our own edge added) is the
 *    address our edge saw. The leftmost entry is client-controlled and is not read.
 *
 * Without a usable header the key is 'unknown', so those callers share one bucket (the safe
 * side: an unidentifiable caller is limited with the other unidentifiable callers).
 */
export function getRateLimitClientId(req: Request | undefined): string {
  if (!req) return 'unknown';
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  const hops = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  const trusted = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10) || 1);
  return hops[hops.length - trusted] || 'unknown';
}

/**
 * Who a request is counted against. A signed-in call is counted per tenant AND user, whatever
 * the network path: many users behind one proxy, or one user on several devices, never share
 * or split a bucket by address. Only an anonymous call falls back to the client address.
 */
export function rateLimitSubject(ctx: Context): string {
  if (ctx.user?.userId) return `user:${ctx.user.tenantId ?? '-'}:${ctx.user.userId}`;
  return `ip:${getRateLimitClientId(ctx.req)}`;
}

function getKey(ctx: Context): string {
  return rateLimitSubject(ctx);
}

/** Seconds left in the fixed window that `Date.now()` falls in (at least 1). */
function secondsToWindowEnd(windowMs: number): number {
  return Math.max(1, Math.ceil((windowMs - (Date.now() % windowMs)) / 1000));
}

/** `retryAfter` (seconds) a rate-limit rejection carries in its cause, or null for any other error. */
export function retryAfterFromCause(cause: unknown): number | null {
  if (!cause || typeof cause !== 'object') return null;
  const value = (cause as { retryAfter?: unknown }).retryAfter;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function getRetryAfterSeconds(windowStart: number, windowMs: number): number {
  const elapsed = Date.now() - windowStart;
  return Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
}

// ---------------------------------------------------------------------------
// Middleware factories
// ---------------------------------------------------------------------------

/**
 * Creates a generic rate limit middleware.
 * Each call creates an independent in-memory store (closure-scoped Map).
 */
export function createRateLimitMiddleware(limit = 100, windowMs = 60000) {
  const store = new Map<string, WindowState>();

  return async ({ ctx, next }: MiddlewareOpts) => {
    const key = getKey(ctx);
    const now = Date.now();

    let state = store.get(key);

    // Reset window if expired
    if (state && now - state.windowStart >= windowMs) {
      state = undefined;
      store.delete(key);
    }

    if (!state) {
      state = { count: 0, windowStart: now };
      store.set(key, state);
    }

    // Check limit BEFORE incrementing: if count > 0 and count >= limit, reject
    if (state.count > 0 && state.count >= limit) {
      const retryAfter = getRetryAfterSeconds(state.windowStart, windowMs);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      });
    }

    state.count++;
    return next();
  };
}

/**
 * Strict rate limiter: 10 requests per minute.
 */
export function createStrictRateLimitMiddleware() {
  return createRateLimitMiddleware(10, 60000);
}

/**
 * Lenient rate limiter: 1000 requests per minute.
 */
export function createLenientRateLimitMiddleware() {
  return createRateLimitMiddleware(1000, 60000);
}

/**
 * Tiered rate limiter with tier metadata in error cause.
 */
export function createTieredRateLimitMiddleware(tier: RateLimitTier) {
  const store = new Map<string, WindowState>();

  return async ({ ctx, next }: MiddlewareOpts) => {
    const key = getKey(ctx);
    const now = Date.now();

    let state = store.get(key);

    if (state && now - state.windowStart >= tier.windowMs) {
      state = undefined;
      store.delete(key);
    }

    if (!state) {
      state = { count: 0, windowStart: now };
      store.set(key, state);
    }

    if (state.count > 0 && state.count >= tier.limit) {
      const retryAfter = getRetryAfterSeconds(state.windowStart, tier.windowMs);
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        cause: {
          tier: tier.name,
          retryAfter,
          limit: tier.limit,
          windowMs: tier.windowMs,
        },
      });
    }

    state.count++;
    return next();
  };
}

export function createPublicRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.PUBLIC);
}

export function createAuthenticatedRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTHENTICATED);
}

export function createAIRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AI);
}

export function createAuthEndpointRateLimitMiddleware() {
  return createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH);
}

// ---------------------------------------------------------------------------
// RedisRateLimiter — sliding-window rate limiting via Redis INCR/PEXPIRE
// ---------------------------------------------------------------------------

export class RedisRateLimiter {
  private redis: {
    incr(key: string): Promise<number>;
    pexpire(key: string, ms: number): Promise<number>;
    connect(): Promise<void>;
  } | null = null;
  private connectionAttempted = false;

  /**
   * @param redisClient optional pre-built client — tests inject a fake; prod omits
   * it and a lazy ioredis connection is established on first use.
   */
  constructor(redisClient?: {
    incr(key: string): Promise<number>;
    pexpire(key: string, ms: number): Promise<number>;
    connect(): Promise<void>;
  }) {
    if (redisClient) {
      this.redis = redisClient;
      this.connectionAttempted = true;
    }
  }

  private async getRedis(): Promise<NonNullable<RedisRateLimiter['redis']>> {
    if (this.redis) return this.redis;

    // Accept REDIS_URL, or RATE_LIMIT_REDIS_URL when it is an ioredis-compatible
    // redis(s):// string. The .env historically only defined RATE_LIMIT_REDIS_URL,
    // so distributed rate limiting silently never activated. NOTE: an Upstash REST
    // https:// URL is NOT usable by ioredis and is deliberately ignored here — set
    // a rediss:// connection string. Issue #316.
    const rawUrl = process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL;
    const url = rawUrl && /^rediss?:\/\//i.test(rawUrl) ? rawUrl : process.env.REDIS_URL;
    if (!url) {
      throw new Error(
        'REDIS_URL (ioredis rediss:// string) is required for distributed rate limiting'
      );
    }

    if (!this.connectionAttempted) {
      this.connectionAttempted = true;
      // Dynamic import — ioredis is only required when REDIS_URL is configured
      const { Redis } = await import('ioredis');
      const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
      await redis.connect();
      this.redis = redis;
    }

    if (!this.redis) {
      throw new Error('Redis connection failed');
    }
    return this.redis;
  }

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const redis = await this.getRedis();
    const windowKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const count = await redis.incr(windowKey);
    if (count === 1) {
      await redis.pexpire(windowKey, windowMs);
    }
    return count <= limit;
  }
}

// ---------------------------------------------------------------------------
// Global rate limiter singleton (monitoring / DDoS)
// ---------------------------------------------------------------------------

interface GlobalLimiterState {
  windows: Map<string, WindowState>;
  blocked: Map<string, number>; // key → unblock timestamp
}

function createGlobalLimiter() {
  const state: GlobalLimiterState = {
    windows: new Map(),
    blocked: new Map(),
  };

  return {
    async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
      const now = Date.now();
      let w = state.windows.get(key);
      if (w && now - w.windowStart >= windowMs) {
        w = undefined;
        state.windows.delete(key);
      }
      if (!w) {
        w = { count: 0, windowStart: now };
        state.windows.set(key, w);
      }
      if (w.count > 0 && w.count >= limit) return false;
      w.count++;
      return true;
    },

    async checkLimitWithDDoS(
      key: string,
      limit: number,
      windowMs: number
    ): Promise<RateLimitResult> {
      const now = Date.now();
      let w = state.windows.get(key);
      if (w && now - w.windowStart >= windowMs) {
        w = undefined;
        state.windows.delete(key);
      }
      if (!w) {
        w = { count: 0, windowStart: now };
        state.windows.set(key, w);
      }

      const allowed = !(w.count > 0 && w.count >= limit);
      if (allowed) w.count++;
      const remaining = Math.max(0, limit - w.count);
      const resetAt = w.windowStart + windowMs;

      return { allowed, remaining, resetAt };
    },

    async getRemaining(key: string, limit: number, windowMs: number): Promise<number> {
      const now = Date.now();
      const w = state.windows.get(key);
      if (!w || now - w.windowStart >= windowMs) return limit;
      return Math.max(0, limit - w.count);
    },

    async getResetTime(key: string, windowMs: number): Promise<number> {
      const w = state.windows.get(key);
      if (!w) return Date.now() + windowMs;
      return w.windowStart + windowMs;
    },

    async isBlocked(key: string): Promise<boolean> {
      const until = state.blocked.get(key);
      if (until === undefined) return false;
      if (Date.now() >= until) {
        state.blocked.delete(key);
        return false;
      }
      return true;
    },

    async block(key: string, durationMs: number): Promise<void> {
      state.blocked.set(key, Date.now() + durationMs);
    },

    async unblock(key: string): Promise<void> {
      state.blocked.delete(key);
    },

    async getStats(): Promise<{ totalKeys: number; blockedKeys: number; activeKeys: number }> {
      const now = Date.now();
      let blockedCount = 0;
      for (const until of state.blocked.values()) {
        if (now < until) blockedCount++;
      }
      return {
        totalKeys: state.windows.size + state.blocked.size,
        blockedKeys: blockedCount,
        activeKeys: state.windows.size,
      };
    },

    async cleanup(): Promise<void> {
      state.windows.clear();
      state.blocked.clear();
    },
  };
}

let globalLimiter: ReturnType<typeof createGlobalLimiter> | null = null;

export function getRateLimiter() {
  globalLimiter ??= createGlobalLimiter();
  return globalLimiter;
}

// ---------------------------------------------------------------------------
// Distributed (Redis-backed) rate-limit middleware for tRPC procedures
//
// This is what finally ACTIVATES the RedisRateLimiter (issue #316, caveat 3a):
// the limiter class existed but nothing instantiated it, so distributed rate
// limiting silently never ran. These middlewares are wired into
// publicProcedure / protectedProcedure / authProcedure in trpc.ts.
// ---------------------------------------------------------------------------

/**
 * Process-wide RedisRateLimiter. Lazily connects on first use; only relevant
 * when a managed (rediss://) Redis URL is configured.
 */
let sharedRedisLimiter: RedisRateLimiter | null = null;
function getSharedRedisLimiter(): RedisRateLimiter {
  sharedRedisLimiter ??= new RedisRateLimiter();
  return sharedRedisLimiter;
}

/** Test-only: reset the shared limiter so a fresh Redis mock is picked up. */
export function __resetSharedRedisLimiter(): void {
  sharedRedisLimiter = null;
}

/** Test-only: inject a specific shared limiter (e.g. one with a fake Redis client). */
export function __setSharedRedisLimiter(limiter: RedisRateLimiter | null): void {
  sharedRedisLimiter = limiter;
}

/**
 * Distributed rate limiting activates ONLY when a managed Redis (rediss:// TLS)
 * URL is configured — i.e. production. Dev/test (no URL, or a plain redis://
 * dev/CI instance) keep the prior single-process behaviour so the limiter never
 * introduces shared, cross-test state into the suite. Issue #316 (caveat 3a).
 */
export function isDistributedRateLimitEnabled(): boolean {
  const url = process.env.REDIS_URL || process.env.RATE_LIMIT_REDIS_URL;
  return !!url && /^rediss:\/\//i.test(url);
}

/** Per-tier rate-limit key: signed-in → tenant + user; otherwise client IP (see rateLimitSubject). */
function distributedKey(ctx: Context, tier: RateLimitTier): string {
  return `${tier.name}:${rateLimitSubject(ctx)}`;
}

export interface DistributedRateLimitOptions {
  /**
   * Behaviour when distributed Redis is NOT enabled (dev/test):
   * - 'in-memory' (default): apply the per-process tiered limiter — preserves the
   *   prior behaviour of protected/auth procedures.
   * - 'pass-through': no limit — preserves publicProcedure having had no limiter.
   */
  fallback?: 'in-memory' | 'pass-through';
}

/**
 * tRPC middleware enforcing `tier` via the distributed RedisRateLimiter when a
 * managed Redis is configured (prod), with a graceful fallback otherwise and on
 * transient Redis errors.
 */
export function createDistributedRateLimitMiddleware(
  tier: RateLimitTier,
  options: DistributedRateLimitOptions = {}
) {
  const fallbackMode = options.fallback ?? 'in-memory';
  const inMemoryFallback = createTieredRateLimitMiddleware(tier);

  const runFallback = ({ ctx, next }: MiddlewareOpts) =>
    fallbackMode === 'pass-through' ? next() : inMemoryFallback({ ctx, next });

  return async ({ ctx, next }: MiddlewareOpts) => {
    if (!isDistributedRateLimitEnabled()) {
      return runFallback({ ctx, next });
    }

    try {
      const allowed = await getSharedRedisLimiter().checkLimit(
        distributedKey(ctx, tier),
        tier.limit,
        tier.windowMs
      );
      if (!allowed) {
        const retryAfter = secondsToWindowEnd(tier.windowMs);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          cause: { tier: tier.name, retryAfter, limit: tier.limit, windowMs: tier.windowMs },
        });
      }
      return next();
    } catch (err) {
      // A genuine limit rejection must propagate.
      if (err instanceof TRPCError) throw err;
      // Transient Redis failure → degrade to the fallback rather than failing the
      // request (in-memory still throttles per instance; we don't fail-open).
      return runFallback({ ctx, next });
    }
  };
}
