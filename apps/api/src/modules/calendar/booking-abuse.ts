/**
 * Public booking abuse controls (PG-203, runner requirements R1/R6, ADR-083).
 *
 * The in-process PublicRateLimiter is per API process and the distributed PUBLIC
 * tier passes through without Redis, so the binding caps are counted from the
 * `booking_attempts` table: per booker email (3 / 24 h), per client IP (10 / h)
 * and per event type (30 / h), all per tenant. Only salted HMAC-SHA256 hashes are
 * stored, never a raw email or IP. Rows older than 48 h are pruned on the next
 * booking of the same tenant, so the table stays bounded without a worker.
 */
import { createHmac } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import { BOOKING_CAPS } from '@intelliflow/domain';
import { PublicRateLimiter } from '../../security/public-rate-limiter';

type AttemptPrisma = Pick<PrismaClient, 'bookingAttempt'>;

/** Dev/test only; production refuses to book without BOOKING_IP_SALT. */
export const BOOKING_LOCAL_SALT = 'intelliflow-local-booking-salt';

const UNAVAILABLE = 'Online booking is temporarily unavailable.';
const TOO_MANY = 'Too many booking attempts. Please try again later.';
const MS_PER_HOUR = 3_600_000;

/** About two slot lookups per second per client IP: date clicks are never throttled. */
export const bookingSlotsLimiter = new PublicRateLimiter({ windowMs: 500 });

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
  const [byEmail, byIp, byEventType] = await Promise.all([
    prisma.bookingAttempt.count({
      where: { tenantId: keys.tenantId, emailHash: keys.emailHash, createdAt: { gt: lastDay } },
    }),
    prisma.bookingAttempt.count({
      where: { tenantId: keys.tenantId, ipHash: keys.ipHash, createdAt: { gt: lastHour } },
    }),
    prisma.bookingAttempt.count({
      where: {
        tenantId: keys.tenantId,
        eventTypeId: keys.eventTypeId,
        createdAt: { gt: lastHour },
      },
    }),
  ]);
  if (
    byEmail >= BOOKING_CAPS.perEmailPerDay ||
    byIp >= BOOKING_CAPS.perIpPerHour ||
    byEventType >= BOOKING_CAPS.perEventTypePerHour
  ) {
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
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
