import { describe, it, expect, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { PublicRateLimiter } from '../public-rate-limiter';

describe('PublicRateLimiter', () => {
  let clock = 0;
  const tick = (ms: number) => {
    clock += ms;
  };

  beforeEach(() => {
    clock = 0;
  });

  it('allows first hit for a new key', () => {
    const limiter = new PublicRateLimiter({
      windowMs: 1000,
      now: () => clock,
    });
    expect(() => limiter.check('a')).not.toThrow();
  });

  it('throws TRPCError TOO_MANY_REQUESTS on second hit within window', () => {
    const limiter = new PublicRateLimiter({
      windowMs: 1000,
      now: () => clock,
    });
    limiter.check('a');
    tick(500);
    try {
      limiter.check('a');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe('TOO_MANY_REQUESTS');
    }
  });

  it('allows hit after window expires', () => {
    const limiter = new PublicRateLimiter({
      windowMs: 1000,
      now: () => clock,
    });
    limiter.check('a');
    tick(1001);
    expect(() => limiter.check('a')).not.toThrow();
  });

  it('tracks keys independently', () => {
    const limiter = new PublicRateLimiter({
      windowMs: 1000,
      now: () => clock,
    });
    limiter.check('a');
    expect(() => limiter.check('b')).not.toThrow();
  });

  it('LRU eviction drops oldest key when over capacity', () => {
    const limiter = new PublicRateLimiter({
      capacity: 3,
      windowMs: 1_000_000,
      now: () => clock,
    });
    limiter.check('a');
    tick(1);
    limiter.check('b');
    tick(1);
    limiter.check('c');
    tick(1);
    limiter.check('d'); // evicts 'a'
    // 'a' should be admissible again since it was evicted
    tick(1);
    expect(() => limiter.check('a')).not.toThrow();
  });

  it('reset() clears all state', () => {
    const limiter = new PublicRateLimiter({
      windowMs: 1000,
      now: () => clock,
    });
    limiter.check('a');
    limiter.reset();
    expect(() => limiter.check('a')).not.toThrow();
  });
});

describe('PublicRateLimiter.hashIp', () => {
  it('returns deterministic sha256 hex', () => {
    const a = PublicRateLimiter.hashIp('1.2.3.4', 'salt');
    const b = PublicRateLimiter.hashIp('1.2.3.4', 'salt');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not expose raw IP in output', () => {
    const hash = PublicRateLimiter.hashIp('1.2.3.4', 'salt');
    expect(hash).not.toContain('1.2.3.4');
    expect(hash).not.toContain('salt');
  });

  it('differs when salt differs', () => {
    const a = PublicRateLimiter.hashIp('1.2.3.4', 'salt-a');
    const b = PublicRateLimiter.hashIp('1.2.3.4', 'salt-b');
    expect(a).not.toBe(b);
  });

  it('differs when IP differs', () => {
    const a = PublicRateLimiter.hashIp('1.2.3.4', 'salt');
    const b = PublicRateLimiter.hashIp('1.2.3.5', 'salt');
    expect(a).not.toBe(b);
  });
});
