import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateAppointmentSettingsSchema } from '@intelliflow/validators';
import {
  APPOINTMENT_SETTINGS_RESET_FIELDS,
  DEFAULT_APPOINTMENT_SETTINGS,
} from './appointment-settings.defaults';

// NOTE: appointment settings are NOT LEGAL-gated. This router is SHARED with the
// core Calendar feature (CORE_CRM, all tiers): apps/web/.../calendar/calendar-
// settings/CalendarSettingsContent.tsx calls `appointmentSettings.get/update/
// resetToDefaults`. Gating it behind the LEGAL add-on would break calendar
// settings for every non-Professional tenant.

const INCLUDE_PRIMARY_CALENDAR = {
  primaryCalendar: { select: { id: true, name: true } },
} as const;

export const appointmentSettingsRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    const existing = await ctx.prismaWithTenant.appointmentSettings.findUnique({
      where: { tenantId },
      include: INCLUDE_PRIMARY_CALENDAR,
    });
    if (existing) return existing;
    return ctx.prismaWithTenant.appointmentSettings.create({
      data: { tenantId, ...DEFAULT_APPOINTMENT_SETTINGS },
      include: INCLUDE_PRIMARY_CALENDAR,
    });
  }),

  update: tenantProcedure
    .input(updateAppointmentSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenant.tenantId;
      return ctx.prismaWithTenant.appointmentSettings.upsert({
        where: { tenantId },
        create: { tenantId, ...DEFAULT_APPOINTMENT_SETTINGS, ...input },
        update: input,
        include: INCLUDE_PRIMARY_CALENDAR,
      });
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.appointmentSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_APPOINTMENT_SETTINGS },
      // Buffers and timezone are owned by /calendar/availability (PG-202).
      update: { ...APPOINTMENT_SETTINGS_RESET_FIELDS, primaryCalendarId: null },
      include: INCLUDE_PRIMARY_CALENDAR,
    });
  }),
});
