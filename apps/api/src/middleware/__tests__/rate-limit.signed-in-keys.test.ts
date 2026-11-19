/**
 * MVP-007: a signed-in user is counted per tenant + user on the AUTHENTICATED tier whatever the
 * network path, anonymous callers per trusted client address, and a rejection says when to retry.
 * On 19/11/2026 the owner's pages returned 429 for onboarding.getState, user.getProfile,
 * billing.getPlanState, contact.getById and opportunity.getById.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Context } from '../../context';
import {
  RATE_LIMIT_TIERS,
  createDistributedRateLimitMiddleware,
  getRateLimitClientId,
  rateLimitSubject,
  retryAfterFromCause,
} from '../rate-limit';

type TestUser = { userId: string; email: string; role: string; tenantId: string };

const ctxFor = (user: TestUser | null, headers: Record<string, string> = {}): Context =>
  ({
    user,
    req: new Request('http://api.test/api/trpc/x', { headers }),
    prisma: {},
    services: {},
    adapters: {},
  }) as unknown as Context;

const user = (userId: string, tenantId = 't-1'): TestUser => ({
  userId,
  email: `${userId}@example.test`,
  role: 'USER',
  tenantId,
});

// What every browser shows the API when they all come through one proxy.
const SHARED_PROXY = { 'x-real-ip': '10.0.0.1' };

describe('rate-limit keys (MVP-007)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.TRUSTED_PROXY_HOPS;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T08:11:00.000Z'));
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.useRealTimers();
  });

  describe('who a call is counted against', () => {
    it('counts a signed-in call by tenant and user, not by address', () => {
      expect(rateLimitSubject(ctxFor(user('u-1'), { 'x-real-ip': '1.1.1.1' }))).toBe(
        'user:t-1:u-1'
      );
      expect(rateLimitSubject(ctxFor(user('u-1'), { 'x-real-ip': '2.2.2.2' }))).toBe(
        'user:t-1:u-1'
      );
      expect(rateLimitSubject(ctxFor(user('u-1', 't-2')))).toBe('user:t-2:u-1');
    });

    it('counts an anonymous call by the client address from the edge', () => {
      expect(rateLimitSubject(ctxFor(null, { 'x-real-ip': ' 9.9.9.9 ' }))).toBe('ip:9.9.9.9');
    });

    it('reads the address the edge appended to x-forwarded-for, never a leftmost one the client wrote', () => {
      const spoofed = { 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.9' };
      expect(getRateLimitClientId(ctxFor(null, spoofed).req)).toBe('203.0.113.9');
      // A client that rotates the spoofed part does not get a new bucket.
      const rotated = { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' };
      expect(getRateLimitClientId(ctxFor(null, rotated).req)).toBe('203.0.113.9');
    });

    it('trusts more hops only when TRUSTED_PROXY_HOPS says so', () => {
      process.env.TRUSTED_PROXY_HOPS = '2';
      const headers = { 'x-forwarded-for': '198.51.100.7, 203.0.113.9, 10.1.1.1' };
      expect(getRateLimitClientId(ctxFor(null, headers).req)).toBe('203.0.113.9');
      process.env.TRUSTED_PROXY_HOPS = 'nonsense';
      expect(getRateLimitClientId(ctxFor(null, headers).req)).toBe('10.1.1.1');
    });

    it('prefers x-real-ip and falls back to one shared bucket without any address', () => {
      const both = { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' };
      expect(getRateLimitClientId(ctxFor(null, both).req)).toBe('9.9.9.9');
      expect(getRateLimitClientId(ctxFor(null).req)).toBe('unknown');
      expect(getRateLimitClientId(undefined)).toBe('unknown');
    });
  });

  describe('AUTHENTICATED tier', () => {
    const authenticated = () =>
      createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTHENTICATED, {
        fallback: 'in-memory',
      });

    it('4 pages x 2 viewports in 60 seconds as one signed-in user gives no 429', async () => {
      const mw = authenticated();
      const next = vi.fn(async () => ({ ok: true }));
      const owner = ctxFor(user('owner'), SHARED_PROXY);

      // One page load is about 40 calls: the shell (profile, plan, modules, notifications,
      // onboarding, tenants, auth status, activity feed) plus the page's own. Eight loads in
      // under a minute is 320 calls, well inside the 1,000 a minute this tier allows.
      const PAGES = 4;
      const VIEWPORTS = 2;
      const CALLS_PER_PAGE_LOAD = 40;
      for (let load = 0; load < PAGES * VIEWPORTS; load++) {
        for (let call = 0; call < CALLS_PER_PAGE_LOAD; call++) {
          await mw({ ctx: owner, next });
        }
        vi.advanceTimersByTime(7000);
      }

      expect(next).toHaveBeenCalledTimes(PAGES * VIEWPORTS * CALLS_PER_PAGE_LOAD);
    });

    it('does not let users behind one proxy address share a bucket', async () => {
      const mw = authenticated();
      const next = vi.fn(async () => ({ ok: true }));
      const limit = RATE_LIMIT_TIERS.AUTHENTICATED.limit;
      const busy = ctxFor(user('busy'), SHARED_PROXY);
      const calm = ctxFor(user('calm'), SHARED_PROXY);

      for (let i = 0; i < limit; i++) await mw({ ctx: busy, next });
      await expect(mw({ ctx: busy, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

      await expect(mw({ ctx: calm, next })).resolves.toBeDefined();
    });

    it('keeps the same user in two tenants in separate buckets', async () => {
      const mw = authenticated();
      const next = vi.fn(async () => ({ ok: true }));
      const limit = RATE_LIMIT_TIERS.AUTHENTICATED.limit;
      const home = ctxFor(user('u-1', 't-home'), SHARED_PROXY);
      const guest = ctxFor(user('u-1', 't-guest'), SHARED_PROXY);

      for (let i = 0; i < limit; i++) await mw({ ctx: home, next });
      await expect(mw({ ctx: home, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      await expect(mw({ ctx: guest, next })).resolves.toBeDefined();
    });

    it('lets the user back in when the minute is over', async () => {
      const mw = authenticated();
      const next = vi.fn(async () => ({ ok: true }));
      const limit = RATE_LIMIT_TIERS.AUTHENTICATED.limit;
      const ctx = ctxFor(user('u-1'), SHARED_PROXY);

      for (let i = 0; i < limit; i++) await mw({ ctx, next });
      await expect(mw({ ctx, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      vi.advanceTimersByTime(RATE_LIMIT_TIERS.AUTHENTICATED.windowMs);
      await expect(mw({ ctx, next })).resolves.toBeDefined();
    });
  });

  describe('anonymous callers on the AUTH tier (in-memory)', () => {
    it('limits per client address, so one caller does not lock every anonymous caller out', async () => {
      const mw = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH, {
        fallback: 'in-memory',
      });
      const next = vi.fn(async () => ({ ok: true }));
      const a = ctxFor(null, { 'x-real-ip': '1.1.1.1' });
      const b = ctxFor(null, { 'x-real-ip': '2.2.2.2' });

      for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await mw({ ctx: a, next });
      await expect(mw({ ctx: a, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      await expect(mw({ ctx: b, next })).resolves.toBeDefined();
    });
  });

  describe('Retry-After', () => {
    it('says how long to wait, on the in-memory path and the Redis path', async () => {
      const inMemory = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH, {
        fallback: 'in-memory',
      });
      const next = vi.fn(async () => ({ ok: true }));
      const ctx = ctxFor(null, { 'x-real-ip': '3.3.3.3' });
      for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await inMemory({ ctx, next });
      vi.advanceTimersByTime(20_000);
      const memoryError = await inMemory({ ctx, next }).catch((e: unknown) => e);
      expect(retryAfterFromCause((memoryError as { cause: unknown }).cause)).toBe(40);

      vi.resetModules();
      process.env.REDIS_URL = 'rediss://managed-host:6379';
      const fresh = await import('../rate-limit.js');
      const counts = new Map<string, number>();
      fresh.__setSharedRedisLimiter(
        new fresh.RedisRateLimiter({
          incr: async (key: string) => {
            const c = (counts.get(key) ?? 0) + 1;
            counts.set(key, c);
            return c;
          },
          pexpire: async () => 1,
          connect: async () => {},
        })
      );
      const redisMw = fresh.createDistributedRateLimitMiddleware(fresh.RATE_LIMIT_TIERS.AUTH, {
        fallback: 'in-memory',
      });
      for (let i = 0; i < fresh.RATE_LIMIT_TIERS.AUTH.limit; i++) await redisMw({ ctx, next });
      const redisError = await redisMw({ ctx, next }).catch((e: unknown) => e);
      // 08:11:20 into a 60 s window that started at 08:11:00 leaves 40 s.
      expect(fresh.retryAfterFromCause((redisError as { cause: unknown }).cause)).toBe(40);
      expect((redisError as Error).message).toContain('40 seconds');
    });

    it('reads only a positive number as a wait', () => {
      expect(retryAfterFromCause({ retryAfter: 12 })).toBe(12);
      expect(retryAfterFromCause({ retryAfter: 0 })).toBeNull();
      expect(retryAfterFromCause({ retryAfter: '12' })).toBeNull();
      expect(retryAfterFromCause({ retryAfter: Infinity })).toBeNull();
      expect(retryAfterFromCause(undefined)).toBeNull();
      expect(retryAfterFromCause('x')).toBeNull();
    });
  });
});
