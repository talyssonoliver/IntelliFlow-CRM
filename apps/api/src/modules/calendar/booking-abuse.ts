/**
 * Public booking abuse controls (PG-203, runner requirements R1/R6, ADR-083).
 *
 * The in-process PublicRateLimiter is per API process and the distributed PUBLIC
 * tier passes through without Redis, so the binding caps are counted from the
 * `booking_attempts` table: per booker email (3 / 24 h) and per client IP (10 / h),
 * per tenant, counting every attempt. The per-event-type cap (30 / h) counts only
 * public bookings that landed (owner ruling 2026-10-21): if failed attempts counted
 * there, anyone could burn it with junk and lock real visitors out for the hour. It
 * is checked inside the booking transaction, under the per-tenant booking lock, so
 * concurrent bookings cannot both pass it.
 * Only salted HMAC-SHA256 hashes are stored, never a raw email or IP. Rows older than 48 h are pruned on the next
 * booking of the same tenant, so the table stays bounded without a worker.
 */
import { createHmac } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import { BOOKING_CAPS } from '@intelliflow/domain';
import { PublicRateLimiter } from '../../security/public-rate-limiter';
import { pickTrustedForwardedIp } from '../../security/client-ip';

type AttemptPrisma = Pick<PrismaClient, 'bookingAttempt'>;
type BookedPrisma = Pick<PrismaClient, 'appointment'>;

/** Dev/test only; production refuses to book without BOOKING_IP_SALT. */
export const BOOKING_LOCAL_SALT = 'intelliflow-local-booking-salt';

const UNAVAILABLE = 'Online booking is temporarily unavailable.';
const TOO_MANY = 'Too many booking attempts. Please try again later.';
const MS_PER_HOUR = 3_600_000;

/** About two slot lookups per second per client IP: date clicks are never throttled. */
export const bookingSlotsLimiter = new PublicRateLimiter({ windowMs: 500 });
/** Per-IP throttle on the event lookup, before any database read (handle enumeration). */
export const bookingLookupLimiter = new PublicRateLimiter({ windowMs: 250 });
/** Per-IP throttle on submits, before any database read or lock (lock-queue flooding). */
export const bookingSubmitLimiter = new PublicRateLimiter({ windowMs: 2000 });

/** Reduce an IPv6 address to its /64, so one host cannot rotate addresses inside its prefix. */
export function ipv6Prefix64(ip: string): string {
  const address = ip.split('%')[0].toLowerCase();
  if (address.includes('.')) return address; // IPv4-mapped: the IPv4 part identifies the client
  const [head, tail = ''] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = address.includes('::') && tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const groups = [...headParts, ...new Array<string>(Math.max(missing, 0)).fill('0'), ...tailParts];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/**
 * The client IP for booking caps: only the edge-set (rightmost) x-forwarded-for hop. The
 * client-settable x-real-ip is never trusted here. Without the header every caller shares the
 * 'unknown' bucket, which is the stricter global bucket for traffic that bypassed the edge.
 */
export function bookingClientIp(req: Request | undefined): string {
  const ip = pickTrustedForwardedIp(req?.headers.get('x-forwarded-for'));
  if (!ip) return 'unknown';
  return ip.includes(':') ? ipv6Prefix64(ip) : ip;
}

export function getBookingSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.BOOKING_IP_SALT?.trim();
  if (salt) return salt;
  if (env.NODE_ENV === 'production') {
    console.error('[public-booking] BOOKING_IP_SALT is not set; refusing to book');
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: UNAVAILABLE });
  }
  return BOOKING_LOCAL_SALT;
}

export function hashBookingValue(value: string, salt: string): string {
  return createHmac('sha256', salt).update(value, 'utf8').digest('hex');
}

/** One inbox counts once: lowercase, and drop a `+tag` from the local part. */
export function normalizeEmailForCap(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  const local = lower.slice(0, at);
  const plus = local.indexOf('+');
  return `${plus === -1 ? local : local.slice(0, plus)}${lower.slice(at)}`;
}

export interface BookingAttemptKeys {
  tenantId: string;
  eventTypeId: string;
  emailHash: string;
  ipHash: string;
}

export async function assertBookingCaps(
  prisma: AttemptPrisma,
  keys: BookingAttemptKeys,
  now: Date
): Promise<void> {
  const lastDay = new Date(now.getTime() - 24 * MS_PER_HOUR);
  const lastHour = new Date(now.getTime() - MS_PER_HOUR);
  const [byEmail, byIp] = await Promise.all([
    prisma.bookingAttempt.count({
      where: { tenantId: keys.tenantId, emailHash: keys.emailHash, createdAt: { gt: lastDay } },
    }),
    prisma.bookingAttempt.count({
      where: { tenantId: keys.tenantId, ipHash: keys.ipHash, createdAt: { gt: lastHour } },
    }),
  ]);
  if (byEmail >= BOOKING_CAPS.perEmailPerDay || byIp >= BOOKING_CAPS.perIpPerHour) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: TOO_MANY });
  }
}

/** Landed public bookings of this event type in the last hour; call under the booking lock. */
export async function assertEventTypeBookingCap(
  prisma: BookedPrisma,
  keys: Pick<BookingAttemptKeys, 'tenantId' | 'eventTypeId'>,
  now: Date
): Promise<void> {
  const booked = await prisma.appointment.count({
    where: {
      tenantId: keys.tenantId,
      eventTypeId: keys.eventTypeId,
      bookedVia: 'PUBLIC_LINK',
      createdAt: { gt: new Date(now.getTime() - MS_PER_HOUR) },
    },
  });
  if (booked >= BOOKING_CAPS.perEventTypePerHour) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: TOO_MANY });
  }
}

export async function recordBookingAttempt(
  prisma: AttemptPrisma,
  keys: BookingAttemptKeys
): Promise<void> {
  await prisma.bookingAttempt.create({ data: keys });
}

export async function pruneBookingAttempts(
  prisma: AttemptPrisma,
  tenantId: string,
  now: Date
): Promise<void> {
  try {
    await prisma.bookingAttempt.deleteMany({
      where: {
        tenantId,
        createdAt: {
          lt: new Date(now.getTime() - BOOKING_CAPS.attemptRetentionHours * MS_PER_HOUR),
        },
      },
    });
  } catch (error) {
    console.warn('[public-booking] Failed to prune booking attempts', {
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}
