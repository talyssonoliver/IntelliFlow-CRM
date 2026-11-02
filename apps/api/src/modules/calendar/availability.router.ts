/**
 * Availability Router — PG-202 (Module Settings: Availability, ADR-081).
 *
 * Firm-wide availability: weekly hours, all-day closures, a daily cap, and the
 * firm timezone + default buffers (the existing AppointmentSettings columns,
 * owner Q2). Calendar is a core module, so this stays on plain
 * `tenantProcedure` (no LEGAL gate). Changes are limited to
 * AVAILABILITY_ADMIN_ROLES (owner Q5); reads are open to every tenant user.
 * `prismaWithTenant` does not inject `tenantId`, so every query passes it.
 */
import { TRPCError } from '@trpc/server';
import type { PrismaClient } from '@intelliflow/db';
import { isAvailabilityAdminRole, isValidTimezone } from '@intelliflow/domain';
import {
  updateAvailabilitySchema,
  type AvailabilityDayDto,
  type AvailabilityDto,
} from '@intelliflow/validators';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext, type TenantAwareContext } from '../../security/tenant-context';
import { DEFAULT_APPOINTMENT_SETTINGS } from '../legal/appointment-settings.defaults';
import { lockTenantBookings } from './booking-lock';

type AvailabilityReader = Pick<
  PrismaClient,
  'appointmentSettings' | 'availabilityHour' | 'availabilityClosure'
>;
type AvailabilityCtx = Pick<TenantAwareContext, 'user'>;

const FORBIDDEN_MESSAGE = 'Only administrators and managers can change availability.';
const CONFLICT_MESSAGE = 'Availability was changed by someone else. Reload and try again.';

function assertAvailabilityAdmin(ctx: AvailabilityCtx): void {
  if (!isAvailabilityAdminRole(ctx.user?.role)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: FORBIDDEN_MESSAGE });
  }
}

function prismaCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  return (err as { code?: string }).code;
}

function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function readAvailability(
  client: AvailabilityReader,
  tenantId: string,
  opts: { canEdit: boolean; userTimezone?: string | null }
): Promise<AvailabilityDto> {
  const [settings, hours, closures] = await Promise.all([
    client.appointmentSettings.findUnique({ where: { tenantId } }),
    client.availabilityHour.findMany({
      where: { tenantId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    }),
    client.availabilityClosure.findMany({
      where: { tenantId },
      orderBy: [{ startDate: 'asc' }, { endDate: 'asc' }],
    }),
  ]);
  const isConfigured = Boolean(settings?.availabilityConfiguredAt);
  // Until the first save, propose the user's own zone (not the 'UTC' column default).
  const userTimezone =
    opts.userTimezone && isValidTimezone(opts.userTimezone) ? opts.userTimezone : null;
  const timezone = isConfigured
    ? (settings?.defaultTimezone ?? 'UTC')
    : (userTimezone ?? settings?.defaultTimezone ?? 'UTC');

  const days: AvailabilityDayDto[] = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    ranges: [],
  }));
  for (const h of hours) {
    days[h.weekday]?.ranges.push({ startMinute: h.startMinute, endMinute: h.endMinute });
  }

  return {
    isConfigured,
    timezone,
    days,
    bufferBeforeMinutes: settings?.defaultBufferBeforeMinutes ?? 0,
    bufferAfterMinutes: settings?.defaultBufferAfterMinutes ?? 0,
    maxDailyBookings: isConfigured ? (settings?.maxDailyBookings ?? null) : null,
    closures: closures.map((c) => ({
      id: c.id,
      startDate: toDateString(c.startDate),
      endDate: toDateString(c.endDate),
      reason: c.reason,
    })),
    canEdit: opts.canEdit,
  };
}

export const availabilityRouter = createTRPCRouter({
  get: tenantProcedure.query(async ({ ctx }): Promise<AvailabilityDto> => {
    assertTenantContext(ctx);
    return readAvailability(ctx.prismaWithTenant, ctx.tenant.tenantId, {
      canEdit: isAvailabilityAdminRole(ctx.user?.role),
      userTimezone: ctx.user?.timezone,
    });
  }),

  update: tenantProcedure
    .input(updateAvailabilitySchema)
    .mutation(async ({ ctx, input }): Promise<AvailabilityDto> => {
      assertTenantContext(ctx);
      assertAvailabilityAdmin(ctx);
      const tenantId = ctx.tenant.tenantId;
      const settingsData = {
        defaultBufferBeforeMinutes: input.bufferBeforeMinutes,
        defaultBufferAfterMinutes: input.bufferAfterMinutes,
        defaultTimezone: input.timezone,
        maxDailyBookings: input.maxDailyBookings,
        availabilityConfiguredAt: new Date(),
      };
      const hours = input.days.flatMap((day) =>
        day.ranges.map((range) => ({
          tenantId,
          weekday: day.weekday,
          startMinute: range.startMinute,
          endMinute: range.endMinute,
        }))
      );
      const closures = input.closures.map((closure) => ({
        tenantId,
        startDate: toDbDate(closure.startDate),
        endDate: toDbDate(closure.endDate),
        reason: closure.reason,
      }));

      try {
        return await ctx.prismaWithTenant.$transaction(async (tx) => {
          // A public booking in flight finishes against the rules it read (codex).
          await lockTenantBookings(tx, tenantId);
          // Settings row first: its row lock serialises concurrent saves (no merged weeks).
          await tx.appointmentSettings.upsert({
            where: { tenantId },
            create: { ...DEFAULT_APPOINTMENT_SETTINGS, tenantId, ...settingsData },
            update: settingsData,
          });
          await tx.availabilityHour.deleteMany({ where: { tenantId } });
          if (hours.length > 0) await tx.availabilityHour.createMany({ data: hours });
          await tx.availabilityClosure.deleteMany({ where: { tenantId } });
          if (closures.length > 0) await tx.availabilityClosure.createMany({ data: closures });
          return readAvailability(tx, tenantId, {
            canEdit: true,
            userTimezone: ctx.user?.timezone,
          });
        });
      } catch (err) {
        if (prismaCode(err) === 'P2002') {
          throw new TRPCError({ code: 'CONFLICT', message: CONFLICT_MESSAGE });
        }
        throw err;
      }
    }),

  resetToDefaults: tenantProcedure.mutation(async ({ ctx }): Promise<AvailabilityDto> => {
    assertTenantContext(ctx);
    assertAvailabilityAdmin(ctx);
    const tenantId = ctx.tenant.tenantId;
    return ctx.prismaWithTenant.$transaction(async (tx) => {
      await lockTenantBookings(tx, tenantId);
      // Back to the legacy booking rules; buffers and timezone are kept.
      await tx.appointmentSettings.updateMany({
        where: { tenantId },
        data: { maxDailyBookings: null, availabilityConfiguredAt: null },
      });
      await tx.availabilityHour.deleteMany({ where: { tenantId } });
      await tx.availabilityClosure.deleteMany({ where: { tenantId } });
      return readAvailability(tx, tenantId, { canEdit: true, userTimezone: ctx.user?.timezone });
    });
  }),
});
