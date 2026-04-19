/**
 * Report Settings Router - PG-187
 *
 * tRPC router for /analytics/report-settings page.
 * Provides: get, update, resetToDefaults for report preferences
 * (defaultRange, currency, scheduledDelivery).
 *
 * Follows the direct-Prisma pattern established by lead-settings.router.ts (PG-178).
 */

import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateReportSettingsSchema, DEFAULT_REPORT_SETTINGS } from '@intelliflow/validators';

export const reportSettingsRouter = createTRPCRouter({
  /**
   * Get report settings for current tenant.
   * Upserts default row on first access (so this procedure never returns null).
   */
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery: DEFAULT_REPORT_SETTINGS.scheduledDelivery,
      },
      update: {},
    });
  }),

  /**
   * Update report settings (partial update of any subset of fields).
   */
  update: tenantProcedure.input(updateReportSettingsSchema).mutation(async ({ ctx, input }) => {
    const tenantId = ctx.tenant.tenantId;
    const { defaultRange, currency, scheduledDelivery } = input;

    return ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: defaultRange ?? DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: currency ?? DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery: scheduledDelivery ?? DEFAULT_REPORT_SETTINGS.scheduledDelivery,
      },
      update: {
        ...(defaultRange !== undefined && { defaultRange }),
        ...(currency !== undefined && { currency }),
        ...(scheduledDelivery !== undefined && { scheduledDelivery }),
      },
    });
  }),

  /**
   * Reset report settings to factory defaults.
   */
  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.reportSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery: DEFAULT_REPORT_SETTINGS.scheduledDelivery,
      },
      update: {
        defaultRange: DEFAULT_REPORT_SETTINGS.defaultRange,
        currency: DEFAULT_REPORT_SETTINGS.currency,
        scheduledDelivery: DEFAULT_REPORT_SETTINGS.scheduledDelivery,
      },
    });
  }),
});
