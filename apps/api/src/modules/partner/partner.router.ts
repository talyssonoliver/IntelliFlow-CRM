/**
 * Partner Router (ADR-070)
 *
 * IntelliFlow is an independent product; a partner (the Leangency Portal) provisions
 * tenants for its clients through this router without sharing identity. Every
 * procedure is authenticated by a per-partner API key (`partnerProcedure`) and needs a
 * scope. Tenant-scoped procedures answer NOT_FOUND for a missing tenant and FORBIDDEN
 * for a tenant the calling partner did not source.
 *
 * The input/output schemas are the published contract: `@intelliflow/partner-sdk`
 * mirrors them and `partner.router.test.ts` asserts the two agree.
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { PrismaClient } from '@intelliflow/db';
import type { ModuleAccessPort, TenantUsagePort } from '@intelliflow/application';
import { createTRPCRouter, partnerProcedure, requirePartnerScope } from '../../trpc';
import { assertQuota, withQuotaLock } from '../../shared/quota-guard';
import { issueLoginLink } from './login-link';
import { listMembers, removeMember, setMemberRole } from './members';
import {
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
  assertSeatAvailable,
  invalidateUserSessions,
  resolveTenantAccess,
  writeAudit,
} from './membership';

// `resolveLoginLinkNext` lives in partner-helpers; re-exported because callers and tests import it here.
export { resolveLoginLinkNext };

// ============================================================================
// Contract
// ============================================================================

const PARTNER_PLANS = ['PARTNER_FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
/** Output side also admits CUSTOM: an operator may hand-assign it to any tenant. */
const OUTPUT_PLANS = [...PARTNER_PLANS, 'CUSTOM'] as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const planInput = z.enum(PARTNER_PLANS);
const planOutput = z.enum(OUTPUT_PLANS);

export const provisionTenantInput = z.object({
  externalRef: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(60).regex(SLUG_RE).optional(),
  plan: planInput,
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1).max(120).optional(),
});

export const provisionTenantOutput = z.object({
  tenantId: z.string(),
  slug: z.string(),
  plan: planOutput,
  created: z.boolean(),
});

export const getTenantInput = z.object({ externalRef: z.string().uuid() });

export const getTenantOutput = z
  .object({
    tenantId: z.string(),
    slug: z.string(),
    plan: planOutput,
    status: z.string(),
  })
  .nullable();

export const setPlanInput = z.object({ tenantId: z.string().min(1), plan: planInput });
export const setPlanOutput = z.object({ tenantId: z.string(), plan: planOutput });

export const inviteMemberInput = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'MEMBER']),
});
export const inviteMemberOutput = z.object({ userId: z.string(), created: z.boolean() });

export const issueLoginLinkInput = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
  assertion: z.string().min(1).max(4096).optional(),
});
export const issueLoginLinkOutput = z.object({
  url: z.string().url(),
  expiresAt: z.string(),
  pinned: z.boolean().optional(),
  role: z.enum(['ADMIN', 'MEMBER']).optional(),
});

const memberRole = z.enum(['ADMIN', 'MEMBER']);
const membershipSource = z.enum([
  'HOME',
  'PORTAL_MEMBER',
  'PORTAL_STAFF',
  'OWNER_INVITE',
  'PARTNER_CREATED',
]);

export const removeMemberInput = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
});
export const removeMemberOutput = z.object({ removed: z.boolean() });

export const setMemberRoleInput = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  role: memberRole,
});
export const setMemberRoleOutput = z.object({
  userId: z.string(),
  role: memberRole,
  changed: z.boolean(),
});

export const listMembersInput = z.object({ tenantId: z.string().min(1) });
export const listMembersOutput = z.object({
  tenantId: z.string(),
  members: z.array(
    z.object({
      userId: z.string(),
      email: z.string(),
      name: z.string().nullable(),
      role: memberRole,
      source: membershipSource,
      pinned: z.boolean(),
      expiresAt: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
});

export const getUsageInput = z.object({ tenantId: z.string().min(1) });

const quota = z.object({ used: z.number(), limit: z.number().nullable() });
const measuredQuota = quota.extend({ measured: z.boolean() });

export const getUsageOutput = z.object({
  tenantId: z.string(),
  plan: planOutput,
  modules: z.array(z.string()),
  quotas: z.object({
    contacts: quota,
    seats: quota,
    emailsPerMonth: measuredQuota,
    aiSpendCentsPerMonth: measuredQuota,
  }),
  asOf: z.string(),
});

// ============================================================================
// Helpers
// ============================================================================

type Plan = z.infer<typeof planOutput>;

function slugify(name: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (slug.startsWith('-')) slug = slug.slice(1);
  if (slug.endsWith('-')) slug = slug.slice(0, -1);
  return slug.slice(0, 48) || 'org';
}

/** Reserve a unique slug: the requested one must be free; a derived one gets a suffix. */
async function resolveSlug(
  prisma: PrismaClient,
  requested: string | undefined,
  name: string,
  externalRef: string
): Promise<string> {
  if (requested) {
    const taken = await prisma.tenant.findUnique({
      where: { slug: requested },
      select: { id: true },
    });
    if (taken) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `The slug "${requested}" is already taken.`,
      });
    }
    return requested;
  }
  // Derived slugs embed the externalRef so a retry of the same provisioning is stable.
  return `${slugify(name)}-${externalRef.slice(0, 8)}`;
}

// ============================================================================
// Router
// ============================================================================

export const partnerRouter = createTRPCRouter({
  provisionTenant: partnerProcedure
    .use(requirePartnerScope('tenants:write'))
    .input(provisionTenantInput)
    .output(provisionTenantOutput)
    .mutation(async ({ ctx, input }) => {
      const { prisma, partner } = ctx;
      const ownerEmail = normalizeEmail(input.ownerEmail);

      const find = () =>
        prisma.tenant.findUnique({
          where: {
            partnerId_externalRef: { partnerId: partner.id, externalRef: input.externalRef },
          },
          select: { id: true, slug: true, plan: true },
        });

      const existing = await find();
      if (existing) {
        return {
          tenantId: existing.id,
          slug: existing.slug,
          plan: existing.plan as Plan,
          created: false,
        };
      }

      assertNotOperatorEmail(ownerEmail);

      // Serialize provisioning per (partner, externalRef). Without this, two concurrent calls
      // can both reach Supabase for the same owner email and share one Auth user, and the
      // loser's cleanup would delete the identity the winner committed. The transaction-scoped
      // advisory lock is held until commit/rollback; the Auth call and the CRM writes all run
      // inside it on the same connection.
      const refLockKey = `partner-provision:${partner.id}:${input.externalRef}`;
      const emailLockKey = `partner-provision-email:${ownerEmail}`;
      let authUser: EnsuredAuthUser | undefined;
      try {
        return await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${refLockKey}, 0))`;

            // A second lock on the owner email serializes different tenants racing for the same
            // Auth identity. Lock order is always (ref, email), so the two cannot deadlock.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${emailLockKey}, 0))`;

            // A call that waited on the lock finds the winner's committed tenant here.
            const winner = await tx.tenant.findUnique({
              where: {
                partnerId_externalRef: { partnerId: partner.id, externalRef: input.externalRef },
              },
              select: { id: true, slug: true, plan: true },
            });
            if (winner) {
              return {
                tenantId: winner.id,
                slug: winner.slug,
                plan: winner.plan as Plan,
                created: false,
              };
            }

            if (await tx.user.findUnique({ where: { email: ownerEmail }, select: { id: true } })) {
              throw new TRPCError({
                code: 'CONFLICT',
                message: 'The owner email already belongs to an existing account.',
              });
            }

            const slug = await resolveSlug(
              tx as PrismaClient,
              input.slug,
              input.name,
              input.externalRef
            );
            authUser = await ensureAuthUser(ownerEmail, input.ownerName);

            const created = await tx.tenant.create({
              data: {
                name: input.name,
                slug,
                status: 'ACTIVE',
                source: 'PARTNER',
                partnerId: partner.id,
                externalRef: input.externalRef,
                plan: input.plan,
              },
              select: { id: true, slug: true, plan: true },
            });
            await tx.user.create({
              data: {
                id: authUser.id,
                email: ownerEmail,
                name: input.ownerName ?? ownerEmail.split('@')[0],
                role: 'ADMIN',
                tenantId: created.id,
                provider: 'partner',
              },
            });
            return {
              tenantId: created.id,
              slug: created.slug,
              plan: created.plan as Plan,
              created: true,
            };
          },
          { maxWait: 10_000, timeout: 30_000 }
        );
      } catch (error) {
        // The transaction rolled back, so no CRM row references the Auth user we created.
        if (authUser) await discardAuthUser(prisma, authUser);
        if (isUniqueViolation(error)) {
          // The (partner, externalRef) race is excluded by the lock, so this is the slug or the
          // owner email colliding with another tenant.
          const winner = await find();
          if (winner) {
            return {
              tenantId: winner.id,
              slug: winner.slug,
              plan: winner.plan as Plan,
              created: false,
            };
          }
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Tenant slug or owner email already exists.',
          });
        }
        throw error;
      }
    }),

  getTenant: partnerProcedure
    .use(requirePartnerScope('tenants:read'))
    .input(getTenantInput)
    .output(getTenantOutput)
    .query(async ({ ctx, input }) => {
      const tenant = await ctx.prisma.tenant.findUnique({
        where: {
          partnerId_externalRef: { partnerId: ctx.partner.id, externalRef: input.externalRef },
        },
        select: { id: true, slug: true, plan: true, status: true },
      });
      return tenant
        ? {
            tenantId: tenant.id,
            slug: tenant.slug,
            plan: tenant.plan as Plan,
            status: tenant.status,
          }
        : null;
    }),

  setPlan: partnerProcedure
    .use(requirePartnerScope('tenants:write'))
    .input(setPlanInput)
    .output(setPlanOutput)
    .mutation(async ({ ctx, input }) => {
      await loadPartnerTenant(ctx.prisma, ctx.partner, input.tenantId);
      const moduleAccess = ctx.container?.get<ModuleAccessPort>('moduleAccess');
      if (!moduleAccess) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Module access service not available.',
        });
      }
      // One transaction: records Tenant.plan AND reconciles TenantModule rows, so a downgrade
      // removes modules the new plan does not include (writing only Tenant.plan would leave
      // the old paid module rows enabled).
      await moduleAccess.syncModulesToPlan(input.tenantId, input.plan);
      return { tenantId: input.tenantId, plan: input.plan };
    }),

  inviteMember: partnerProcedure
    .use(requirePartnerScope('members:write'))
    .input(inviteMemberInput)
    .output(inviteMemberOutput)
    .mutation(async ({ ctx, input }) => {
      const { prisma, partner } = ctx;
      await loadPartnerTenant(prisma, partner, input.tenantId);
      const email = normalizeEmail(input.email);

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, tenantId: true, role: true },
      });
      if (existing) {
        if (existing.tenantId !== input.tenantId) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This email already belongs to an account in another tenant.',
          });
        }
        // The Portal inviting a person it removed earlier revives them (ADR-071): the removal
        // left a revoked HOME row, which would otherwise keep them out for good.
        const access = await resolveTenantAccess(prisma, existing, input.tenantId);
        if (!access.live && access.row) {
          await prisma.$transaction(
            async (rawTx) => {
              const tx = rawTx as PrismaClient;
              await assertSeatAvailable(tx, ctx.services?.quota, input.tenantId);
              await tx.tenantMembership.update({
                where: { userId_tenantId: { userId: existing.id, tenantId: input.tenantId } },
                data: { revokedAt: null, expiresAt: null },
              });
              await writeAudit(tx, {
                tenantId: input.tenantId,
                userId: existing.id,
                partnerId: partner.id,
                action: 'MEMBER_ATTACHED',
                actor: `partner:${partner.slug}`,
                detail: { revived: true, via: 'inviteMember' },
              });
            },
            { maxWait: 10_000, timeout: 30_000 }
          );
          await invalidateUserSessions(existing.id);
        }
        return { userId: existing.id, created: false };
      }

      assertNotOperatorEmail(email);

      // Reject before any Auth user exists when the plan has no free seat...
      await assertQuota(ctx, input.tenantId, 'seats');
      const authUser = await ensureAuthUser(email, input.name);
      try {
        // ...and re-check the live count under the per-tenant lock when creating, so concurrent
        // invitations cannot both take the last seat.
        const user = await withQuotaLock(ctx, input.tenantId, 'seats', 1, () =>
          prisma.user.create({
            data: {
              id: authUser.id,
              email,
              name: input.name ?? email.split('@')[0],
              role: input.role === 'ADMIN' ? 'ADMIN' : 'USER',
              tenantId: input.tenantId,
              provider: 'partner',
            },
            select: { id: true },
          })
        );
        return { userId: user.id, created: true };
      } catch (error) {
        await discardAuthUser(prisma, authUser);
        if (isUniqueViolation(error)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This email is already registered.' });
        }
        throw error;
      }
    }),

  issueLoginLink: partnerProcedure
    .use(requirePartnerScope('auth:login-link'))
    .input(issueLoginLinkInput)
    .output(issueLoginLinkOutput)
    .mutation(({ ctx, input }) => issueLoginLink(ctx as never, input)),

  removeMember: partnerProcedure
    .use(requirePartnerScope('members:write'))
    .input(removeMemberInput)
    .output(removeMemberOutput)
    .mutation(({ ctx, input }) => removeMember(ctx as never, input)),

  setMemberRole: partnerProcedure
    .use(requirePartnerScope('members:write'))
    .input(setMemberRoleInput)
    .output(setMemberRoleOutput)
    .mutation(({ ctx, input }) => setMemberRole(ctx as never, input)),

  listMembers: partnerProcedure
    .use(requirePartnerScope('tenants:read'))
    .input(listMembersInput)
    .output(listMembersOutput)
    .query(({ ctx, input }) => listMembers(ctx as never, input)),

  getUsage: partnerProcedure
    .use(requirePartnerScope('usage:read'))
    .input(getUsageInput)
    .output(getUsageOutput)
    .query(async ({ ctx, input }) => {
      await loadPartnerTenant(ctx.prisma, ctx.partner, input.tenantId);

      const usagePort = ctx.container?.get<TenantUsagePort>('tenantUsage');
      if (!usagePort) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Usage service not available.',
        });
      }
      const usage = await usagePort.getUsage(input.tenantId);
      return { ...usage, plan: usage.plan as Plan };
    }),
});
