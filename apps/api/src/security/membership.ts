/**
 * Inherited tenant membership: active-tenant resolution (ADR-071).
 *
 * A user has one HOME tenant (`users.tenantId`) and may hold memberships in others
 * (`tenant_memberships`). Every request acts in exactly one ACTIVE tenant:
 *
 *   1. PINNED session  - the Supabase session was claimed from a staff login grant. It acts in
 *      the grant's tenant, ignores the `x-active-tenant` header, and expires after 12 hours.
 *   2. PIN_PENDING     - the session came from a staff magic link that has not been claimed
 *      yet. It must not fall through to the staff member's own home tenant, so only
 *      `user.claimLoginGrant` is allowed.
 *   3. Header          - `x-active-tenant` selects the home tenant or a live, non-pinned
 *      membership. Anything else is `FORBIDDEN NOT_A_MEMBER`.
 *   4. Default         - the home tenant.
 *
 * Pinned detection and PIN_PENDING are data driven and deliberately NOT behind the
 * `INHERITED_MEMBERSHIP_ENABLED` flag: switching the flag off for rollback must never turn an
 * existing pinned session into a home-tenant session. Only header switching is gated.
 *
 * Specification: docs/architecture/contracts/inherited-membership.v1.md (section c).
 */

import { TRPCError, type TRPC_ERROR_CODE_KEY } from '@trpc/server';
import {
  isLiveMembership,
  liveMembershipWhere,
  seatUserWhere,
  type MembershipLiveness,
  type PrismaClient,
} from '@intelliflow/db';
import {
  ACTIVE_TENANT_HEADER,
  MEMBERSHIP_ERROR_REASONS,
  type MembershipErrorReason,
} from '@intelliflow/partner-sdk';

export { ACTIVE_TENANT_HEADER };

/** A pinned (staff) session stops working this long after the grant is claimed. */
export const PINNED_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** A staff membership expires this long after it was last refreshed by a Portal link. */
export const STAFF_MEMBERSHIP_TTL_MS = 24 * 60 * 60 * 1000;
/** Supabase `otp_expiry` (supabase/config.toml): how long the magic link's OTP stays redeemable. */
const SUPABASE_OTP_LIFETIME_SECONDS = 3600;
/**
 * A login grant can be claimed for this long after it was issued.
 *
 * It MUST cover the whole OTP lifetime. The pin-pending check is evaluated by the OTP timestamp
 * falling inside the grant window, so a window shorter than the OTP would let a staff link that
 * is redeemed late resolve to the staff member's HOME tenant instead of staying PIN_PENDING.
 */
export const LOGIN_GRANT_CLAIM_WINDOW_MS =
  Math.max(SUPABASE_OTP_LIFETIME_SECONDS, Number(process.env.PARTNER_LOGIN_LINK_TTL_SECONDS) || 0) *
  1000;
/** Clock skew tolerated between the grant's `issuedAt` and the session's OTP timestamp. */
export const GRANT_CLOCK_LEEWAY_MS = 5_000;

/** Supabase `amr` methods a magic link can produce (`otp` per contract; older GoTrue: `magiclink`). */
const LINK_AMR_METHODS = new Set(['otp', 'magiclink']);

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

/** `INHERITED_MEMBERSHIP_ENABLED`: `1` or `true` turns header switching and staff links on. */
export function isInheritedMembershipEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.INHERITED_MEMBERSHIP_ENABLED?.trim().toLowerCase();
  return value === '1' || value === 'true';
}

// ---------------------------------------------------------------------------
// Errors with a machine-readable reason
// ---------------------------------------------------------------------------

const KNOWN_REASONS = new Set<string>(MEMBERSHIP_ERROR_REASONS);

/** Carried in `TRPCError.cause`; the shared errorFormatter copies `reason` to `error.data.reason`. */
export class MembershipReasonCause extends Error {
  constructor(
    readonly reason: MembershipErrorReason,
    message: string
  ) {
    super(message);
    this.name = 'MembershipReasonCause';
  }
}

/**
 * Build the contract error: tRPC `code`, message `<REASON>: <text>`, and `cause.reason`.
 * Exported for the partner module, which throws the same shape.
 */
export function membershipError(
  code: TRPC_ERROR_CODE_KEY,
  reason: MembershipErrorReason,
  text: string
): TRPCError {
  const message = `${reason}: ${text}`;
  return new TRPCError({ code, message, cause: new MembershipReasonCause(reason, message) });
}

/** The machine reason carried by a tRPC error cause, or null. Used by the errorFormatter. */
export function reasonFromCause(cause: unknown): MembershipErrorReason | null {
  const reason = (cause as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' && KNOWN_REASONS.has(reason)
    ? (reason as MembershipErrorReason)
    : null;
}

// ---------------------------------------------------------------------------
// Membership predicates and role mapping
// ---------------------------------------------------------------------------

// The predicates live in @intelliflow/db so the quota adapter shares them.
export { isLiveMembership, liveMembershipWhere, seatUserWhere, type MembershipLiveness };

export type StoredMemberRole = 'ADMIN' | 'USER';
export type WireMemberRole = 'ADMIN' | 'MEMBER';

/** Stored role (`UserRole`) to the wire role used by the Partner contract. */
export function toWireRole(role: string): WireMemberRole {
  return role === 'ADMIN' ? 'ADMIN' : 'MEMBER';
}

/** Wire role to the stored role. Only ADMIN and USER are ever written to a membership. */
export function toStoredRole(role: WireMemberRole): StoredMemberRole {
  return role === 'ADMIN' ? 'ADMIN' : 'USER';
}

// ---------------------------------------------------------------------------
// Reading the active/home tenant off a session
// ---------------------------------------------------------------------------

/** The tenant the user lives in, regardless of which tenant the request acts in. */
export function getHomeTenantId(user: { tenantId: string; homeTenantId?: string }): string {
  return user.homeTenantId ?? user.tenantId;
}

/** True when the request acts in a tenant other than the user's home tenant. */
export function isActingOutsideHome(
  user: { tenantId: string; homeTenantId?: string } | null | undefined
): boolean {
  return Boolean(user?.homeTenantId && user.homeTenantId !== user.tenantId);
}

// ---------------------------------------------------------------------------
// Session claims
// ---------------------------------------------------------------------------

export interface AmrEntry {
  method: string;
  /** Seconds since epoch. */
  timestamp: number;
}

export interface SessionClaims {
  /** Supabase `session_id`; one browser session keeps it across token refreshes. */
  sessionId: string | null;
  amr: AmrEntry[];
}

const NO_CLAIMS: SessionClaims = { sessionId: null, amr: [] };

/**
 * Read `session_id` and `amr` from a JWT payload.
 *
 * ONLY call this for a token that `verifyToken` already accepted: the payload is decoded, not
 * verified, here. A malformed token yields no claims, which resolves fail-closed (a session
 * without an id can never be pinned, and an OTP session without one stays PIN_PENDING).
 */
export function decodeSessionClaims(token: string): SessionClaims {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return NO_CLAIMS;
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      session_id?: unknown;
      amr?: unknown;
    };
    const amr = Array.isArray(payload.amr)
      ? payload.amr.filter(
          (e): e is AmrEntry =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as AmrEntry).method === 'string' &&
            typeof (e as AmrEntry).timestamp === 'number'
        )
      : [];
    return {
      sessionId:
        typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : null,
      amr,
    };
  } catch {
    return NO_CLAIMS;
  }
}

// ---------------------------------------------------------------------------
// Active-tenant resolution
// ---------------------------------------------------------------------------

type MembershipDb = Pick<PrismaClient, 'tenantMembership' | 'partnerLoginGrant'>;

export interface ResolveActiveTenantInput {
  userId: string;
  homeTenantId: string;
  homeRole: string;
  claims: SessionClaims;
  /** Value of the `x-active-tenant` header (already trimmed), or null. */
  requestedTenantId: string | null;
  now?: Date;
  /** Defaults to the INHERITED_MEMBERSHIP_ENABLED flag. */
  inheritedEnabled?: boolean;
}

export interface ActiveTenantResolution {
  activeTenantId: string;
  homeTenantId: string;
  /** Role inside the active tenant: the home role at home, the membership role elsewhere. */
  role: string;
  /** The membership role when acting through a membership, else null. */
  membershipRole: StoredMemberRole | null;
  pinned: boolean;
  /** An unclaimed staff link session: only `user.claimLoginGrant` is allowed. */
  pinPending: boolean;
  /** The claimed grant of a pinned session. */
  grantId: string | null;
  actingOutsideHome: boolean;
}

function atHome(input: ResolveActiveTenantInput, pinPending = false): ActiveTenantResolution {
  return {
    activeTenantId: input.homeTenantId,
    homeTenantId: input.homeTenantId,
    role: input.homeRole,
    membershipRole: null,
    pinned: false,
    pinPending,
    grantId: null,
    actingOutsideHome: false,
  };
}

type MembershipRow = {
  tenantId: string;
  role: string;
  source: string;
  pinned: boolean;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

function storedRole(role: string): StoredMemberRole {
  return role === 'ADMIN' ? 'ADMIN' : 'USER';
}

/**
 * Step 1: this browser session claimed a staff grant, so it acts in the grant's tenant. Returns
 * null when the session has not claimed any grant. Throws UNAUTHORIZED when the 12 hour window or
 * the membership has ended; it never falls back to the home tenant.
 */
async function resolvePinnedSession(
  prisma: MembershipDb,
  input: ResolveActiveTenantInput,
  rows: MembershipRow[],
  now: Date
): Promise<ActiveTenantResolution | null> {
  const { userId, claims } = input;
  if (!claims.sessionId) return null;

  const grant = await prisma.partnerLoginGrant.findFirst({
    where: { userId, claimedSessionId: claims.sessionId, pinned: true },
    orderBy: { claimedAt: 'desc' },
    select: { id: true, tenantId: true, sessionExpiresAt: true },
  });
  if (!grant) return null;

  if (!grant.sessionExpiresAt || grant.sessionExpiresAt.getTime() <= now.getTime()) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'This staff session has expired. Open the CRM again from the Portal.',
    });
  }
  const membership = rows.find((r) => r.tenantId === grant.tenantId);
  if (!membership || !isLiveMembership(membership, now)) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Your access to this workspace has ended.',
    });
  }
  return {
    activeTenantId: grant.tenantId,
    homeTenantId: input.homeTenantId,
    role: membership.role,
    membershipRole: storedRole(membership.role),
    pinned: true,
    pinPending: false,
    grantId: grant.id,
    actingOutsideHome: grant.tenantId !== input.homeTenantId,
  };
}

/**
 * Step 2: is this a magic-link session whose OTP time falls inside a pinned grant's claim window
 * and that has not claimed it? Evaluated by data, so it stays true after the window closes.
 */
async function isPinPending(
  prisma: MembershipDb,
  input: ResolveActiveTenantInput
): Promise<boolean> {
  const { userId, claims } = input;
  const linkTimes = claims.amr
    .filter((e) => LINK_AMR_METHODS.has(e.method))
    .map((e) => e.timestamp * 1000);
  if (linkTimes.length === 0) return false;

  // A session that has claimed ANY grant is not waiting for a pin: a pinned claim was resolved in
  // step 1, and a non-pinned claim (a staff member's own home-tenant link opened inside another
  // grant's window) must not stay locked behind somebody else's pinned grant.
  if (claims.sessionId) {
    const own = await prisma.partnerLoginGrant.findFirst({
      where: { userId, claimedSessionId: claims.sessionId },
      select: { id: true },
    });
    if (own) return false;
  }

  const candidates = await prisma.partnerLoginGrant.findMany({
    where: {
      userId,
      pinned: true,
      expiresAt: { gte: new Date(Math.min(...linkTimes)) },
      issuedAt: { lte: new Date(Math.max(...linkTimes) + GRANT_CLOCK_LEEWAY_MS) },
    },
    select: { issuedAt: true, expiresAt: true, claimedSessionId: true },
  });
  return candidates.some(
    (g) =>
      // Unclaimed, or claimed by a different browser session.
      (g.claimedSessionId === null || g.claimedSessionId !== claims.sessionId) &&
      linkTimes.some(
        (t) => t >= g.issuedAt.getTime() - GRANT_CLOCK_LEEWAY_MS && t <= g.expiresAt.getTime()
      )
  );
}

/** Steps 3 and 4: the home tenant, or a live non-pinned membership selected by the header. */
function resolveByHeader(
  input: ResolveActiveTenantInput,
  rows: MembershipRow[],
  now: Date,
  inheritedEnabled: boolean
): ActiveTenantResolution {
  const requested = input.requestedTenantId;
  if (!requested || requested === input.homeTenantId) {
    const homeRow = rows.find((r) => r.tenantId === input.homeTenantId);
    if (homeRow && !isLiveMembership(homeRow, now)) {
      // partner.removeMember revoked the home membership: the user may not act here.
      throw membershipError(
        'FORBIDDEN',
        'NOT_A_MEMBER',
        'Your access to this workspace has been removed.'
      );
    }
    return atHome(input);
  }

  const membership = inheritedEnabled
    ? rows.find((r) => r.tenantId === requested && !r.pinned && isLiveMembership(r, now))
    : undefined;
  if (!membership) {
    throw membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'You are not a member of this workspace.');
  }
  return {
    activeTenantId: requested,
    homeTenantId: input.homeTenantId,
    role: membership.role,
    membershipRole: storedRole(membership.role),
    pinned: false,
    pinPending: false,
    grantId: null,
    actingOutsideHome: true,
  };
}

/**
 * Decide which tenant a request acts in. Throws `UNAUTHORIZED` (pinned session expired or its
 * membership revoked) or `FORBIDDEN NOT_A_MEMBER` (header names a tenant the user cannot use,
 * or the home membership was revoked). A PIN_PENDING session is returned, not thrown, so the
 * caller can still let `user.claimLoginGrant` through.
 *
 * Cost for an ordinary user: ONE indexed read of their membership rows (usually none).
 * Grants are only read when the user holds a pinned (staff) membership.
 */
export async function resolveActiveTenant(
  prisma: MembershipDb,
  input: ResolveActiveTenantInput
): Promise<ActiveTenantResolution> {
  const now = input.now ?? new Date();
  const inheritedEnabled = input.inheritedEnabled ?? isInheritedMembershipEnabled();

  const rows: MembershipRow[] = await prisma.tenantMembership.findMany({
    where: { userId: input.userId },
    select: {
      tenantId: true,
      role: true,
      source: true,
      pinned: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (rows.some((r) => r.pinned)) {
    const pinned = await resolvePinnedSession(prisma, input, rows, now);
    if (pinned) return pinned;
    if (await isPinPending(prisma, input)) return atHome(input, true);
  }

  return resolveByHeader(input, rows, now, inheritedEnabled);
}
