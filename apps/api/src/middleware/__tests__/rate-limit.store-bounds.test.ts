/**
 * MVP-007: anonymous callers are keyed per address, so the in-memory limiters must not keep a
 * window for every address they have ever seen, and must never forget a caller who is limited.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Context } from '../../context';
import {
  MAX_TRACKED_KEYS,
  OVERFLOW_KEY,
  RATE_LIMIT_TIERS,
  createRateLimitMiddleware,
  createTieredRateLimitMiddleware,
  createWindowStore,
} from '../rate-limit.js';

const WINDOW = 60_000;

const anonymous = (ip: string): Context =>
  ({
    user: null,
    req: { headers: { 'x-real-ip': ip } },
    prisma: {},
    services: {},
    adapters: {},
  }) as unknown as Context;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T08:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createWindowStore', () => {
  it('gives each key its own window and returns the same one while it is live', () => {
    const windows = createWindowStore(WINDOW);
    const a = windows.windowFor('a', Date.now());
    a.count = 3;

    expect(windows.windowFor('a', Date.now() + 1000)).toBe(a);
    expect(windows.windowFor('b', Date.now()).count).toBe(0);
    expect(windows.size()).toBe(2);
  });

  it('starts a fresh window for a key whose window has ended', () => {
    const windows = createWindowStore(WINDOW);
    windows.windowFor('a', Date.now()).count = 5;
    vi.advanceTimersByTime(WINDOW + 1);

    expect(windows.windowFor('a', Date.now()).count).toBe(0);
  });

  it('drops the windows of callers who never came back, once per window', () => {
    const windows = createWindowStore(WINDOW);
    for (let i = 0; i < 50; i++) windows.windowFor(`ip:${i}`, Date.now());
    expect(windows.size()).toBe(50);

    vi.advanceTimersByTime(WINDOW + 1);
    windows.windowFor('ip:new', Date.now());

    expect(windows.size()).toBe(1);
  });

  it('never drops a live window, even when the store is full', () => {
    const windows = createWindowStore(WINDOW);
    const limited = windows.windowFor('ip:limited', Date.now());
    limited.count = 99;
    for (let i = 0; i < MAX_TRACKED_KEYS + 50; i++) windows.windowFor(`ip:${i}`, Date.now());

    // The cap, plus the one shared overflow window.
    expect(windows.size()).toBeLessThanOrEqual(MAX_TRACKED_KEYS + 1);
    expect(windows.windowFor('ip:limited', Date.now())).toBe(limited);
    expect(windows.windowFor('ip:limited', Date.now()).count).toBe(99);
  });

  it('keeps a caller in the overflow window until it ends, even after older windows expire', () => {
    const windows = createWindowStore(WINDOW);
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) windows.windowFor(`ip:${i}`, Date.now());

    vi.advanceTimersByTime(30_000);
    const overflow = windows.windowFor('ip:late', Date.now());
    overflow.count = 5;

    // At 60.001 s the 10,000 individual windows are gone, the overflow window (from 30 s) is not.
    vi.advanceTimersByTime(30_001);
    const again = windows.windowFor('ip:late', Date.now());

    expect(again).toBe(overflow);
    expect(again.count).toBe(5);

    // At 90.001 s it has ended too, and the caller gets a window of its own.
    vi.advanceTimersByTime(30_000);
    const fresh = windows.windowFor('ip:late', Date.now());
    expect(fresh).not.toBe(overflow);
    expect(fresh.count).toBe(0);
  });

  it('counts new callers in one shared overflow window once the store is full of live ones', () => {
    const windows = createWindowStore(WINDOW);
    for (let i = 0; i < MAX_TRACKED_KEYS; i++) windows.windowFor(`ip:${i}`, Date.now());

    const first = windows.windowFor('ip:late-1', Date.now());
    const second = windows.windowFor('ip:late-2', Date.now());

    expect(second).toBe(first);
    expect(windows.size()).toBe(MAX_TRACKED_KEYS + 1);
    expect(windows.windowFor(OVERFLOW_KEY, Date.now())).toBe(first);

    // The overflow window ends like any other.
    vi.advanceTimersByTime(WINDOW + 1);
    expect(windows.windowFor('ip:late-1', Date.now()).count).toBe(0);
  });
});

describe('the in-memory limiters stay bounded without forgetting anyone', () => {
  it('keeps limiting an address while thousands of others come and go', async () => {
    const mw = createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH);
    const next = vi.fn(async () => ({ ok: true }));
    const abuser = anonymous('9.9.9.9');

    for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await mw({ ctx: abuser, next });
    for (let i = 0; i < MAX_TRACKED_KEYS + 200; i++) {
      // Each of these is a new address; most are refused once the shared overflow window is used up.
      await mw({ ctx: anonymous(`10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`), next }).catch(
        () => undefined
      );
    }

    await expect(mw({ ctx: abuser, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('lets an address back in once its window has passed, in both limiter kinds', async () => {
    const tiered = createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH);
    const generic = createRateLimitMiddleware(2, WINDOW);
    const next = vi.fn(async () => ({ ok: true }));
    const ctx = anonymous('7.7.7.7');

    for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await tiered({ ctx, next });
    for (let i = 0; i < 2; i++) await generic({ ctx, next });
    await expect(tiered({ ctx, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    await expect(generic({ ctx, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });

    vi.advanceTimersByTime(WINDOW + 1);
    await expect(tiered({ ctx, next })).resolves.toBeDefined();
    await expect(generic({ ctx, next })).resolves.toBeDefined();
  });
});
