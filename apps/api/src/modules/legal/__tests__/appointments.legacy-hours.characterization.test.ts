/**
 * PG-202 characterization: the booking-hours rules as they behave TODAY.
 *
 * Written before availability enforcement replaces `assertWithinBusinessHours`
 * (spec AC-017, Aurora boundary 4). It must be GREEN on the untouched router and
 * stay GREEN afterwards for tenants that never saved availability. The settings
 * read added by PG-202 returns `null` here, i.e. "never configured".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Result } from '@intelliflow/domain';
import { appointmentsRouter } from '../appointments.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';
import { container } from '../../../container';

vi.mock('../../../container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../container')>();
  return {
    ...actual,
    container: {
      ...actual.container,
      scheduleAppointmentUseCase: { execute: vi.fn() },
      rescheduleAppointmentUseCase: { execute: vi.fn() },
      checkConflictsUseCase: {
        checkConflicts: vi.fn(),
        checkAvailability: vi.fn(),
        findNextSlot: vi.fn(),
      },
    },
  };
});

const LEGACY_MESSAGE = 'Appointments must start and end between 07:00 and 19:00.';
const NOW = new Date('2026-04-13T09:00:00Z');
const APPOINTMENT_ID = TEST_UUIDS.task1;

function at(iso: string): Date {
  return new Date(iso);
}

function stubCreateSuccess(): void {
  vi.mocked(container.scheduleAppointmentUseCase.execute).mockResolvedValue(
    Result.ok({ appointment: { id: { value: APPOINTMENT_ID } } as never, conflictWarnings: [] })
  );
  prismaMock.appointment.findUnique.mockResolvedValue({
    id: APPOINTMENT_ID,
    attendees: [],
    linkedCases: [],
  } as never);
}

function stubRescheduleSuccess(): void {
  vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
    Result.ok({ previousTimeSlot: { startTime: NOW, endTime: NOW }, conflictWarnings: [] } as never)
  );
  prismaMock.appointment.findUnique.mockResolvedValue({
    id: APPOINTMENT_ID,
    attendees: [],
    linkedCases: [],
  } as never);
}

async function create(start: string, end: string, timezone?: string) {
  const caller = appointmentsRouter.createCaller(createTestContext());
  return caller.create({
    title: 'Characterization',
    startTime: at(start),
    endTime: at(end),
    appointmentType: 'MEETING',
    ...(timezone ? { timezone } : {}),
  });
}

async function reschedule(start: string, end: string) {
  const caller = appointmentsRouter.createCaller(createTestContext());
  return caller.reschedule({ id: APPOINTMENT_ID, newStartTime: at(start), newEndTime: at(end) });
}

describe('legacy booking hours (characterization, PG-202)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // PG-202 adds a settings read; null = tenant never saved availability.
    prismaMock.appointmentSettings.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create (07:00-19:00 in input.timezone, default UTC)', () => {
    it('rejects a 06:59 UTC start with the legacy message', async () => {
      stubCreateSuccess();
      await expect(create('2026-04-14T06:59:00Z', '2026-04-14T08:00:00Z')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: LEGACY_MESSAGE,
      });
      expect(container.scheduleAppointmentUseCase.execute).not.toHaveBeenCalled();
    });

    it('accepts a 07:00 UTC start', async () => {
      stubCreateSuccess();
      await expect(create('2026-04-14T07:00:00Z', '2026-04-14T08:00:00Z')).resolves.toBeDefined();
    });

    it('accepts an end at exactly 19:00', async () => {
      stubCreateSuccess();
      await expect(create('2026-04-14T18:00:00Z', '2026-04-14T19:00:00Z')).resolves.toBeDefined();
    });

    it('rejects an end at 19:01', async () => {
      stubCreateSuccess();
      await expect(create('2026-04-14T18:00:00Z', '2026-04-14T19:01:00Z')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: LEGACY_MESSAGE,
      });
    });

    it('legacy path keeps the cross-midnight gap (recorded finding)', async () => {
      // 18:00 -> 08:00 next day: both hours fall inside 07-19 and the dates are
      // never compared, so the legacy rule accepts it.
      stubCreateSuccess();
      await expect(create('2026-04-14T18:00:00Z', '2026-04-15T08:00:00Z')).resolves.toBeDefined();
    });

    it('evaluates the window in input.timezone', async () => {
      stubCreateSuccess();
      // 23:00 UTC is 08:00 in Tokyo (UTC+9): allowed in Tokyo, rejected in UTC.
      await expect(
        create('2026-04-14T23:00:00Z', '2026-04-15T00:00:00Z', 'Asia/Tokyo')
      ).resolves.toBeDefined();
      await expect(create('2026-04-14T23:00:00Z', '2026-04-15T00:00:00Z')).rejects.toMatchObject({
        message: LEGACY_MESSAGE,
      });
    });
  });

  describe('reschedule (07:00-19:00 in UTC)', () => {
    it('accepts 10:00-11:00 UTC', async () => {
      stubRescheduleSuccess();
      await expect(
        reschedule('2026-04-14T10:00:00Z', '2026-04-14T11:00:00Z')
      ).resolves.toBeDefined();
    });

    it('rejects 06:00 UTC even though it is 08:00 in Europe/Berlin summer time', async () => {
      stubRescheduleSuccess();
      await expect(
        reschedule('2026-04-14T06:00:00Z', '2026-04-14T07:00:00Z')
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: LEGACY_MESSAGE,
      });
      expect(container.rescheduleAppointmentUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe('findNextSlot (09-17 weekdays)', () => {
    it('passes workingHoursStart 9 and workingHoursEnd 17 to the use case', async () => {
      vi.mocked(container.checkConflictsUseCase.findNextSlot).mockResolvedValue(
        Result.ok({ slot: null, searchedUntil: NOW } as never)
      );
      const caller = appointmentsRouter.createCaller(createTestContext());
      const result = await caller.findNextSlot({
        attendeeId: TEST_UUIDS.user1,
        startFrom: NOW,
        durationMinutes: 60,
      });
      expect(result.slot).toBeNull();
      expect(container.checkConflictsUseCase.findNextSlot).toHaveBeenCalledWith(
        expect.objectContaining({ workingHoursStart: 9, workingHoursEnd: 17 })
      );
    });
  });
});
