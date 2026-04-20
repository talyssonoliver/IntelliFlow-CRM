import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { updateAppointmentSettingsSchema } from '@intelliflow/validators';

const DEFAULT_APPOINTMENT_SETTINGS = {
  defaultDurationMinutes: 30,
  minDurationMinutes: 5,
  maxDurationMinutes: 480,
  defaultBufferBeforeMinutes: 0,
  defaultBufferAfterMinutes: 0,
  defaultReminderMinutes: 15,
  primaryCalendarId: null,
  syncExternalCalendars: false,
  defaultTimezone: 'UTC',
} as const;

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
      update: { ...DEFAULT_APPOINTMENT_SETTINGS, primaryCalendarId: null },
      include: INCLUDE_PRIMARY_CALENDAR,
    });
  }),
});
