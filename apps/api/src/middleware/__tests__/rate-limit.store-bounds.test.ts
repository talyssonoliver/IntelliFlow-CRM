/**
 * MVP-007: anonymous callers are keyed per address, so the in-memory limiters must not keep a
 * window for every address they have ever seen.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { Context } from '../../context';
import {
  MAX_TRACKED_KEYS,
  RATE_LIMIT_TIERS,
  createRateLimitMiddleware,
  createStoreSweeper,
  createTieredRateLimitMiddleware,
  type WindowState,
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

describe('createStoreSweeper', () => {
  it('drops windows that have expired, once per window', () => {
    const store = new Map<string, WindowState>();
    const sweep = createStoreSweeper(store, WINDOW);
    const start = Date.now();
    store.set('old', { count: 1, windowStart: start });
    vi.advanceTimersByTime(WINDOW + 1);
    store.set('fresh', { count: 1, windowStart: Date.now() });

    sweep(Date.now());

    expect([...store.keys()]).toEqual(['fresh']);
  });

  it('does nothing inside a window while the store is not full', () => {
    const store = new Map<string, WindowState>();
    const sweep = createStoreSweeper(store, WINDOW);
    store.set('a', { count: 1, windowStart: Date.now() - WINDOW - 5 });

    sweep(Date.now() + 10);

    expect(store.size).toBe(1);
  });

  it('drops the oldest keys when the store is full of live windows', () => {
    const store = new Map<string, WindowState>();
    const sweep = createStoreSweeper(store, WINDOW);
    for (let i = 0; i < MAX_TRACKED_KEYS + 5; i++) {
      store.set(`ip:${i}`, { count: 1, windowStart: Date.now() });
    }

    sweep(Date.now());

    expect(store.size).toBe(MAX_TRACKED_KEYS - 1);
    expect(store.has('ip:0')).toBe(false);
    expect(store.has(`ip:${MAX_TRACKED_KEYS + 4}`)).toBe(true);
  });
});

describe('the in-memory limiters stay bounded', () => {
  it('keeps limiting an address while thousands of others come and go', async () => {
    const mw = createTieredRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH);
    const next = vi.fn(async () => ({ ok: true }));
    const abuser = anonymous('9.9.9.9');

    for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await mw({ ctx: abuser, next });
    for (let i = 0; i < 300; i++) await mw({ ctx: anonymous(`10.0.${i >> 8}.${i & 255}`), next });

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
    // A different new address makes the limiter sweep; the first one is let back in either way.
    await tiered({ ctx: anonymous('7.7.7.8'), next });
    await generic({ ctx: anonymous('7.7.7.8'), next });
    await expect(tiered({ ctx, next })).resolves.toBeDefined();
    await expect(generic({ ctx, next })).resolves.toBeDefined();
  });
});
