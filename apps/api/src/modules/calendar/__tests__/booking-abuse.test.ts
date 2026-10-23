/**
 * PG-203 — public booking abuse controls (runner R1/R6, ADR-083).
 *
 * Caps are counted from booking_attempts (salted hashes, never raw email/IP), so
 * they hold across API processes and without Redis.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { prismaMock } from '../../../test/setup';
import {
  BOOKING_LOCAL_SALT,
  bookingClientIp,
  ipv6Prefix64,
  assertBookingCaps,
  assertEventTypeBookingCap,
  getBookingSalt,
  hashBookingValue,
  ipHashOf,
  normalizeEmailForCap,
  pruneBookingAttempts,
  recordBookingAttempt,
} from '../booking-abuse';

const NOW = new Date('2026-11-02T10:00:00Z');
const TENANT = 'tenant-a';
const HASHES = {
  tenantId: TENANT,
  eventTypeId: 'et-1',
  emailHash: 'e'.repeat(64),
  ipHash: 'i'.repeat(64),
};

describe('getBookingSalt', () => {
  it('uses BOOKING_IP_SALT when set', () => {
    expect(getBookingSalt({ NODE_ENV: 'production', BOOKING_IP_SALT: 'prod-salt' })).toBe(
      'prod-salt'
    );
  });

  it('refuses in production without a salt (generic message)', () => {
    expect(() => getBookingSalt({ NODE_ENV: 'production' })).toThrow(TRPCError);
    try {
      getBookingSalt({ NODE_ENV: 'production', BOOKING_IP_SALT: '  ' });
    } catch (err) {
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR');
      expect((err as TRPCError).message).toBe('Online booking is temporarily unavailable.');
    }
  });

  it('falls back to a local salt in development and tests', () => {
    expect(getBookingSalt({ NODE_ENV: 'test' })).toBe(BOOKING_LOCAL_SALT);
    expect(getBookingSalt({})).toBe(BOOKING_LOCAL_SALT);
  });
});

describe('hashBookingValue', () => {
  it('is a deterministic 64-hex HMAC per salt that never contains the input', () => {
    const a = hashBookingValue('ada@example.invalid', 'salt-1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBookingValue('ada@example.invalid', 'salt-1')).toBe(a);
    expect(hashBookingValue('ada@example.invalid', 'salt-2')).not.toBe(a);
    expect(a).not.toContain('ada');
  });
});

describe('normalizeEmailForCap', () => {
  it('lowercases and drops a +tag so one inbox counts once', () => {
    expect(normalizeEmailForCap('Ada+promo@Example.Invalid')).toBe('ada@example.invalid');
    expect(normalizeEmailForCap('ada@example.invalid')).toBe('ada@example.invalid');
    expect(normalizeEmailForCap('no-at-sign')).toBe('no-at-sign');
  });
});

describe('assertBookingCaps', () => {
  beforeEach(() => {
    prismaMock.bookingAttempt.count.mockReset();
    prismaMock.appointment.count.mockReset();
  });

  function counts(email: number, ip: number) {
    prismaMock.bookingAttempt.count
      .mockResolvedValueOnce(email as never)
      .mockResolvedValueOnce(ip as never);
  }

  it('passes under every cap and counts each window for this tenant', async () => {
    counts(2, 9);
    await expect(assertBookingCaps(prismaMock as never, HASHES, NOW)).resolves.toBeUndefined();
    const calls = prismaMock.bookingAttempt.count.mock.calls.map(([arg]) => arg!.where);
    expect(calls).toEqual([
      {
        tenantId: TENANT,
        emailHash: HASHES.emailHash,
        createdAt: { gt: new Date('2026-11-01T10:00:00Z') },
      },
      {
        tenantId: TENANT,
        ipHash: HASHES.ipHash,
        createdAt: { gt: new Date('2026-11-02T09:00:00Z') },
      },
    ]);
    expect(prismaMock.appointment.count).not.toHaveBeenCalled();
  });

  it.each([
    ['email (3 per 24 h)', 3, 0],
    ['ip (10 per hour)', 0, 10],
  ])('throws the same generic TOO_MANY_REQUESTS at the %s cap', async (_label, e, i) => {
    counts(e, i);
    await expect(assertBookingCaps(prismaMock as never, HASHES, NOW)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many booking attempts. Please try again later.',
    });
  });
});

describe('assertEventTypeBookingCap (owner ruling 2026-10-21)', () => {
  beforeEach(() => prismaMock.appointment.count.mockReset());

  it('counts only public bookings of this event type that landed in the last hour', async () => {
    prismaMock.appointment.count.mockResolvedValueOnce(29 as never);
    await expect(
      assertEventTypeBookingCap(prismaMock as never, HASHES, NOW)
    ).resolves.toBeUndefined();
    expect(prismaMock.appointment.count).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        eventTypeId: 'et-1',
        bookedVia: 'PUBLIC_LINK',
        createdAt: { gt: new Date('2026-11-02T09:00:00Z') },
      },
    });
  });

  it('throws the same generic TOO_MANY_REQUESTS at 30', async () => {
    prismaMock.appointment.count.mockResolvedValueOnce(30 as never);
    await expect(assertEventTypeBookingCap(prismaMock as never, HASHES, NOW)).rejects.toMatchObject(
      {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many booking attempts. Please try again later.',
      }
    );
  });
});

describe('recordBookingAttempt / pruneBookingAttempts', () => {
  it('records hashes only', async () => {
    prismaMock.bookingAttempt.create.mockResolvedValueOnce({} as never);
    await recordBookingAttempt(prismaMock as never, HASHES);
    expect(prismaMock.bookingAttempt.create).toHaveBeenCalledWith({ data: HASHES });
  });

  it("deletes only this tenant's attempts older than 48 hours", async () => {
    prismaMock.bookingAttempt.deleteMany.mockResolvedValueOnce({ count: 4 } as never);
    await pruneBookingAttempts(prismaMock as never, TENANT, NOW);
    expect(prismaMock.bookingAttempt.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, createdAt: { lt: new Date('2026-10-31T10:00:00Z') } },
    });
  });

  it('a failed prune never blocks the booking', async () => {
    prismaMock.bookingAttempt.deleteMany.mockRejectedValueOnce(new Error('db hiccup'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(pruneBookingAttempts(prismaMock as never, TENANT, NOW)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('bookingClientIp (security review F3; codex fp 07766f8e)', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://api.example.invalid/trpc', { headers });

  it('prefers the edge-written x-real-ip over any forwarded chain', () => {
    expect(
      bookingClientIp(
        req({ 'x-real-ip': '203.0.113.50', 'x-forwarded-for': '198.51.100.1, 192.0.2.10' })
      )
    ).toBe('203.0.113.50');
  });

  it('falls back to the rightmost x-forwarded-for hop, never the client-written leftmost', () => {
    expect(bookingClientIp(req({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' }))).toBe(
      '198.51.100.7'
    );
  });

  it('ipHashOf hashes the same client address the caps use, never the raw IP', () => {
    const hashed = ipHashOf(req({ 'x-real-ip': '203.0.113.50' }), 'salt');
    expect(hashed).toBe(hashBookingValue('203.0.113.50', 'salt'));
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHashOf(undefined, 'salt')).toBe(hashBookingValue('unknown', 'salt'));
  });

  it('puts callers with neither header in the shared unknown bucket', () => {
    expect(bookingClientIp(req({ 'x-real-ip': '   ' }))).toBe('unknown');
    expect(bookingClientIp(undefined)).toBe('unknown');
  });

  it('reduces IPv6 to its /64 so rotating inside one prefix shares a bucket', () => {
    const a = bookingClientIp(req({ 'x-forwarded-for': '2001:db8:aa:bb:1::1' }));
    const b = bookingClientIp(req({ 'x-forwarded-for': '2001:db8:aa:bb:ffff::2' }));
    expect(a).toBe('2001:db8:aa:bb::/64');
    expect(b).toBe(a);
  });

  it('expands :: and keeps IPv4-mapped addresses and zone ids sane', () => {
    expect(ipv6Prefix64('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipv6Prefix64('::1')).toBe('0:0:0:0::/64');
    expect(ipv6Prefix64('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(ipv6Prefix64('::ffff:198.51.100.7')).toBe('::ffff:198.51.100.7');
    expect(ipv6Prefix64('2001:0db8:0000:0001:0:0:0:1')).toBe('2001:db8:0:1::/64');
  });
});
