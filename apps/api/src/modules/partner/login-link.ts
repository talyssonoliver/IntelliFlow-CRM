/**
 * `partner.issueLoginLink` (ADR-071, inherited-membership contract section c).
 *
 * Two paths:
 *
 * - LEGACY (no assertion, partner not enforced): the pre-ADR-071 behaviour. The user must live in
 *   the tenant (home or a live non-pinned membership). Kept so the Portal can roll out; once
 *   `PARTNER_REQUIRE_ASSERTION` covers the partner this path answers ASSERTION_REQUIRED.
 * - ASSERTION: the Portal signed a short-lived token saying who is opening which tenant and in
 *   which capacity (`member` or `staff`). The partner API key alone is not enough.
 *
 * Everything that changes state for an assertion (JIT identity, membership, the single-use grant
 * row, the audit row and the minted link) happens in ONE transaction. A failure rolls the lot
 * back, so a legitimate retry with a NEW assertion works and the same assertion never does.
 */

import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import { requiredProdEnv } from '@intelliflow/validators/required-url';
import { supabaseAdmin } from '../../lib/supabase';
import type { PartnerContext } from '../../security/partner-auth';
import {
  AssertionError,
  isAssertionRequired,
  isInheritedMembershipEnabled,
  verifyAssertion,
  type AssertionClaims,
} from '../../security/partner-assertion';
import {
  LOGIN_LINK_TTL_SECONDS,
  assertNotOperatorEmail,
  discardAuthUser,
  ensureAuthUser,
  isUniqueViolation,
  loadPartnerTenant,
  normalizeEmail,
  resolveLoginLinkNext,
  type EnsuredAuthUser,
} from './partner-helpers';
import {
  LOGIN_GRANT_CLAIM_WINDOW_MS,
  STAFF_MEMBERSHIP_TTL_MS,
  assertSeatAvailable,
  auditDenied,
  liveMembershipWhere,
  membershipError,
  reasonOf,
  resolveTenantAccess,
  toMemberRole,
  toStoredRole,
  writeAudit,
  type MemberRole,
  type SeatLimitSource,
} from './membership';

export interface LoginLinkInput {
  tenantId: string;
  email: string;
  redirectTo?: string;
  assertion?: string;
}

export interface LoginLinkOutput {
  url: string;
  expiresAt: string;
  pinned?: boolean;
  role?: MemberRole;
}

export interface LoginLinkContext {
  prisma: PrismaClient;
  partner: PartnerContext;
  services?: { quota?: SeatLimitSource };
}

type TenantRow = Awaited<ReturnType<typeof loadPartnerTenant>>;

interface PartnerTrust {
  assertionPublicKey: string | null;
  ownerTenantId: string | null;
}

/** Same key `provisionTenant` takes, so two requests cannot both create one Auth identity. */
const emailLockKey = (email: string) => `partner-provision-email:${email}`;

/** Fields written to the DENIED audit row. Never an assertion or a token. */
type DenyDetail = Record<string, unknown>;

export async function issueLoginLink(
  ctx: LoginLinkContext,
  input: LoginLinkInput
): Promise<LoginLinkOutput> {
  const { prisma, partner } = ctx;
  const tenant = await loadPartnerTenant(prisma, partner, input.tenantId);
  const email = normalizeEmail(input.email);
  const detail: DenyDetail = {};

  try {
    return await run(ctx, input, tenant, email, detail);
  } catch (error) {
    const reason = reasonOf(error);
    if (reason) {
      await auditDenied(prisma, {
        tenantId: tenant.id,
        partnerId: partner.id,
        actor: `partner:${partner.slug}`,
        detail: { ...detail, reason },
      });
    }
    throw error;
  }
}

async function run(
  ctx: LoginLinkContext,
  input: LoginLinkInput,
  tenant: TenantRow,
  email: string,
  detail: DenyDetail
): Promise<LoginLinkOutput> {
  const { prisma, partner } = ctx;

  if (!input.assertion) {
    detail.kind = 'none';
    if (isAssertionRequired(partner.slug)) {
      throw membershipError(
        'FORBIDDEN',
        'ASSERTION_REQUIRED',
        'A Portal-signed assertion is required to issue a login link.'
      );
    }
    return legacyLink(ctx, input, tenant, email);
  }

  const trust = await loadTrust(prisma, partner.id);
  const claims = checkAssertion(input.assertion, trust, partner, tenant, email, detail);
  detail.kind = claims.kind;
  detail.jti = claims.jti;

  if (claims.kind === 'staff') {
    if (!isInheritedMembershipEnabled() || !trust.ownerTenantId) {
      throw membershipError(
        'FORBIDDEN',
        'STAFF_NOT_PROVISIONED',
        'Staff access is not enabled for this partner.'
      );
    }
  } else {
    // A platform operator can only ever arrive as pinned staff.
    assertNotOperatorEmail(email);
  }

  return assertionLink(ctx, input, tenant, email, claims, trust);
}

// ============================================================================
// Assertion verification (contract section b)
// ============================================================================

async function loadTrust(prisma: PrismaClient, partnerId: string): Promise<PartnerTrust> {
  const row = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { assertionPublicKey: true, ownerTenantId: true },
  });
  return {
    assertionPublicKey: row?.assertionPublicKey ?? null,
    ownerTenantId: row?.ownerTenantId ?? null,
  };
}

/** Steps 1 to 9. Any failure is `ASSERTION_INVALID` to the caller and a named check in the audit. */
function checkAssertion(
  assertion: string,
  trust: PartnerTrust,
  partner: PartnerContext,
  tenant: TenantRow,
  email: string,
  detail: DenyDetail
): AssertionClaims {
  const invalid = (check: string) => {
    detail.check = check;
    return membershipError('FORBIDDEN', 'ASSERTION_INVALID', 'The login assertion is not valid.');
  };

  let claims: AssertionClaims;
  try {
    claims = verifyAssertion({
      assertion,
      publicKeyPem: trust.assertionPublicKey,
      partnerSlug: partner.slug,
      email,
    });
  } catch (error) {
    if (error instanceof AssertionError) throw invalid(error.check);
    throw error;
  }

  // 9. The assertion's tenant is the tenant of this call, and the partner sourced it.
  const ref = claims.tenant;
  const sameTenant =
    tenant.partnerId === partner.id &&
    (ref.externalRef !== undefined
      ? tenant.externalRef === ref.externalRef
      : tenant.id === ref.tenantId);
  if (!sameTenant) throw invalid('tenant_mismatch');

  return claims;
}

// ============================================================================
// Link minting
// ============================================================================

async function mintHashedToken(email: string): Promise<string> {
  // The link points INTO our app, not at Supabase's /verify endpoint. Supabase would redirect to
  // its Site URL (or an implicit-flow #access_token fragment nothing consumes), so we hand out
  // only the hashed OTP and let /auth/callback exchange it with verifyOtp.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    console.error('[partner] generateLink failed:', error?.message);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not issue a login link.',
    });
  }
  return hashedToken;
}

function buildUrl(params: {
  hashedToken: string;
  tenantId: string;
  grantId: string | null;
  redirectTo: string | undefined;
}): string {
  const appUrl = requiredProdEnv('APP_URL', process.env.APP_URL, 'http://localhost:3000');
  const callback = new URL('/auth/callback', appUrl);
  callback.searchParams.set('token_hash', params.hashedToken);
  callback.searchParams.set('type', 'magiclink');
  // `tenant` and `grant` are hints: the server validates both when they are used.
  callback.searchParams.set('tenant', params.tenantId);
  if (params.grantId) callback.searchParams.set('grant', params.grantId);
  callback.searchParams.set('next', resolveLoginLinkNext(params.redirectTo, appUrl));
  return callback.toString();
}

function otpExpiry(now: Date): Date {
  return new Date(now.getTime() + LOGIN_LINK_TTL_SECONDS * 1000);
}

// ============================================================================
// Legacy path: key only, no assertion
// ============================================================================

async function legacyLink(
  ctx: LoginLinkContext,
  input: LoginLinkInput,
  tenant: TenantRow,
  email: string
): Promise<LoginLinkOutput> {
  const { prisma, partner } = ctx;
  // Platform-operator rights derive from the verified email (PLATFORM_ADMIN_EMAILS), so a magic
  // link for an operator address would hand a partner platform-admin access even when that
  // operator's user row sits in a partner-sourced tenant.
  assertNotOperatorEmail(email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true },
  });

  let allowed = false;
  if (user) {
    const access = await resolveTenantAccess(prisma, user, tenant.id);
    // Away from home only a live, NON-pinned membership counts, and only while the feature is
    // on. A pinned (staff) membership is reachable through a signed assertion alone.
    allowed = access.isHome
      ? access.live
      : isInheritedMembershipEnabled() && access.live && access.row?.pinned === false;
  }
  if (!user || !allowed) {
    throw membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'This user is not a member of the tenant.');
  }

  const hashedToken = await mintHashedToken(email);
  const now = new Date();
  const expiresAt = otpExpiry(now);

  // The grant row is an audit record on this path; a failure to write it must not block a login.
  let grantId: string | null = null;
  try {
    const grant = await prisma.partnerLoginGrant.create({
      data: {
        partnerId: partner.id,
        userId: user.id,
        tenantId: tenant.id,
        kind: 'legacy',
        role: toStoredRole(toMemberRole(user.role)),
        pinned: false,
        jti: null,
        expiresAt,
      },
      select: { id: true },
    });
    grantId = grant?.id ?? null;
    await writeAudit(prisma, {
      tenantId: tenant.id,
      userId: user.id,
      partnerId: partner.id,
      action: 'LINK_ISSUED',
      actor: `partner:${partner.slug}`,
      detail: { kind: 'legacy', grantId },
    });
  } catch (error) {
    console.warn('[partner] could not record a legacy login grant:', error);
  }

  return {
    url: buildUrl({
      hashedToken,
      tenantId: tenant.id,
      grantId,
      redirectTo: input.redirectTo,
    }),
    expiresAt: expiresAt.toISOString(),
  };
}

// ============================================================================
// Assertion path
// ============================================================================

interface UserRow {
  id: string;
  tenantId: string;
  role: string;
}

async function assertionLink(
  ctx: LoginLinkContext,
  input: LoginLinkInput,
  tenant: TenantRow,
  email: string,
  claims: AssertionClaims,
  trust: PartnerTrust
): Promise<LoginLinkOutput> {
  const { prisma, partner } = ctx;
  const actor = `partner:${partner.slug}`;
  let authUser: EnsuredAuthUser | undefined;

  try {
    return await prisma.$transaction(
      async (rawTx) => {
        const tx = rawTx as PrismaClient;
        const now = new Date();

        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${emailLockKey(email)}, 0))`;

        // 10 (early). A replay is rejected before any identity is created. The unique
        // (partnerId, jti) index below is the arbiter when two replays race.
        const seen = await tx.partnerLoginGrant.findFirst({
          where: { partnerId: partner.id, jti: claims.jti },
          select: { id: true },
        });
        if (seen) {
          throw membershipError(
            'FORBIDDEN',
            'ASSERTION_INVALID',
            'The login assertion is not valid.'
          );
        }

        const existing = (await tx.user.findUnique({
          where: { email },
          select: { id: true, tenantId: true, role: true },
        })) as UserRow | null;

        let userId: string;
        let attached: boolean;
        let created = false;
        if (claims.kind === 'staff') {
          userId = await attachStaff(tx, tenant, partner, claims, trust, existing, now);
          attached = true;
        } else if (!existing) {
          authUser = await createMemberIdentity(tx, ctx, tenant, email, claims);
          userId = authUser.id;
          created = true;
          attached = true;
        } else {
          userId = existing.id;
          attached = await attachMember(tx, ctx, tenant, partner, claims, trust, existing, now);
        }

        const pinned = claims.kind === 'staff';
        // A home user keeps the role they hold in the CRM (the Portal syncs role changes through
        // setMemberRole); everyone else is granted the role the Portal asserted.
        const role: MemberRole =
          claims.kind === 'member' && existing && existing.tenantId === tenant.id
            ? toMemberRole(existing.role)
            : claims.role;
        const grantExpiresAt = new Date(now.getTime() + LOGIN_GRANT_CLAIM_WINDOW_MS);
        let grantId: string;
        try {
          const grant = await tx.partnerLoginGrant.create({
            data: {
              partnerId: partner.id,
              userId,
              tenantId: tenant.id,
              kind: claims.kind,
              role: toStoredRole(role),
              pinned,
              jti: claims.jti,
              expiresAt: grantExpiresAt,
            },
            select: { id: true },
          });
          grantId = grant.id;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw membershipError(
              'FORBIDDEN',
              'ASSERTION_INVALID',
              'The login assertion is not valid.'
            );
          }
          throw error;
        }

        const hashedToken = await mintHashedToken(email);

        if (attached) {
          await writeAudit(tx, {
            tenantId: tenant.id,
            userId,
            partnerId: partner.id,
            action: 'MEMBER_ATTACHED',
            actor,
            detail: { kind: claims.kind, role, created, jti: claims.jti },
          });
        }
        await writeAudit(tx, {
          tenantId: tenant.id,
          userId,
          partnerId: partner.id,
          action: 'LINK_ISSUED',
          actor,
          detail: { kind: claims.kind, role, jti: claims.jti, grantId },
        });

        const expiresAt = new Date(Math.min(otpExpiry(now).getTime(), grantExpiresAt.getTime()));
        return {
          url: buildUrl({
            hashedToken,
            tenantId: tenant.id,
            grantId,
            redirectTo: input.redirectTo,
          }),
          expiresAt: expiresAt.toISOString(),
          pinned,
          role,
        };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  } catch (error) {
    // The transaction rolled back, so no CRM row references an Auth user created for it.
    if (authUser) await discardAuthUser(prisma, authUser);
    throw error;
  }
}

/** kind=staff: the identity must already exist in the partner's own organisation tenant. */
async function attachStaff(
  tx: PrismaClient,
  tenant: TenantRow,
  partner: PartnerContext,
  claims: AssertionClaims,
  trust: PartnerTrust,
  user: UserRow | null,
  now: Date
): Promise<string> {
  if (!user || !trust.ownerTenantId || user.tenantId !== trust.ownerTenantId) {
    throw membershipError(
      'FORBIDDEN',
      'STAFF_NOT_PROVISIONED',
      'This person is not provisioned as staff of the partner.'
    );
  }
  // Staff reach CLIENT workspaces only. The pinned row would overwrite the user's HOME membership
  // (clearing a revocation, then expiring in 24 h and locking them out of their own workspace).
  if (tenant.id === user.tenantId) {
    throw membershipError(
      'FORBIDDEN',
      'STAFF_NOT_PROVISIONED',
      'Staff access applies to client workspaces, not the partner own workspace.'
    );
  }
  // Pinned, expiring, never counted as a seat. Refreshed on every link.
  const expiresAt = new Date(now.getTime() + STAFF_MEMBERSHIP_TTL_MS);
  const data = {
    role: toStoredRole(claims.role),
    source: 'PORTAL_STAFF' as const,
    grantedByPartnerId: partner.id,
    pinned: true,
    expiresAt,
    revokedAt: null,
  };
  await tx.tenantMembership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, ...data },
    update: data,
  });
  return user.id;
}

/** kind=member, identity absent: create it (home = this tenant) after the seat check. */
async function createMemberIdentity(
  tx: PrismaClient,
  ctx: LoginLinkContext,
  tenant: TenantRow,
  email: string,
  claims: AssertionClaims
): Promise<EnsuredAuthUser> {
  await assertSeatAvailable(tx, ctx.services?.quota, tenant.id);

  let authUser: EnsuredAuthUser;
  try {
    authUser = await ensureAuthUser(email);
  } catch (error) {
    // An Auth identity with no CRM user is an account we know nothing about: never adopted.
    if (error instanceof TRPCError && error.code === 'CONFLICT') {
      throw membershipError(
        'CONFLICT',
        'ACCOUNT_IN_OTHER_TENANT',
        'This email belongs to an existing account that is not part of this partner.'
      );
    }
    throw error;
  }
  await tx.user.create({
    data: {
      id: authUser.id,
      email,
      name: email.split('@')[0],
      role: toStoredRole(claims.role),
      tenantId: tenant.id,
      provider: 'partner',
    },
  });
  return authUser;
}

/** True when this call attached the user (new or revived), so the caller audits MEMBER_ATTACHED. */
async function attachMember(
  tx: PrismaClient,
  ctx: LoginLinkContext,
  tenant: TenantRow,
  partner: PartnerContext,
  claims: AssertionClaims,
  trust: PartnerTrust,
  user: UserRow,
  now: Date
): Promise<boolean> {
  const quota = ctx.services?.quota;

  if (user.tenantId === tenant.id) {
    // A home user: the Portal vouches for them, which also revives a removal.
    const access = await resolveTenantAccess(tx, user, tenant.id, now);
    if (access.live) return false;
    await assertSeatAvailable(tx, quota, tenant.id, now);
    await tx.tenantMembership.update({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      data: { revokedAt: null, expiresAt: null },
    });
    return true;
  }

  if (!isInheritedMembershipEnabled()) {
    throw membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'This user is not a member of the tenant.');
  }
  // The partner's own staff enter only as pinned staff, never as unpinned members.
  if (trust.ownerTenantId && user.tenantId === trust.ownerTenantId) {
    throw membershipError(
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT',
      'This email belongs to an account that is not a client of this partner.'
    );
  }
  if (!(await inPartnerFootprint(tx, user, partner.id, now))) {
    throw membershipError(
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT',
      'This email belongs to an account that is not a client of this partner.'
    );
  }

  const row = await tx.tenantMembership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    select: { pinned: true, revokedAt: true, expiresAt: true },
  });
  if (row?.pinned) {
    throw membershipError(
      'CONFLICT',
      'ACCOUNT_IN_OTHER_TENANT',
      'This email belongs to an account that is not a client of this partner.'
    );
  }
  const wasLive =
    !!row && row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now);
  if (!wasLive) await assertSeatAvailable(tx, quota, tenant.id, now);

  const data = {
    role: toStoredRole(claims.role),
    source: 'PORTAL_MEMBER' as const,
    grantedByPartnerId: partner.id,
    pinned: false,
    expiresAt: null,
    revokedAt: null,
  };
  await tx.tenantMembership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    create: { userId: user.id, tenantId: tenant.id, ...data },
    update: data,
  });
  return !wasLive;
}

/**
 * Partner footprint: the identity's home tenant was sourced by this partner, or the identity holds
 * a live membership this partner granted. Anything else is somebody else's account.
 */
async function inPartnerFootprint(
  tx: PrismaClient,
  user: UserRow,
  partnerId: string,
  now: Date
): Promise<boolean> {
  const home = await tx.tenant.findUnique({
    where: { id: user.tenantId },
    select: { partnerId: true },
  });
  if (home?.partnerId === partnerId) return true;
  const granted = await tx.tenantMembership.findFirst({
    where: { userId: user.id, grantedByPartnerId: partnerId, ...liveMembershipWhere(now) },
    select: { id: true },
  });
  return !!granted;
}
