/**
 * Session procedures of the inherited-membership contract (ADR-071):
 * `user.listTenants` and `user.claimLoginGrant`. Their schemas are the ones published in
 * `@intelliflow/partner-sdk` (SESSION_PROCEDURES), so the wire shape cannot drift.
 */

import { TRPCError } from '@trpc/server';
import {
  claimLoginGrantInputSchema,
  claimLoginGrantOutputSchema,
  listTenantsOutputSchema,
} from '@intelliflow/partner-sdk';
import type { z } from 'zod';
import { pendingSessionProcedure, protectedProcedure } from '../../trpc';
import {
  PINNED_SESSION_TTL_MS,
  getHomeTenantId,
  isInheritedMembershipEnabled,
  isLiveMembership,
  liveMembershipWhere,
  membershipError,
  toWireRole,
} from '../../security/membership';
import { invalidateUserSessions } from '../../security/session-cache';

type ListTenantsOutput = z.infer<typeof listTenantsOutputSchema>;
type TenantEntry = ListTenantsOutput['tenants'][number];

const GRANT_REFUSED = 'This sign-in link cannot be used. Open the CRM again from the Portal.';

/**
 * The tenants this session may use. A pinned session sees exactly one entry (the workspace it was
 * opened into). Otherwise: the home tenant, plus live NON-pinned memberships when switching is
 * enabled. Pinned staff memberships are never listed: staff reach client tenants only through
 * the Portal.
 */
export const listTenants = protectedProcedure
  .output(listTenantsOutputSchema)
  .query(async ({ ctx }): Promise<ListTenantsOutput> => {
    const user = ctx.user;
    const homeTenantId = getHomeTenantId(user);
    const activeTenantId = user.tenantId;

    if (user.pinned === true) {
      const [tenant, membership] = await Promise.all([
        ctx.prisma.tenant.findUnique({
          where: { id: activeTenantId },
          select: { id: true, name: true, slug: true },
        }),
        ctx.prisma.tenantMembership.findUnique({
          where: { userId_tenantId: { userId: user.userId, tenantId: activeTenantId } },
          select: { role: true, source: true, revokedAt: true, expiresAt: true },
        }),
      ]);
      if (!tenant || !membership || !isLiveMembership(membership)) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Your access has ended.' });
      }
      return {
        activeTenantId,
        homeTenantId,
        pinned: true,
        tenants: [
          {
            tenantId: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            role: toWireRole(membership.role),
            source: membership.source,
            pinned: true,
            isHome: tenant.id === homeTenantId,
            isActive: true,
          },
        ],
      };
    }

    const memberships = isInheritedMembershipEnabled()
      ? await ctx.prisma.tenantMembership.findMany({
          where: {
            userId: user.userId,
            pinned: false,
            source: { not: 'HOME' },
            ...liveMembershipWhere(),
          },
          select: { tenantId: true, role: true, source: true },
        })
      : [];

    // The home role is the user's own role. It is already on the session at home; elsewhere the
    // session carries the membership role, so read the user row.
    const homeRole =
      activeTenantId === homeTenantId
        ? user.role
        : ((
            await ctx.prisma.user.findUnique({
              where: { id: user.userId },
              select: { role: true },
            })
          )?.role ?? 'USER');

    const tenants = await ctx.prisma.tenant.findMany({
      where: { id: { in: [homeTenantId, ...memberships.map((m) => m.tenantId)] } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(tenants.map((t) => [t.id, t]));

    // A revoked or expired HOME membership row (partner.removeMember) means no access there: the
    // resolver refuses it with NOT_A_MEMBER, so offering it would strand the app on that error.
    const homeRow = await ctx.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.userId, tenantId: homeTenantId } },
      select: { role: true, source: true, revokedAt: true, expiresAt: true },
    });
    const homeLive = !homeRow || isLiveMembership(homeRow);

    const entries: TenantEntry[] = [];
    const home = byId.get(homeTenantId);
    if (home && homeLive) {
      entries.push({
        tenantId: home.id,
        name: home.name,
        slug: home.slug,
        role: toWireRole(homeRole),
        source: 'HOME',
        pinned: false,
        isHome: true,
        isActive: activeTenantId === home.id,
      });
    }
    for (const m of memberships) {
      const tenant = byId.get(m.tenantId);
      if (!tenant || tenant.id === homeTenantId) continue;
      entries.push({
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        role: toWireRole(m.role),
        source: m.source,
        pinned: false,
        isHome: false,
        isActive: activeTenantId === tenant.id,
      });
    }

    return { activeTenantId, homeTenantId, pinned: false, tenants: entries };
  });

/**
 * Bind the caller's browser session to a login grant. The web calls this FIRST after `verifyOtp`.
 * Until a pinned grant is claimed, the session is PIN_PENDING and cannot do anything else.
 *
 * The grant must belong to the caller, be inside its claim window (the OTP lifetime, 60 minutes) and unclaimed (claimed
 * atomically with `UPDATE ... WHERE claimedAt IS NULL`), and its membership must still be live.
 * Every refusal is the same `GRANT_INVALID`, so a caller cannot probe which grants exist.
 */
export const claimLoginGrant = pendingSessionProcedure
  .input(claimLoginGrantInputSchema)
  .output(claimLoginGrantOutputSchema)
  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;
    const refuse = () => membershipError('FORBIDDEN', 'GRANT_INVALID', GRANT_REFUSED);
    const now = new Date();

    if (!user.sessionId) throw refuse();

    const grant = await ctx.prisma.partnerLoginGrant.findUnique({
      where: { id: input.grant },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        partnerId: true,
        kind: true,
        pinned: true,
        expiresAt: true,
        claimedAt: true,
      },
    });
    if (!grant || grant.userId !== user.userId || grant.claimedAt || grant.expiresAt <= now) {
      throw refuse();
    }

    const membership = await ctx.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: user.userId, tenantId: grant.tenantId } },
      select: { revokedAt: true, expiresAt: true },
    });
    // The home tenant is an IMPLICIT membership: a home user (a legacy key-only grant, a JIT-created
    // member, or an existing owner) has no membership row unless one was revoked. Only a pinned
    // (staff) grant needs a live row; a revoked or expired row is still refused.
    const homeNoRow = !membership && !grant.pinned && grant.tenantId === user.homeTenantId;
    if (!homeNoRow && (!membership || !isLiveMembership(membership, now))) throw refuse();

    const sessionExpiresAt = grant.pinned ? new Date(now.getTime() + PINNED_SESSION_TTL_MS) : null;
    const claimed = await ctx.prisma.partnerLoginGrant.updateMany({
      where: {
        id: grant.id,
        userId: user.userId,
        claimedAt: null,
        expiresAt: { gt: now },
      },
      data: { claimedAt: now, claimedSessionId: user.sessionId, sessionExpiresAt },
    });
    if (claimed.count !== 1) throw refuse();

    // The claim changes how this session resolves: drop every cached session of the user so the
    // next request is evaluated against the new grant state.
    invalidateUserSessions(user.userId);

    try {
      await ctx.prisma.tenantMembershipAudit.create({
        data: {
          tenantId: grant.tenantId,
          userId: user.userId,
          partnerId: grant.partnerId,
          action: 'GRANT_CLAIMED',
          actor: `user:${user.userId}`,
          detail: { grantId: grant.id, kind: grant.kind, pinned: grant.pinned },
        },
      });
    } catch (error) {
      // The claim already succeeded and must not fail now, but a lost audit row is an incident.
      console.error('[membership] failed to write the GRANT_CLAIMED audit row', {
        grantId: grant.id,
        error,
      });
    }

    return {
      tenantId: grant.tenantId,
      pinned: grant.pinned,
      sessionExpiresAt: sessionExpiresAt ? sessionExpiresAt.toISOString() : null,
    };
  });
