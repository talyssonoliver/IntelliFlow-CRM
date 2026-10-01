/**
 * `partner.removeMember`, `partner.setMemberRole`, `partner.listMembers` (ADR-071 section c).
 *
 * The Portal calls these after its own write succeeded (a portal user removed or demoted), so
 * the CRM stops trusting a person the Portal no longer vouches for. All three only act on
 * tenants the calling partner sourced.
 *
 * Writes take one advisory lock per tenant, so two concurrent removals cannot each see "another
 * admin remains" and leave the tenant with none.
 */

import type { PrismaClient } from '@intelliflow/db';
import {
  countLiveAdmins,
  invalidateUserSessions,
  isLiveMembership,
  membershipError,
  resolveTenantAccess,
  toMemberRole,
  toStoredRole,
  writeAudit,
  type MemberRole,
} from './membership';
import { loadPartnerTenant, normalizeEmail } from './partner-helpers';
import type { PartnerContext } from '../../security/partner-auth';

export interface MembersContext {
  prisma: PrismaClient;
  partner: PartnerContext;
}

const tenantLockKey = (tenantId: string) => `partner-members:${tenantId}`;

async function lockTenantMembers(tx: PrismaClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantLockKey(tenantId)}, 0))`;
}

// ============================================================================
// removeMember
// ============================================================================

export async function removeMember(
  ctx: MembersContext,
  input: { tenantId: string; email: string }
): Promise<{ removed: boolean }> {
  const { prisma, partner } = ctx;
  const tenant = await loadPartnerTenant(prisma, partner, input.tenantId);
  const email = normalizeEmail(input.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true },
  });
  if (!user) return { removed: false };

  const removed = await prisma.$transaction(
    async (rawTx) => {
      const tx = rawTx as PrismaClient;
      const now = new Date();
      await lockTenantMembers(tx, tenant.id);

      const access = await resolveTenantAccess(tx, user, tenant.id, now);
      if (!access.live) return false;

      // Pinned staff are not "the tenant's admins": they can always be removed.
      if (access.role === 'ADMIN' && !access.row?.pinned) {
        const others = await countLiveAdmins(tx, tenant.id, now, user.id);
        if (others === 0) {
          throw membershipError(
            'CONFLICT',
            'LAST_ADMIN',
            'This is the only admin of the tenant; promote another member first.'
          );
        }
      }

      if (access.row) {
        await tx.tenantMembership.update({
          where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
          data: { revokedAt: now },
        });
      } else {
        // A home user has no row until a revocation needs one. The identity itself is never
        // deleted here; only an operator moves it out of the tenant.
        await tx.tenantMembership.create({
          data: {
            userId: user.id,
            tenantId: tenant.id,
            role: toStoredRole(access.role),
            source: 'HOME',
            revokedAt: now,
          },
        });
      }

      // Close every session this person holds in the tenant, and any link not yet used.
      await tx.partnerLoginGrant.updateMany({
        where: { userId: user.id, tenantId: tenant.id, sessionExpiresAt: { not: null } },
        data: { sessionExpiresAt: now },
      });
      await tx.partnerLoginGrant.updateMany({
        where: { userId: user.id, tenantId: tenant.id, claimedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });

      await writeAudit(tx, {
        tenantId: tenant.id,
        userId: user.id,
        partnerId: partner.id,
        action: 'MEMBER_REMOVED',
        actor: `partner:${partner.slug}`,
        detail: { role: access.role, pinned: !!access.row?.pinned, home: access.isHome },
      });
      return true;
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

  if (removed) await invalidateUserSessions(user.id);
  return { removed };
}

// ============================================================================
// setMemberRole
// ============================================================================

export async function setMemberRole(
  ctx: MembersContext,
  input: { tenantId: string; email: string; role: MemberRole }
): Promise<{ userId: string; role: MemberRole; changed: boolean }> {
  const { prisma, partner } = ctx;
  const tenant = await loadPartnerTenant(prisma, partner, input.tenantId);
  const email = normalizeEmail(input.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, tenantId: true, role: true },
  });
  if (!user) {
    throw membershipError('FORBIDDEN', 'NOT_A_MEMBER', 'This user is not a member of the tenant.');
  }

  const result = await prisma.$transaction(
    async (rawTx) => {
      const tx = rawTx as PrismaClient;
      const now = new Date();
      await lockTenantMembers(tx, tenant.id);

      const access = await resolveTenantAccess(tx, user, tenant.id, now);
      if (!access.live) {
        throw membershipError(
          'FORBIDDEN',
          'NOT_A_MEMBER',
          'This user is not a member of the tenant.'
        );
      }
      if (access.row?.pinned) {
        throw membershipError(
          'FORBIDDEN',
          'HOME_ONLY',
          'pinned memberships are managed by assertion'
        );
      }
      if (access.role === input.role) {
        return { userId: user.id, role: input.role, changed: false };
      }

      if (access.role === 'ADMIN') {
        const others = await countLiveAdmins(tx, tenant.id, now, user.id);
        if (others === 0) {
          throw membershipError(
            'CONFLICT',
            'LAST_ADMIN',
            'This is the only admin of the tenant; promote another member first.'
          );
        }
      }

      const stored = toStoredRole(input.role);
      if (access.isHome) {
        // For a home user `users.role` is the source of truth; the row (when one exists)
        // mirrors it.
        await tx.user.update({ where: { id: user.id }, data: { role: stored } });
        if (access.row) {
          await tx.tenantMembership.update({
            where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
            data: { role: stored },
          });
        }
      } else {
        await tx.tenantMembership.update({
          where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
          data: { role: stored },
        });
      }

      await writeAudit(tx, {
        tenantId: tenant.id,
        userId: user.id,
        partnerId: partner.id,
        action: 'ROLE_CHANGED',
        actor: `partner:${partner.slug}`,
        detail: { from: access.role, role: input.role },
      });
      return { userId: user.id, role: input.role, changed: true };
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

  if (result.changed) await invalidateUserSessions(user.id);
  return result;
}

// ============================================================================
// listMembers
// ============================================================================

export interface MemberListItem {
  userId: string;
  email: string;
  name: string | null;
  role: MemberRole;
  source: 'HOME' | 'PORTAL_MEMBER' | 'PORTAL_STAFF' | 'OWNER_INVITE' | 'PARTNER_CREATED';
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
}

type ListedSource = MemberListItem['source'];

interface HomeUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  provider: string | null;
  createdAt: Date;
}

interface MembershipListRow {
  userId: string;
  role: string;
  source: ListedSource;
  pinned: boolean;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  user: { id: string; email: string; name: string | null; tenantId: string };
}

/** A home user's source: a row's own source, else `PARTNER_CREATED` for partner-made users. */
function homeSource(user: HomeUserRow, row: MembershipListRow | undefined): ListedSource {
  if (row && row.source !== 'HOME') return row.source;
  return user.provider === 'partner' ? 'PARTNER_CREATED' : 'HOME';
}

function homeItem(user: HomeUserRow, row: MembershipListRow | undefined): MemberListItem {
  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? null,
    role: toMemberRole(user.role),
    source: homeSource(user, row),
    pinned: false,
    expiresAt: null,
    createdAt: user.createdAt.toISOString(),
  };
}

function attachedItem(row: MembershipListRow): MemberListItem {
  return {
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name ?? null,
    role: toMemberRole(row.role),
    source: row.source,
    pinned: row.pinned,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMembers(
  ctx: MembersContext,
  input: { tenantId: string }
): Promise<{ tenantId: string; members: MemberListItem[] }> {
  const { prisma, partner } = ctx;
  const tenant = await loadPartnerTenant(prisma, partner, input.tenantId);
  const now = new Date();

  const [homeUsers, rows] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, email: true, name: true, role: true, provider: true, createdAt: true },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      select: {
        userId: true,
        role: true,
        source: true,
        pinned: true,
        revokedAt: true,
        expiresAt: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, tenantId: true } },
      },
    }),
  ]);
  const membershipRows = (rows ?? []) as MembershipListRow[];
  const rowByUser = new Map(membershipRows.map((r) => [r.userId, r]));

  // Home users (an expired or revoked HOME row means no access), then live attached members.
  const members: MemberListItem[] = ((homeUsers ?? []) as HomeUserRow[])
    .filter((u) => {
      const row = rowByUser.get(u.id);
      return !row || isLiveMembership(row, now);
    })
    .map((u) => homeItem(u, rowByUser.get(u.id)));

  for (const row of membershipRows) {
    const isHomeUser = row.user.tenantId === tenant.id; // listed above
    if (!isHomeUser && isLiveMembership(row, now)) members.push(attachedItem(row));
  }

  members.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.email.localeCompare(b.email));
  return { tenantId: tenant.id, members };
}
