/**
 * Terms Acceptance Router — IFC-309
 *
 * Provides server-side persistence for Terms of Service acceptance records.
 *
 * SECURITY NOTES:
 * - Uses plain `tenantProcedure` (NOT moduleTenantProcedure) — ALL tenant plan
 *   tiers must be able to accept ToS, regardless of paid module access.
 * - acceptedAt is set by DB @default(now()) — never client-supplied.
 * - ipAddress is extracted server-side from the trusted rightmost x-forwarded-for
 *   hop — never accepted from client input.
 * - tenantId and userId are taken from session context only — never from input.
 *
 * NF-003: ipAddress and userAgent are PII — NEVER log them or add them to
 * OTel span attributes. They appear only in the Prisma create block.
 */

import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { pickTrustedForwardedIp } from '../../security/client-ip';
import { assertTenantContext } from '../../security/tenant-context';
import {
  acceptTermsInputSchema,
  getAcceptanceInputSchema,
} from '@intelliflow/validators/terms-acceptance';

export const termsAcceptanceRouter = createTRPCRouter({
  /**
   * Accept the current Terms of Service version.
   *
   * Idempotent: re-accepting the same (tenantId, userId, termsVersion) tuple
   * is a no-op that returns the original acceptedAt timestamp. The upsert's
   * empty `update: {}` block enforces immutability at the DB layer.
   *
   * Returns { accepted: true, acceptedAt: Date }.
   */
  accept: tenantProcedure.input(acceptTermsInputSchema).mutation(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    const tenantId = ctx.tenant.tenantId;
    // userId from session — never from input (AC-005)
    const userId = ctx.user!.userId;

    // NF-003: Do NOT log ipAddress/userAgent or add them to OTel span attributes.
    // IP extracted server-side — never from input (AC-004).
    const forwardedFor = ctx.req?.headers?.get?.('x-forwarded-for') ?? null;
    const ipAddress = pickTrustedForwardedIp(forwardedFor) ?? null;

    // userAgent read from request header server-side — never from client body.
    // Truncate to VARCHAR(512) DB limit to prevent overlong values.
    // NF-003: PII — do NOT log or span-attribute.
    const rawUserAgent = ctx.req?.headers?.get?.('user-agent') ?? null;
    const userAgent = rawUserAgent ? rawUserAgent.slice(0, 512) : null;

    // Idempotent upsert — re-acceptance is a no-op; same record returned (AC-002).
    // NF-005: update is intentionally empty — records are IMMUTABLE.
    // Use prismaWithTenant (RLS-scoped) not raw ctx.prisma — defence-in-depth.
    const record = await ctx.prismaWithTenant!.termsAcceptance.upsert({
      where: {
        tenantId_userId_termsVersion: {
          tenantId,
          userId,
          termsVersion: input.termsVersion,
        },
      },
      create: {
        tenantId,
        userId,
        termsVersion: input.termsVersion,
        // NF-003: PII stored only for immutable audit record — never in logs/spans
        ipAddress,
        userAgent,
        route: input.route,
      },
      update: {}, // immutable — empty update is a no-op (NF-005)
      select: {
        acceptedAt: true,
      },
    });

    return { accepted: true as const, acceptedAt: record.acceptedAt };
  }),

  /**
   * Check whether the current user has accepted a specific Terms version.
   *
   * Always filters by tenantId (from session) + userId + termsVersion — never
   * crosses tenant boundaries (NF-002).
   *
   * Returns { accepted: boolean, acceptedAt: Date | null }.
   */
  getAcceptance: tenantProcedure.input(getAcceptanceInputSchema).query(async ({ ctx, input }) => {
    assertTenantContext(ctx);
    // ALWAYS filter by tenantId from session — never from input (NF-002)
    const tenantId = ctx.tenant.tenantId;
    const userId = ctx.user!.userId;

    // Use prismaWithTenant (RLS-scoped) not raw ctx.prisma — defence-in-depth.
    const record = await ctx.prismaWithTenant!.termsAcceptance.findFirst({
      where: {
        tenantId,
        userId,
        termsVersion: input.termsVersion,
      },
      select: { acceptedAt: true },
    });

    return {
      accepted: record !== null,
      acceptedAt: record?.acceptedAt ?? null,
    };
  }),

  // NF-005: No update or delete procedures — records are immutable audit entries.
});
