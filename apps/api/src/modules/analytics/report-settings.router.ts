/**
 * Report Settings Router - PG-187
 *
 * tRPC router for /analytics/report-settings page.
 * Provides: get, update, resetToDefaults for report preferences
 * (defaultRange, currency, scheduledDelivery).
 *
 * Follows the direct-Prisma pattern established by lead-settings.router.ts (PG-178).
 */

import type { Prisma, ReportSettings } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  updateReportSettingsSchema,
  scheduledDeliverySchema,
  DEFAULT_REPORT_SETTINGS,
  type ScheduledDelivery,
} from '@intelliflow/validators';

/**
 * Parse the Prisma Json scheduledDelivery column through Zod. Corrupt DB rows
 * fall back to DEFAULT_REPORT_SETTINGS.scheduledDelivery so the page never
 * hands the client an invalid shape.
 */
function normalizeRow(row: ReportSettings): ReportSettings & {
  scheduledDelivery: ScheduledDelivery;
} {
  const parsed = scheduledDeliverySchema.safeParse(row.scheduledDelivery);
  return {
    ...row,
    scheduledDelivery: parsed.success ? parsed.data : DEFAULT_REPORT_SETTINGS.scheduledDelivery,
  };
}

export const reportSettingsRouter = createTRPCRouter({
  /**
   * Get report settings for current tenant.
   * Upserts default row on first access (so this procedure never returns null).
   */
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const row = await ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery:
          DEFAULT_REPORT_SETTINGS.scheduledDelivery as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    return normalizeRow(row);
  }),

  /**
   * Update report settings (partial update of any subset of fields).
   * The Zod superRefine on scheduledDeliverySchema enforces the
   * "recipients non-empty when enabled" invariant at the router boundary.
   */
  update: tenantProcedure.input(updateReportSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { defaultRange, currency, scheduledDelivery } = input;

    const row = await ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: defaultRange ?? DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: currency ?? DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery: (scheduledDelivery ??
          DEFAULT_REPORT_SETTINGS.scheduledDelivery) as unknown as Prisma.InputJsonValue,
      },
      update: {
        ...(defaultRange !== undefined && { defaultRange }),
        ...(currency !== undefined && { currency }),
        ...(scheduledDelivery !== undefined && {
          scheduledDelivery: scheduledDelivery as unknown as Prisma.InputJsonValue,
        }),
      },
    });
    return normalizeRow(row);
  }),

  /**
   * Reset report settings to factory defaults.
   */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const row = await ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery:
          DEFAULT_REPORT_SETTINGS.scheduledDelivery as unknown as Prisma.InputJsonValue,
      },
      update: {
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery:
          DEFAULT_REPORT_SETTINGS.scheduledDelivery as unknown as Prisma.InputJsonValue,
      },
    });
    return normalizeRow(row);
  }),
});
