/**
 * Inherited tenant membership: data rules shared by the partner procedures (ADR-071).
 *
 * One definition of "live", one definition of a seat, one definition of "last admin", and one
 * error constructor, so the five procedures that touch memberships cannot drift apart.
 *
 * The home tenant (`users.tenantId`) is an IMPLICIT membership. A `tenant_memberships` row for it
 * (`source = HOME`) is written lazily, and only to record a revocation: a home user with no row
 * has access; a home user whose row is revoked or expired does not.
 */

import { TRPCError } from '@trpc/server';
import {
  isLiveMembership,
  liveMembershipWhere,
  seatUserWhere,
  type MembershipLiveness,
  type PrismaClient,
} from '@intelliflow/db';
import { QuotaExceededError } from '@intelliflow/domain';
import { invalidateUserSessions as invalidateSessionCacheForUser } from '../../security/session-cache';

// ============================================================================
// Errors
// ============================================================================

/** Mirrors `MEMBERSHIP_ERROR_REASONS` of `@intelliflow/partner-sdk` (asserted by a test). */
export const MEMBERSHIP_ERROR_REASONS = [
  'ACCOUNT_IN_OTHER_TENANT',
  'STAFF_NOT_PROVISIONED',
  'NOT_A_MEMBER',
  'QUOTA_EXCEEDED',
  'ASSERTION_INVALID',
  'ASSERTION_REQUIRED',
  'LAST_ADMIN',
  'RESERVED_EMAIL',
  'HOME_ONLY',
  'PIN_PENDING',
  'GRANT_INVALID',
] as const;
export type MembershipErrorReason = (typeof MEMBERSHIP_ERROR_REASONS)[number];

/**
 * The cause of every membership TRPCError. The shared error formatter copies `cause.reason` to
 * `error.data.reason`; the SDK also reads the `<REASON>:` message prefix, so a client that only
 * sees the message still gets the reason.
 */
export class MembershipReasonError extends Error {
  constructor(readonly reason: MembershipErrorReason) {
    super(reason);
    this.name = 'MembershipReasonError';
  }
}

export function membershipError(
  code: TRPCError['code'],
  reason: MembershipErrorReason,
  text: string,
  cause?: Error
): TRPCError {
  const base = cause ?? new MembershipReasonError(reason);
  (base as Error & { reason?: MembershipErrorReason }).reason = reason;
  return new TRPCError({ code, message: `${reason}: ${text}`, cause: base });
}

export function reasonOf(error: unknown): MembershipErrorReason | null {
  if (!(error instanceof TRPCError)) return null;
  const reason = (error.cause as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' &&
    (MEMBERSHIP_ERROR_REASONS as readonly string[]).includes(reason)
    ? (reason as MembershipErrorReason)
    : null;
}

// ============================================================================
// Roles and liveness
// ============================================================================

export type MemberRole = 'ADMIN' | 'MEMBER';
export type StoredRole = 'ADMIN' | 'USER' | 'MANAGER' | 'SALES_REP';

/** Roles a partner may write. Only ADMIN and USER are ever stored on a membership. */
export function toStoredRole(role: MemberRole): 'ADMIN' | 'USER' {
  return role === 'ADMIN' ? 'ADMIN' : 'USER';
}

/** MANAGER and SALES_REP read as MEMBER on the partner contract. */
export function toMemberRole(role: string | null | undefined): MemberRole {
  return role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
}

export type MembershipRow = MembershipLiveness;

// One definition of "live" and of "takes a seat", shared with the session resolver and the quota
// adapter (packages/db/src/membership.ts).
export { isLiveMembership, liveMembershipWhere };

/** Staff memberships live 24 hours and are refreshed on every link (contract section a). */
export const STAFF_MEMBERSHIP_TTL_MS = 24 * 60 * 60 * 1000;
/** A login grant must be claimed within this window of being issued (the full OTP lifetime). */
export { LOGIN_GRANT_CLAIM_WINDOW_MS } from '../../security/membership';

// ============================================================================
// Access resolution
// ============================================================================

export interface AccessUser {
  id: string;
  tenantId: string;
  role: string;
}

export interface TenantAccess {
  /** The user can act in the tenant right now. */
  live: boolean;
  /** The membership row, when one exists. */
  row: {
    id: string;
    role: string;
    source: string;
    pinned: boolean;
    revokedAt: Date | null;
    expiresAt: Date | null;
  } | null;
  isHome: boolean;
  /** Effective role in the tenant (home users: `users.role`; others: the membership role). */
  role: MemberRole;
}

/** Whether `user` can act in `tenantId`, and in which capacity. */
export async function resolveTenantAccess(
  db: PrismaClient,
  user: AccessUser,
  tenantId: string,
  now: Date = new Date()
): Promise<TenantAccess> {
  const row =
    (await db.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      select: {
        id: true,
        role: true,
        source: true,
        pinned: true,
        revokedAt: true,
        expiresAt: true,
      },
    })) ?? null;
  const isHome = user.tenantId === tenantId;
  if (isHome) {
    return { live: !row || isLiveMembership(row, now), row, isHome, role: toMemberRole(user.role) };
  }
  return {
    live: !!row && isLiveMembership(row, now),
    row,
    isHome,
    role: toMemberRole(row?.role),
  };
}

// ============================================================================
// Seats and admins
// ============================================================================

/**
 * Seats in use: users whose home is the tenant (minus revoked ones), plus live NON-pinned,
 * non-HOME memberships of users whose home is elsewhere. Each user counts once (a membership is
 * unique per user and tenant). Pinned staff memberships never count.
 *
 * Defined once in `seatUserWhere` (packages/db), which `PrismaQuotaRepository.countUsers` also uses.
 */
export async function countSeats(
  db: PrismaClient,
  tenantId: string,
  now: Date = new Date()
): Promise<number> {
  return db.user.count({ where: seatUserWhere(tenantId, now) });
}

/**
 * Live ADMINs that count toward "the tenant must keep an admin": home users with role ADMIN
 * and no revoked HOME row, plus live non-pinned ADMIN memberships. Pinned staff do not count:
 * their membership expires in 24 hours and the client cannot rely on them.
 */
export async function countLiveAdmins(
  db: PrismaClient,
  tenantId: string,
  now: Date = new Date(),
  excludeUserId?: string
): Promise<number> {
  const notExcluded = excludeUserId ? { id: { not: excludeUserId } } : {};
  const [home, attached] = await Promise.all([
    db.user.count({
      where: {
        tenantId,
        role: 'ADMIN',
        ...notExcluded,
        memberships: {
          none: { tenantId, OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] },
        },
      },
    }),
    db.tenantMembership.count({
      where: {
        tenantId,
        role: 'ADMIN',
        pinned: false,
        ...liveMembershipWhere(now),
        user: { tenantId: { not: tenantId }, ...notExcluded },
      },
    }),
  ]);
  return home + attached;
}

export interface SeatLimitSource {
  getLimits?: (tenantId: string) => Promise<{ seats: number | null }>;
}

/** Test-only escape hatch, identical to the quota guard's: production can never skip. */
function seatCheckMayBeSkipped(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.QUOTA_GUARD_ALLOW_MISSING_SERVICE === '1';
}

/**
 * Take the per-tenant seat lock, then reject with `FORBIDDEN QUOTA_EXCEEDED` when one more seat
 * would pass the plan limit. Must run inside the transaction that inserts the member: the lock
 * is released at commit. The lock key is the one `PrismaQuotaRepository.runExclusive` uses, so
 * `inviteMember` and an attach cannot both take the last seat.
 *
 * Fails closed when the quota service is not wired (cost control), like `assertQuota`.
 */
export async function assertSeatAvailable(
  tx: PrismaClient,
  quota: SeatLimitSource | undefined,
  tenantId: string,
  now: Date = new Date()
): Promise<void> {
  const lockKey = `quota:${tenantId}:seats`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  if (!quota?.getLimits) {
    if (seatCheckMayBeSkipped()) return;
    console.error('[partner] quota service is not wired; refusing to skip the seat limit', {
      tenantId,
    });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Quota enforcement is unavailable, so the seats limit cannot be verified.',
    });
  }

  let limit: number | null;
  try {
    limit = (await quota.getLimits(tenantId)).seats;
  } catch (error) {
    console.error('[partner] could not read the seat limit', { tenantId, error });
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not verify the seats quota.',
    });
  }
  if (limit === null) return;

  const used = await countSeats(tx, tenantId, now);
  if (used + 1 > limit) {
    throw membershipError(
      'FORBIDDEN',
      'QUOTA_EXCEEDED',
      `Your plan's seats limit has been reached (${used} of ${limit}).`,
      new QuotaExceededError('seats', used, limit, 1)
    );
  }
}

// ============================================================================
// Audit
// ============================================================================

export type MembershipAuditAction =
  | 'LINK_ISSUED'
  | 'GRANT_CLAIMED'
  | 'MEMBER_ATTACHED'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'DENIED';

export interface MembershipAuditEntry {
  tenantId: string;
  userId?: string | null;
  partnerId?: string | null;
  action: MembershipAuditAction;
  /** `partner:<slug>` | `user:<id>` | `system` */
  actor: string;
  /** Never an assertion or a token. */
  detail?: Record<string, unknown>;
}

/** Write an audit row inside the caller's transaction, so the row commits with the change. */
export async function writeAudit(db: PrismaClient, entry: MembershipAuditEntry): Promise<void> {
  await db.tenantMembershipAudit.create({
    data: {
      tenantId: entry.tenantId,
      userId: entry.userId ?? null,
      partnerId: entry.partnerId ?? null,
      action: entry.action,
      actor: entry.actor,
      detail: (entry.detail ?? {}) as never,
    },
  });
}

/**
 * Audit a refusal. The refusal itself must not depend on the audit write (the transaction that
 * would have held it has rolled back), so a failure is logged and swallowed.
 */
export async function auditDenied(
  db: PrismaClient,
  entry: Omit<MembershipAuditEntry, 'action'>
): Promise<void> {
  try {
    await writeAudit(db, { ...entry, action: 'DENIED' });
  } catch (error) {
    console.warn('[partner] could not write a DENIED audit row:', error);
  }
}

// ============================================================================
// Session cache
// ============================================================================

type SessionCacheInvalidator = (userId: string) => void | Promise<void>;

/** The real per-instance session cache (security/session-cache.ts has no dependency on context). */
const defaultSessionCacheInvalidator: SessionCacheInvalidator = (userId) => {
  invalidateSessionCacheForUser(userId);
};

let sessionCacheInvalidator: SessionCacheInvalidator = defaultSessionCacheInvalidator;

/**
 * Override how a user's cached sessions are dropped (tests). Passing null restores the default,
 * which evicts the user from this instance's session cache. Other instances serve a revoked
 * membership for at most the 60 s cache TTL.
 */
export function registerSessionCacheInvalidator(fn: SessionCacheInvalidator | null): void {
  sessionCacheInvalidator = fn ?? defaultSessionCacheInvalidator;
}

/** Best effort: the 60 s TTL bounds staleness if this fails. */
export async function invalidateUserSessions(userId: string): Promise<void> {
  try {
    await sessionCacheInvalidator(userId);
  } catch (error) {
    console.warn('[partner] could not invalidate the session cache for a user:', error);
  }
}
