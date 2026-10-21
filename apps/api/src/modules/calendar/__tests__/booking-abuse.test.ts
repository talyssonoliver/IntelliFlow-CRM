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
  assertBookingCaps,
  getBookingSalt,
  hashBookingValue,
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
  });

  function counts(email: number, ip: number, eventType: number) {
    prismaMock.bookingAttempt.count
      .mockResolvedValueOnce(email as never)
      .mockResolvedValueOnce(ip as never)
      .mockResolvedValueOnce(eventType as never);
  }

  it('passes under every cap and counts each window for this tenant', async () => {
    counts(2, 9, 29);
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
      {
        tenantId: TENANT,
        eventTypeId: 'et-1',
        createdAt: { gt: new Date('2026-11-02T09:00:00Z') },
      },
    ]);
  });

  it.each([
    ['email (3 per 24 h)', 3, 0, 0],
    ['ip (10 per hour)', 0, 10, 0],
    ['event type (30 per hour)', 0, 0, 30],
  ])('throws the same generic TOO_MANY_REQUESTS at the %s cap', async (_label, e, i, t) => {
    counts(e, i, t);
    await expect(assertBookingCaps(prismaMock as never, HASHES, NOW)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many booking attempts. Please try again later.',
    });
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
