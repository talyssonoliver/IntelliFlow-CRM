/**
 * PG-202 test helpers for availability (not a test file).
 *
 * `stubTenantAvailability` stubs EVERY read the enforcement helper makes, so no
 * test relies on a deep-mock default (`undefined`), which would silently look
 * like "never configured" or "count below the cap".
 */
import { expect, vi } from 'vitest';
import type { prismaMock as PrismaMockType } from '../../../test/setup';

type PrismaMock = typeof PrismaMockType;

export interface AvailabilityStub {
  configured?: boolean;
  timezone?: string;
  ranges?: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  closures?: Array<{ startDate: string; endDate: string }>;
  cap?: number | null;
  /** Value returned by `appointment.count` (only used when `cap` is set). */
  count?: number;
  /** Start times returned by `appointment.findMany` for the findNextSlot cap filter. */
  bookedStarts?: Date[];
}

export const h = (hour: number, minute = 0) => hour * 60 + minute;

export function weekdayRanges(
  ranges: Array<[number, number]>,
  days: number[] = [1, 2, 3, 4, 5]
): Array<{ weekday: number; startMinute: number; endMinute: number }> {
  return days.flatMap((weekday) =>
    ranges.map(([startMinute, endMinute]) => ({ weekday, startMinute, endMinute }))
  );
}

export function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function stubTenantAvailability(prisma: PrismaMock, stub: AvailabilityStub = {}): void {
  const configured = stub.configured ?? true;
  prisma.appointmentSettings.findUnique.mockResolvedValue(
    configured
      ? ({
          availabilityConfiguredAt: new Date('2026-04-01T00:00:00Z'),
          defaultTimezone: stub.timezone ?? 'Europe/London',
          maxDailyBookings: stub.cap ?? null,
        } as never)
      : ({
          availabilityConfiguredAt: null,
          defaultTimezone: 'UTC',
          maxDailyBookings: null,
        } as never)
  );
  prisma.availabilityHour.findMany.mockResolvedValue(
    (stub.ranges ?? weekdayRanges([[h(9), h(17)]])) as never
  );
  prisma.availabilityClosure.findMany.mockResolvedValue(
    (stub.closures ?? []).map((c) => ({
      startDate: dateOnly(c.startDate),
      endDate: dateOnly(c.endDate),
    })) as never
  );
  prisma.appointment.count.mockResolvedValue((stub.count ?? 0) as never);
  prisma.appointment.findMany.mockResolvedValue(
    (stub.bookedStarts ?? []).map((startTime) => ({ startTime })) as never
  );
}

const TENANT_SCOPED_DELEGATES = [
  ['appointmentSettings', ['findUnique', 'upsert', 'updateMany']],
  ['availabilityHour', ['findMany', 'deleteMany', 'createMany']],
  ['availabilityClosure', ['findMany', 'deleteMany', 'createMany']],
  ['appointment', ['count', 'findMany']],
] as const;

/** One recorded call filters (or, for createMany, writes) the given tenant. */
function expectCallTenantScoped(
  label: string,
  method: string,
  args: Record<string, unknown> | undefined,
  tenantId: string
) {
  if (method === 'createMany') {
    const rows = (args?.data as Array<Record<string, unknown>> | undefined) ?? [];
    for (const row of rows) expect(row.tenantId, `${label} row tenantId`).toBe(tenantId);
    return;
  }
  const where = args?.where as Record<string, unknown> | undefined;
  expect(where?.tenantId, `${label} where.tenantId`).toBe(tenantId);
}

/** Every availability-related Prisma call made so far filters (or writes) the given tenant. */
export function expectEveryCallTenantScoped(prisma: PrismaMock, tenantId: string): void {
  let calls = 0;
  for (const [model, methods] of TENANT_SCOPED_DELEGATES) {
    for (const method of methods) {
      const fn = (prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>)[
        model
      ][method];
      for (const [args] of fn.mock.calls as Array<[Record<string, unknown> | undefined]>) {
        calls += 1;
        expectCallTenantScoped(`${model}.${method}`, method, args, tenantId);
      }
    }
  }
  expect(calls, 'at least one availability call was made').toBeGreaterThan(0);
}

export function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(`prisma ${code}`), { code });
}
