/**
 * MVP-007: the limiter reads request headers from both shapes the API sees: a Fetch `Request`
 * (`headers` is a `Headers`) and a Node/Fastify request (`headers` is a plain object of
 * lower-cased names). The first version called `req.headers.get()` and failed with
 * "req.headers.get is not a function" in auth/signup.test.ts.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Context } from '../../context';
import {
  RATE_LIMIT_TIERS,
  createDistributedRateLimitMiddleware,
  getRateLimitClientId,
  rateLimitSubject,
  readHeader,
} from '../rate-limit.js';

const fetchReq = (headers: Record<string, string>) => new Request('http://api.test/x', { headers });
const plainReq = (headers: Record<string, unknown> | undefined) => ({ headers });

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
  vi.useRealTimers();
});

describe('readHeader', () => {
  it('reads a Fetch Headers object, whatever the case asked for', () => {
    expect(readHeader(fetchReq({ 'x-real-ip': '1.1.1.1' }), 'X-Real-IP')).toBe('1.1.1.1');
    expect(readHeader(fetchReq({}), 'x-real-ip')).toBeUndefined();
  });

  it('reads a plain Node headers object by the lower-cased name', () => {
    expect(readHeader(plainReq({ 'x-real-ip': '2.2.2.2' }), 'X-Real-IP')).toBe('2.2.2.2');
    expect(readHeader(plainReq({}), 'x-real-ip')).toBeUndefined();
  });

  it('joins a repeated plain header, ignores values that are not text', () => {
    expect(
      readHeader(plainReq({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] }), 'x-forwarded-for')
    ).toBe('1.1.1.1, 2.2.2.2');
    expect(readHeader(plainReq({ 'x-forwarded-for': [] }), 'x-forwarded-for')).toBeUndefined();
    expect(readHeader(plainReq({ 'x-real-ip': 42 }), 'x-real-ip')).toBeUndefined();
    expect(readHeader(plainReq({ 'x-forwarded-for': [7] }), 'x-forwarded-for')).toBeUndefined();
  });

  it('copes with a request that has no headers at all', () => {
    expect(readHeader(plainReq(undefined), 'x-real-ip')).toBeUndefined();
    expect(readHeader({ headers: null }, 'x-real-ip')).toBeUndefined();
    expect(readHeader({}, 'x-real-ip')).toBeUndefined();
  });
});

describe('getRateLimitClientId with each header shape', () => {
  it('gives the same address for a Fetch request and a plain Node request', () => {
    const real = { 'x-real-ip': '9.9.9.9' };
    expect(getRateLimitClientId(fetchReq(real))).toBe('9.9.9.9');
    expect(getRateLimitClientId(plainReq(real))).toBe('9.9.9.9');

    const forwarded = { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' };
    expect(getRateLimitClientId(fetchReq(forwarded))).toBe('203.0.113.9');
    expect(getRateLimitClientId(plainReq(forwarded))).toBe('203.0.113.9');
    expect(getRateLimitClientId(plainReq({ 'x-forwarded-for': ['6.6.6.6', '203.0.113.9'] }))).toBe(
      '203.0.113.9'
    );
  });

  it('falls back to one shared bucket when the request has no usable headers', () => {
    expect(getRateLimitClientId(plainReq({}))).toBe('unknown');
    expect(getRateLimitClientId(plainReq(undefined))).toBe('unknown');
    expect(getRateLimitClientId(undefined)).toBe('unknown');
  });
});

describe('the middleware with a plain Node request (as in auth/signup.test.ts)', () => {
  const plainCtx = (headers: Record<string, unknown> | undefined): Context =>
    ({
      user: null,
      req: plainReq(headers),
      prisma: {},
      services: {},
      adapters: {},
    }) as unknown as Context;

  it('keys an anonymous call by address and does not throw', async () => {
    expect(rateLimitSubject(plainCtx({ 'x-real-ip': '4.4.4.4' }))).toBe('ip:4.4.4.4');
    expect(rateLimitSubject(plainCtx(undefined))).toBe('ip:unknown');
  });

  it('limits each plain-request address separately', async () => {
    delete process.env.REDIS_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    const mw = createDistributedRateLimitMiddleware(RATE_LIMIT_TIERS.AUTH, {
      fallback: 'in-memory',
    });
    const next = vi.fn(async () => ({ ok: true }));
    const a = plainCtx({ 'x-real-ip': '5.5.5.5' });
    const b = plainCtx({ 'x-real-ip': '6.6.6.6' });

    for (let i = 0; i < RATE_LIMIT_TIERS.AUTH.limit; i++) await mw({ ctx: a, next });
    await expect(mw({ ctx: a, next })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    await expect(mw({ ctx: b, next })).resolves.toBeDefined();
  });
});
