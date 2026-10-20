/**
 * PG-202 — availability enforcement helper (AC-015, AC-016, AC-017, NF-001).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Appointment, Result } from '@intelliflow/domain';
import { InMemoryAppointmentRepository } from '@intelliflow/adapters';
import { CheckConflictsUseCase } from '@intelliflow/application';
import { prismaMock, TEST_UUIDS } from '../../../test/setup';
import {
  assertAppointmentWithinAvailability,
  findNextSlotWithinAvailability,
  loadTenantAvailability,
} from '../availability-enforcement';
import {
  h,
  weekdayRanges,
  stubTenantAvailability,
  expectEveryCallTenantScoped,
  prismaError,
} from './availability.test-utils';

const TENANT = TEST_UUIDS.tenant;
const LEGACY = 'Appointments must start and end between 07:00 and 19:00.';
const NOW = new Date('2026-04-13T07:00:00Z'); // Monday 08:00 BST

function assert(start: string, end: string, extra: Record<string, unknown> = {}) {
  return assertAppointmentWithinAvailability(prismaMock, {
    tenantId: TENANT,
    start: new Date(start),
    end: new Date(end),
    ...extra,
  });
}

describe('availability-enforcement (PG-202)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    errorSpy.mockRestore();
  });

  describe('loadTenantAvailability', () => {
    it.each([
      ['no settings row', null],
      ['deep-mock undefined', undefined],
      ['a non-object result', 'oops'],
      [
        'availabilityConfiguredAt null',
        { availabilityConfiguredAt: null, defaultTimezone: 'UTC', maxDailyBookings: 5 },
      ],
    ])('treats %s as never configured without further reads', async (_label, row) => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(row as never);
      await expect(loadTenantAvailability(prismaMock, TENANT)).resolves.toEqual({
        configured: false,
      });
      expect(prismaMock.availabilityHour.findMany).not.toHaveBeenCalled();
      expect(prismaMock.appointmentSettings.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT } })
      );
    });

    it('loads hours, closures, cap and zone for a configured tenant', async () => {
      stubTenantAvailability(prismaMock, {
        timezone: 'Europe/London',
        ranges: [{ weekday: 1, startMinute: h(9), endMinute: h(12) }],
        closures: [{ startDate: '2026-12-24', endDate: '2026-12-26' }],
        cap: 4,
      });
      await expect(loadTenantAvailability(prismaMock, TENANT)).resolves.toEqual({
        configured: true,
        rules: {
          timezone: 'Europe/London',
          weeklyRanges: [{ weekday: 1, startMinute: h(9), endMinute: h(12) }],
          closures: [{ startDate: '2026-12-24', endDate: '2026-12-26' }],
          maxDailyBookings: 4,
        },
      });
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });

    it.each(['P2021', 'P2022'])(
      'falls back to legacy with a loud log when the settings read fails with %s (migration not applied)',
      async (code) => {
        prismaMock.appointmentSettings.findUnique.mockRejectedValue(prismaError(code));
        await expect(loadTenantAvailability(prismaMock, TENANT)).resolves.toEqual({
          configured: false,
        });
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('20261017130000_availability'),
          expect.objectContaining({ code })
        );
      }
    );

    it.each(['availabilityHour', 'availabilityClosure'] as const)(
      'falls back to legacy when the %s read fails with P2021',
      async (model) => {
        stubTenantAvailability(prismaMock);
        prismaMock[model].findMany.mockRejectedValue(prismaError('P2021'));
        await expect(loadTenantAvailability(prismaMock, TENANT)).resolves.toEqual({
          configured: false,
        });
        expect(errorSpy).toHaveBeenCalled();
      }
    );

    it('propagates any other database error', async () => {
      prismaMock.appointmentSettings.findUnique.mockRejectedValue(prismaError('P1001'));
      await expect(loadTenantAvailability(prismaMock, TENANT)).rejects.toMatchObject({
        code: 'P1001',
      });
      prismaMock.appointmentSettings.findUnique.mockRejectedValue(new Error('boom'));
      await expect(loadTenantAvailability(prismaMock, TENANT)).rejects.toThrow('boom');
    });
  });

  describe('assertAppointmentWithinAvailability — legacy (never configured)', () => {
    beforeEach(() => {
      prismaMock.appointmentSettings.findUnique.mockResolvedValue(null);
    });

    it('keeps the 07:00-19:00 rule in the legacy timezone', async () => {
      await expect(assert('2026-04-18T15:00:00Z', '2026-04-18T16:00:00Z')).resolves.toBeUndefined(); // Saturday ok
      await expect(assert('2026-04-14T06:00:00Z', '2026-04-14T07:00:00Z')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: LEGACY,
      });
      await expect(
        assert('2026-04-14T23:00:00Z', '2026-04-15T00:00:00Z', { legacyTimezone: 'Asia/Tokyo' })
      ).resolves.toBeUndefined();
      expect(prismaMock.appointment.count).not.toHaveBeenCalled();
    });

    it('accepts an end at exactly 19:00 and rejects 19:01', async () => {
      await expect(assert('2026-04-14T18:00:00Z', '2026-04-14T19:00:00Z')).resolves.toBeUndefined();
      await expect(assert('2026-04-14T18:00:00Z', '2026-04-14T19:01:00Z')).rejects.toMatchObject({
        message: LEGACY,
      });
    });

    it('treats a midnight "24" hour from Intl as 0', async () => {
      await expect(assert('2026-04-14T00:00:00Z', '2026-04-14T01:00:00Z')).rejects.toMatchObject({
        message: LEGACY,
      });
    });
  });

  describe('assertAppointmentWithinAvailability — configured', () => {
    it('allows a booking inside the hours', async () => {
      stubTenantAvailability(prismaMock);
      await expect(assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).resolves.toBeUndefined();
      expect(prismaMock.appointment.count).not.toHaveBeenCalled(); // no cap set
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });

    it.each([
      [
        'OUTSIDE_HOURS',
        {},
        '2026-04-14T06:00:00Z',
        '2026-04-14T07:00:00Z',
        'Appointments on Tuesday must fall within 09:00-17:00 (Europe/London).',
      ],
      [
        'OUTSIDE_HOURS (closed weekday)',
        {},
        '2026-04-18T09:00:00Z',
        '2026-04-18T10:00:00Z',
        'The firm is closed on Saturdays (Europe/London).',
      ],
      [
        'CLOSED_DATE',
        { closures: [{ startDate: '2026-04-14', endDate: '2026-04-14' }] },
        '2026-04-14T09:00:00Z',
        '2026-04-14T10:00:00Z',
        'The firm is closed on 2026-04-14.',
      ],
      [
        'SPANS_MIDNIGHT',
        { ranges: weekdayRanges([[0, 1440]], [0, 1, 2, 3, 4, 5, 6]) },
        '2026-04-14T22:30:00Z',
        '2026-04-14T23:30:00Z',
        'Appointments cannot run past midnight. Book multi-day events as one appointment per day.',
      ],
      [
        'DAILY_CAP_REACHED',
        { cap: 2, count: 2 },
        '2026-04-14T09:00:00Z',
        '2026-04-14T10:00:00Z',
        'The daily booking limit for 2026-04-14 has been reached.',
      ],
      [
        'INVALID_INTERVAL',
        {},
        '2026-04-14T10:00:00Z',
        '2026-04-14T09:00:00Z',
        'Appointment end time must be after its start time.',
      ],
    ])(
      'maps %s to BAD_REQUEST with the contract message',
      async (_label, stub, start, end, message) => {
        stubTenantAvailability(prismaMock, stub);
        const err = await assert(start, end).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(TRPCError);
        expect(err).toMatchObject({ code: 'BAD_REQUEST', message });
      }
    );

    it('maps an invalid stored timezone to PRECONDITION_FAILED', async () => {
      stubTenantAvailability(prismaMock, { timezone: 'Not/AZone' });
      await expect(assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message:
          'The firm timezone is invalid. An administrator must fix it in Calendar > Availability.',
      });
    });

    it('ignores legacyTimezone: the firm zone governs', async () => {
      stubTenantAvailability(prismaMock);
      // 08:30Z = 09:30 BST (inside); in Tokyo it would be 17:30.
      await expect(
        assert('2026-04-14T08:30:00Z', '2026-04-14T09:30:00Z', { legacyTimezone: 'Asia/Tokyo' })
      ).resolves.toBeUndefined();
    });

    it('counts the firm-local day with the cap-counted statuses, excluding the rescheduled appointment', async () => {
      stubTenantAvailability(prismaMock, { cap: 5, count: 4 });
      await assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z', {
        excludeAppointmentId: 'appt-1',
      });
      expect(prismaMock.appointment.count).toHaveBeenCalledTimes(1);
      expect(prismaMock.appointment.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
          startTime: {
            gte: new Date('2026-04-13T23:00:00Z'),
            lt: new Date('2026-04-14T23:00:00Z'),
          },
          id: { not: 'appt-1' },
        },
      });
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });

    it('uses a 25-hour window on the autumn DST day and omits the id filter on create', async () => {
      stubTenantAvailability(prismaMock, {
        cap: 5,
        count: 0,
        ranges: weekdayRanges([[h(9), h(17)]], [0]),
      });
      await assert('2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z');
      expect(prismaMock.appointment.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
          startTime: {
            gte: new Date('2026-10-24T23:00:00Z'),
            lt: new Date('2026-10-26T00:00:00Z'),
          },
        },
      });
    });

    it('fails loudly (never allows) when the count read returns nothing', async () => {
      stubTenantAvailability(prismaMock, { cap: 3 });
      prismaMock.appointment.count.mockResolvedValue(undefined as never);
      await expect(assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).rejects.toThrow();
    });

    it('propagates a failing count, even P2022 (no legacy fallback)', async () => {
      stubTenantAvailability(prismaMock, { cap: 3 });
      prismaMock.appointment.count.mockRejectedValue(prismaError('P2022'));
      await expect(assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).rejects.toMatchObject({
        code: 'P2022',
      });
    });

    it('reads each model once', async () => {
      stubTenantAvailability(prismaMock, { cap: 3, count: 0 });
      await assert('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z');
      expect(prismaMock.appointmentSettings.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.availabilityHour.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.availabilityClosure.findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.appointment.count).toHaveBeenCalledTimes(1);
    });
  });

  describe('findNextSlotWithinAvailability', () => {
    const rules = {
      timezone: 'Europe/London',
      weeklyRanges: weekdayRanges([[h(9), h(12)]]) as never,
      closures: [],
      maxDailyBookings: null,
    };

    function useCase(result = Result.ok(null as unknown)) {
      return { findFirstFreeCandidate: vi.fn().mockResolvedValue(result) };
    }

    it('maps an invalid stored timezone to PRECONDITION_FAILED, like create and reschedule', async () => {
      const uc = useCase();
      await expect(
        findNextSlotWithinAvailability(prismaMock, uc, {
          tenantId: TENANT,
          rules: { ...rules, timezone: 'Not/AZone' },
          attendeeId: 'user-1',
          startFrom: new Date('2026-04-13T00:00:00Z'),
          durationMinutes: 60,
          maxDaysAhead: 2,
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message:
          'The firm timezone is invalid. An administrator must fix it in Calendar > Availability.',
      });
      expect(uc.findFirstFreeCandidate).not.toHaveBeenCalled();
    });

    it('keeps searching in batches until the horizon when the first batch has no free slot', async () => {
      // 24 h every day, hourly slots: 2000 candidates cover ~83 days, well short of a 365-day horizon.
      const allDay = {
        ...rules,
        weeklyRanges: weekdayRanges([[0, 1440]], [0, 1, 2, 3, 4, 5, 6]) as never,
      };
      const later = {
        start: new Date('2026-09-01T10:00:00Z'),
        end: new Date('2026-09-01T11:00:00Z'),
      };
      const uc = {
        findFirstFreeCandidate: vi
          .fn()
          .mockResolvedValueOnce(Result.ok(null))
          .mockResolvedValueOnce(Result.ok(later)),
      };
      const slot = await findNextSlotWithinAvailability(prismaMock, uc, {
        tenantId: TENANT,
        rules: allDay,
        attendeeId: 'user-1',
        startFrom: new Date('2026-04-13T00:00:00Z'),
        durationMinutes: 60,
        maxDaysAhead: 365,
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      });
      expect(uc.findFirstFreeCandidate).toHaveBeenCalledTimes(2);
      const [first, second] = uc.findFirstFreeCandidate.mock.calls.map((c) => c[0].candidates);
      expect(first).toHaveLength(2000);
      expect(second[0].start.getTime()).toBeGreaterThan(first[first.length - 1].start.getTime());
      expect(slot).toEqual({ startTime: later.start, endTime: later.end, durationMinutes: 60 });
    });

    it('passes generated candidates to one conflict check and returns the procedure shape', async () => {
      const uc = useCase(
        Result.ok({
          start: new Date('2026-04-13T09:00:00Z'),
          end: new Date('2026-04-13T10:00:00Z'),
        })
      );
      const slot = await findNextSlotWithinAvailability(prismaMock, uc, {
        tenantId: TENANT,
        rules,
        attendeeId: 'user-1',
        startFrom: new Date('2026-04-13T00:00:00Z'),
        durationMinutes: 60,
        maxDaysAhead: 2,
        bufferMinutesBefore: 10,
        bufferMinutesAfter: 5,
      });
      expect(slot).toEqual({
        startTime: new Date('2026-04-13T09:00:00Z'),
        endTime: new Date('2026-04-13T10:00:00Z'),
        durationMinutes: 60,
      });
      expect(uc.findFirstFreeCandidate).toHaveBeenCalledTimes(1);
      const arg = uc.findFirstFreeCandidate.mock.calls[0][0];
      expect(arg).toMatchObject({
        tenantId: TENANT,
        attendeeId: 'user-1',
        bufferMinutesBefore: 10,
        bufferMinutesAfter: 5,
      });
      // Starts at max(startFrom, now) = Mon 08:00 BST -> first grid point 09:00 BST.
      expect(arg.candidates[0].start.toISOString()).toBe('2026-04-13T08:00:00.000Z');
      expect(prismaMock.appointment.findMany).not.toHaveBeenCalled(); // no cap
    });

    it('drops full days with one bounded read when a cap is set (cap - 1 offered, cap dropped)', async () => {
      prismaMock.appointment.findMany.mockResolvedValue([
        { startTime: new Date('2026-04-13T09:00:00Z') },
        { startTime: new Date('2026-04-13T10:00:00Z') },
        { startTime: new Date('2026-04-14T09:00:00Z') },
      ] as never);
      const uc = useCase();
      await findNextSlotWithinAvailability(prismaMock, uc, {
        tenantId: TENANT,
        rules: { ...rules, maxDailyBookings: 2 },
        attendeeId: 'user-1',
        startFrom: new Date('2026-04-13T00:00:00Z'),
        durationMinutes: 60,
        maxDaysAhead: 2,
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      });
      expect(prismaMock.appointment.findMany).toHaveBeenCalledTimes(1);
      const where = (
        prismaMock.appointment.findMany.mock.calls[0][0] as { where: Record<string, unknown> }
      ).where;
      expect(where).toMatchObject({
        tenantId: TENANT,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] },
      });
      const days = new Set(
        uc.findFirstFreeCandidate.mock.calls[0][0].candidates.map((c: { start: Date }) =>
          c.start.toISOString().slice(0, 10)
        )
      );
      expect(days.has('2026-04-13')).toBe(false); // 2 booked = cap
      expect(days.has('2026-04-14')).toBe(true); // 1 booked = cap - 1
    });

    it('returns null without a conflict read when no candidate exists', async () => {
      const uc = useCase();
      const slot = await findNextSlotWithinAvailability(prismaMock, uc, {
        tenantId: TENANT,
        rules: { ...rules, weeklyRanges: [] },
        attendeeId: 'user-1',
        startFrom: new Date('2026-04-13T00:00:00Z'),
        durationMinutes: 60,
        maxDaysAhead: 30,
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      });
      expect(slot).toBeNull();
      expect(uc.findFirstFreeCandidate).not.toHaveBeenCalled();
    });

    it('works with the REAL CheckConflictsUseCase over an in-memory repository (contract test)', async () => {
      const repo = new InMemoryAppointmentRepository();
      const busy = Appointment.create({
        title: 'Busy',
        startTime: new Date('2026-04-13T08:00:00Z'), // 09:00-10:00 BST Monday
        endTime: new Date('2026-04-13T09:00:00Z'),
        appointmentType: 'MEETING',
        organizerId: 'user-1',
        tenantId: TENANT,
      }).value;
      await repo.save(busy);
      const slot = await findNextSlotWithinAvailability(
        prismaMock,
        new CheckConflictsUseCase(repo),
        {
          tenantId: TENANT,
          rules,
          attendeeId: 'user-1',
          startFrom: new Date('2026-04-13T00:00:00Z'),
          durationMinutes: 60,
          maxDaysAhead: 2,
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        }
      );
      expect(slot).toEqual({
        startTime: new Date('2026-04-13T09:00:00Z'), // 10:00 BST, first free grid point
        endTime: new Date('2026-04-13T10:00:00Z'),
        durationMinutes: 60,
      });
    });

    it('returns null when every candidate conflicts, and rethrows a use-case failure', async () => {
      const busy = useCase(Result.ok(null));
      await expect(
        findNextSlotWithinAvailability(prismaMock, busy, {
          tenantId: TENANT,
          rules,
          attendeeId: 'user-1',
          startFrom: NOW,
          durationMinutes: 60,
          maxDaysAhead: 1,
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        })
      ).resolves.toBeNull();
      const failing = useCase(
        Result.fail({ code: 'PERSISTENCE_ERROR', message: 'db down' } as never)
      );
      await expect(
        findNextSlotWithinAvailability(prismaMock, failing, {
          tenantId: TENANT,
          rules,
          attendeeId: 'user-1',
          startFrom: NOW,
          durationMinutes: 60,
          maxDaysAhead: 1,
          bufferMinutesBefore: 0,
          bufferMinutesAfter: 0,
        })
      ).rejects.toBeInstanceOf(TRPCError);
    });
  });
});
