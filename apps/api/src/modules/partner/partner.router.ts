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
import type { TenantUsagePort } from '@intelliflow/application';
import { createTRPCRouter, partnerProcedure, requirePartnerScope } from '../../trpc';
import { supabaseAdmin } from '../../lib/supabase';
import { getPlatformAdminEmails, type PartnerContext } from '../../security/partner-auth';

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
});
export const issueLoginLinkOutput = z.object({ url: z.string().url(), expiresAt: z.string() });

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

/** Supabase magic links live as long as the project's OTP expiry (default 1h). */
const LOGIN_LINK_TTL_SECONDS = Number(process.env.PARTNER_LOGIN_LINK_TTL_SECONDS) || 3600;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(name: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (slug.startsWith('-')) slug = slug.slice(1);
  if (slug.endsWith('-')) slug = slug.slice(0, -1);
  return slug.slice(0, 48) || 'org';
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

function assertNotOperatorEmail(email: string): void {
  // A partner must never be able to mint an account for a platform operator's address.
  if (getPlatformAdminEmails().has(email)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'This email address is reserved and cannot be provisioned by a partner.',
    });
  }
}

/** Load a tenant and enforce that the calling partner sourced it. */
async function loadPartnerTenant(prisma: PrismaClient, partner: PartnerContext, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, plan: true, status: true, partnerId: true },
  });
  if (!tenant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found.' });
  }
  if (tenant.partnerId !== partner.id) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This tenant was not sourced by your partner.',
    });
  }
  return tenant;
}

interface EnsuredAuthUser {
  id: string;
  created: boolean;
}

/**
 * Make sure a Supabase Auth user exists for the email (confirmed, so a magic link can sign
 * them in). An existing Auth user with no CRM row is reused: `generateLink` hands back the
 * user without sending anything, which is the only by-email lookup the admin API offers.
 */
async function ensureAuthUser(email: string, name?: string): Promise<EnsuredAuthUser> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (data?.user && !error) {
    return { id: data.user.id, created: true };
  }

  const alreadyExists =
    (error as { code?: string } | null)?.code === 'email_exists' ||
    /already (been )?registered/i.test(error?.message ?? '');
  if (alreadyExists) {
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (link?.user && !linkError) {
      return { id: link.user.id, created: false };
    }
  }

  console.error('[partner] Supabase user provisioning failed:', error?.message);
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Could not provision the user account.',
  });
}

/** Best-effort removal of an Auth user this request created, after the CRM write failed. */
async function discardAuthUser(user: EnsuredAuthUser): Promise<void> {
  if (!user.created) return;
  try {
    await supabaseAdmin.auth.admin.deleteUser(user.id);
  } catch (err) {
    console.warn('[partner] Failed to clean up Auth user after a failed write:', err);
  }
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
      if (await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true } })) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'The owner email already belongs to an existing account.',
        });
      }

      const slug = await resolveSlug(prisma, input.slug, input.name, input.externalRef);
      const authUser = await ensureAuthUser(ownerEmail, input.ownerName);

      try {
        const tenant = await prisma.$transaction(async (tx) => {
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
          return created;
        });
        return { tenantId: tenant.id, slug: tenant.slug, plan: tenant.plan as Plan, created: true };
      } catch (error) {
        await discardAuthUser(authUser);
        if (isUniqueViolation(error)) {
          // A concurrent call with the same (partner, externalRef) won the race: idempotent.
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
      const updated = await ctx.prisma.tenant.update({
        where: { id: input.tenantId },
        data: { plan: input.plan },
        select: { id: true, plan: true },
      });
      return { tenantId: updated.id, plan: updated.plan as Plan };
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
        select: { id: true, tenantId: true },
      });
      if (existing) {
        if (existing.tenantId !== input.tenantId) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This email already belongs to an account in another tenant.',
          });
        }
        return { userId: existing.id, created: false };
      }

      assertNotOperatorEmail(email);
      const authUser = await ensureAuthUser(email, input.name);
      try {
        const user = await prisma.user.create({
          data: {
            id: authUser.id,
            email,
            name: input.name ?? email.split('@')[0],
            role: input.role === 'ADMIN' ? 'ADMIN' : 'USER',
            tenantId: input.tenantId,
            provider: 'partner',
          },
          select: { id: true },
        });
        return { userId: user.id, created: true };
      } catch (error) {
        await discardAuthUser(authUser);
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
    .mutation(async ({ ctx, input }) => {
      await loadPartnerTenant(ctx.prisma, ctx.partner, input.tenantId);
      const email = normalizeEmail(input.email);

      const member = await ctx.prisma.user.findUnique({
        where: { email },
        select: { tenantId: true },
      });
      if (!member || member.tenantId !== input.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This user is not a member of the tenant.',
        });
      }

      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: input.redirectTo ? { redirectTo: input.redirectTo } : undefined,
      });
      const url = data?.properties?.action_link;
      if (error || !url) {
        console.error('[partner] generateLink failed:', error?.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not issue a login link.',
        });
      }

      return {
        url,
        expiresAt: new Date(Date.now() + LOGIN_LINK_TTL_SECONDS * 1000).toISOString(),
      };
    }),

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
