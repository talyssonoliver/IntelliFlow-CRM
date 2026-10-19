/**
 * Appointments Router Caller Tests
 *
 * Tests that actually invoke the router procedures through createCaller
 * to achieve real code coverage for appointments.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Result } from '@intelliflow/domain';
import { appointmentsRouter } from '../appointments.router';
import { prismaMock, createTestContext, generateTestUUID, TEST_UUIDS } from '../../../test/setup';
import { container } from '../../../container';
import {
  h,
  weekdayRanges,
  stubTenantAvailability,
  expectEveryCallTenantScoped,
} from '../../calendar/__tests__/availability.test-utils';

// Mock the AppointmentDomainService
vi.mock('../../../services', () => ({
  AppointmentDomainService: {
    validateInput: vi.fn(() => ({ valid: true, errors: [] })),
    toDomainAppointments: vi.fn((data: any[]) =>
      data.map((a) => ({
        id: a.id,
        title: a.title,
        start: a.startTime,
        end: a.endTime,
        type: a.appointmentType,
        bufferBefore: a.bufferMinutesBefore || 0,
        bufferAfter: a.bufferMinutesAfter || 0,
        attendees: a.attendees?.map((att: any) => att.userId) || [],
      }))
    ),
    checkConflicts: vi.fn(() => ({ hasConflicts: false, conflicts: [] })),
    checkAvailability: vi.fn(() => [
      { startTime: new Date(), endTime: new Date(Date.now() + 1800000), durationMinutes: 30 },
    ]),
    findNextAvailableSlot: vi.fn(() => ({
      startTime: new Date(),
      endTime: new Date(Date.now() + 1800000),
      durationMinutes: 30,
    })),
  },
}));

// Mock the container so use cases never hit the real database.
// The five procedures migrated in Phase 2 (create, reschedule, complete, cancel,
// checkConflicts/checkAvailability/findNextSlot) call container use cases instead
// of prismaWithTenant directly, so each use case must return a predictable
// Result.ok value. Prisma mocks are still needed for post-fetch calls that the
// router makes after a successful use case execution.
vi.mock('../../../container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../container')>();
  return {
    ...actual,
    container: {
      ...actual.container,
      scheduleAppointmentUseCase: {
        execute: vi.fn(),
      },
      rescheduleAppointmentUseCase: {
        execute: vi.fn(),
      },
      cancelAppointmentUseCase: {
        execute: vi.fn(),
      },
      completeAppointmentUseCase: {
        execute: vi.fn(),
      },
      checkConflictsUseCase: {
        checkConflicts: vi.fn(),
        checkAvailability: vi.fn(),
        findNextSlot: vi.fn(),
      },
    },
  };
});

describe('Appointments Router - Caller Tests', () => {
  // Use a fixed UTC time well inside business hours (07:00-19:00) so tests
  // don't depend on wall-clock time. 10:00 UTC gives a 1h meeting ending at
  // 11:00 UTC, and `+86400000` still lands in business hours the next day.
  const now = new Date('2026-04-14T10:00:00Z');
  const oneHourLater = new Date(now.getTime() + 3600000);

  const mockAppointment = {
    id: TEST_UUIDS.task1,
    title: 'Test Appointment',
    description: 'Test Description',
    startTime: now,
    endTime: oneHourLater,
    appointmentType: 'MEETING' as const,
    status: 'SCHEDULED' as const,
    location: 'Office',
    organizerId: TEST_UUIDS.user1,
    tenantId: TEST_UUIDS.tenant,
    bufferMinutesBefore: 0,
    bufferMinutesAfter: 0,
    notes: null,
    reminderMinutes: 15,
    recurrence: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: now,
    updatedAt: now,
    attendees: [],
    linkedCases: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create an appointment successfully', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2e: create now routes through scheduleAppointmentUseCase.
      // Mock the use case to return a domain appointment, then mock the
      // post-fetch findUnique that the router performs to get the Prisma row.
      vi.mocked(container.scheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({
          appointment: { id: { value: mockAppointment.id } } as any,
          conflictWarnings: [],
        })
      );
      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);

      const result = await caller.create({
        title: 'Test Appointment',
        startTime: now,
        endTime: oneHourLater,
        appointmentType: 'MEETING',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(mockAppointment.id);
      // Assert the use case was invoked (replaces the old prisma.appointment.create assertion)
      expect(vi.mocked(container.scheduleAppointmentUseCase.execute)).toHaveBeenCalled();
    });

    it('should handle conflict detection with forceOverrideConflicts', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      vi.mocked(container.scheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({
          appointment: { id: { value: mockAppointment.id } } as any,
          conflictWarnings: [],
        })
      );
      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);

      const result = await caller.create({
        title: 'Test Appointment',
        startTime: now,
        endTime: oneHourLater,
        appointmentType: 'MEETING',
        forceOverrideConflicts: true,
      });

      expect(result).toBeDefined();
      // With forceOverrideConflicts, the use case is called with the flag set
      expect(vi.mocked(container.scheduleAppointmentUseCase.execute)).toHaveBeenCalledWith(
        expect.objectContaining({ forceOverrideConflicts: true })
      );
    });
  });

  describe('attendee and linked-case ownership (#890)', () => {
    const create = (extra: Record<string, unknown>) =>
      appointmentsRouter.createCaller(createTestContext()).create({
        title: 'Test Appointment',
        startTime: now,
        endTime: oneHourLater,
        appointmentType: 'MEETING',
        ...extra,
      });

    it('rejects a create with an attendee of another tenant before scheduling', async () => {
      prismaMock.user.count.mockResolvedValue(0);

      await expect(create({ attendeeIds: [TEST_UUIDS.user2] })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Attendee not found',
      });
      expect(vi.mocked(container.scheduleAppointmentUseCase.execute)).not.toHaveBeenCalled();
      expect(prismaMock.user.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { in: [TEST_UUIDS.user2] } }),
      });
    });

    it('rejects a create linked to a case of another tenant before scheduling', async () => {
      prismaMock.case.count.mockResolvedValue(0);

      await expect(create({ linkedCaseIds: [TEST_UUIDS.account1] })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(vi.mocked(container.scheduleAppointmentUseCase.execute)).not.toHaveBeenCalled();
      expect(prismaMock.case.count).toHaveBeenCalledWith({
        where: { id: { in: [TEST_UUIDS.account1] }, tenantId: TEST_UUIDS.tenant },
      });
    });

    it('rejects when only some of the attendees belong to the tenant', async () => {
      prismaMock.user.count.mockResolvedValue(1);

      await expect(
        create({ attendeeIds: [TEST_UUIDS.user1, TEST_UUIDS.user2] })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(vi.mocked(container.scheduleAppointmentUseCase.execute)).not.toHaveBeenCalled();
    });

    it('rejects linkToCase for a case of another tenant without writing the link', async () => {
      prismaMock.case.count.mockResolvedValue(0);

      await expect(
        appointmentsRouter
          .createCaller(createTestContext())
          .linkToCase({ appointmentId: mockAppointment.id, caseId: TEST_UUIDS.account1 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(prismaMock.appointmentCase.create).not.toHaveBeenCalled();
    });

    it('schedules when every attendee and case belongs to the tenant', async () => {
      prismaMock.user.count.mockResolvedValue(1);
      prismaMock.case.count.mockResolvedValue(1);
      vi.mocked(container.scheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({
          appointment: { id: { value: mockAppointment.id } } as any,
          conflictWarnings: [],
        })
      );
      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);

      const result = await create({
        attendeeIds: [TEST_UUIDS.user2],
        linkedCaseIds: [TEST_UUIDS.account1],
      });

      expect(result.id).toBe(mockAppointment.id);
    });
  });

  describe('getById', () => {
    it('should return an appointment by ID', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);

      const result = await caller.getById({ id: mockAppointment.id });

      expect(result).toBeDefined();
      expect(result.id).toBe(mockAppointment.id);
    });

    it('should throw NOT_FOUND for non-existent appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(caller.getById({ id: 'non-existent' })).rejects.toThrow(TRPCError);
    });
  });

  describe('list', () => {
    it('should list appointments with pagination', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([mockAppointment] as any);
      prismaMock.appointment.count.mockResolvedValue(1);
      (prismaMock.user.findMany as any).mockResolvedValue([]);

      const result = await caller.list({});

      expect(result.appointments).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by date range', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);
      (prismaMock.user.findMany as any).mockResolvedValue([]);

      const result = await caller.list({
        startTimeFrom: now,
        startTimeTo: oneHourLater,
      });

      expect(result.appointments).toHaveLength(0);
      expect(prismaMock.appointment.findMany).toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);
      (prismaMock.user.findMany as any).mockResolvedValue([]);

      await caller.list({
        status: ['SCHEDULED', 'CONFIRMED'],
      });

      expect(prismaMock.appointment.findMany).toHaveBeenCalled();
    });

    it('should filter by appointment type', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);
      (prismaMock.user.findMany as any).mockResolvedValue([]);

      await caller.list({
        appointmentType: ['MEETING', 'CALL'],
      });

      expect(prismaMock.appointment.findMany).toHaveBeenCalled();
    });

    it('should filter by caseId', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);
      (prismaMock.user.findMany as any).mockResolvedValue([]);

      await caller.list({
        caseId: TEST_UUIDS.account1,
      });

      expect(prismaMock.appointment.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointment.update.mockResolvedValue({
        ...mockAppointment,
        title: 'Updated Title',
      } as any);

      const result = await caller.update({
        id: mockAppointment.id,
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
    });

    it('should throw NOT_FOUND when updating non-existent appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(caller.update({ id: 'non-existent', title: 'Updated' })).rejects.toThrow(
        TRPCError
      );
    });

    it('should throw BAD_REQUEST when updating cancelled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CANCELLED',
      } as any);

      await expect(caller.update({ id: mockAppointment.id, title: 'Updated' })).rejects.toThrow(
        TRPCError
      );
    });
  });

  describe('reschedule', () => {
    beforeEach(() => {
      // reschedule loads and authorises the target before anything else.
      prismaMock.appointment.findFirst.mockResolvedValue({ id: mockAppointment.id } as any);
    });

    it('should reschedule an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Use a time slot guaranteed to be within business hours (10:00–11:00 UTC next day)
      const newStartTime = new Date(now.getTime() + 86400000); // 10:00 UTC tomorrow
      const newEndTime = new Date(newStartTime.getTime() + 3600000); // 11:00 UTC tomorrow

      // Phase 2d: reschedule routes through rescheduleAppointmentUseCase.
      // The use case handles the status check and conflict detection.
      vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({
          previousTimeSlot: { startTime: now, endTime: oneHourLater },
          conflictWarnings: [],
        } as any)
      );
      // Post-fetch findUnique after successful use case execution
      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        startTime: newStartTime,
        endTime: newEndTime,
      } as any);

      const result = await caller.reschedule({
        id: mockAppointment.id,
        newStartTime,
        newEndTime,
      });

      expect(result.appointment).toBeDefined();
      expect(result.previousTime).toBeDefined();
    });

    it('should throw when rescheduling completed appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2d: use case returns a domain error for invalid status transitions
      vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Cannot reschedule a COMPLETED appointment',
        } as any)
      );

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: now,
          newEndTime: oneHourLater,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw when rescheduling cancelled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2d: use case returns a domain error for invalid status transitions
      vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Cannot reschedule a CANCELLED appointment',
        } as any)
      );

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: now,
          newEndTime: oneHourLater,
        })
      ).rejects.toThrow(TRPCError);
    });

    it('should throw when new start time is after end time', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2d: use case returns a domain error for invalid time ranges
      vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Start time must be before end time',
        } as any)
      );

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: now,
          newEndTime: oneHourLater,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('confirm', () => {
    it('should confirm a scheduled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'CONFIRMED',
      } as any);

      const result = await caller.confirm({ id: mockAppointment.id });

      expect(result.status).toBe('CONFIRMED');
    });

    it('should throw when confirming non-scheduled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      } as any);

      await expect(caller.confirm({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });

    it('should throw NOT_FOUND for non-existent appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(caller.confirm({ id: 'non-existent' })).rejects.toThrow(TRPCError);
    });
  });

  describe('complete', () => {
    it('should complete an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2b: complete routes through completeAppointmentUseCase.
      vi.mocked(container.completeAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({ completedAt: new Date() } as any)
      );
      // Post-fetch findUnique after successful use case execution
      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
        notes: 'Meeting notes',
      } as any);

      const result = await caller.complete({
        id: mockAppointment.id,
        notes: 'Meeting notes',
      });

      expect(result.status).toBe('COMPLETED');
    });

    it('should throw when completing cancelled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2b: use case returns a domain error for invalid status transitions
      vi.mocked(container.completeAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Cannot complete a CANCELLED appointment',
        } as any)
      );

      await expect(caller.complete({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });

    it('should throw when already completed', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2b: use case returns a domain error for invalid status transitions
      vi.mocked(container.completeAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Appointment is already COMPLETED',
        } as any)
      );

      await expect(caller.complete({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });
  });

  describe('cancel', () => {
    it('should cancel an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2a: cancel routes through cancelAppointmentUseCase.
      vi.mocked(container.cancelAppointmentUseCase.execute).mockResolvedValue(
        Result.ok({ cancelledAt: new Date() } as any)
      );
      // Post-fetch findUnique after successful use case execution
      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CANCELLED',
      } as any);

      const result = await caller.cancel({
        id: mockAppointment.id,
        reason: 'No longer needed',
      });

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw when cancelling already cancelled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2a: use case returns a domain error for invalid status transitions
      vi.mocked(container.cancelAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Appointment is already CANCELLED',
        } as any)
      );

      await expect(caller.cancel({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });

    it('should throw when cancelling completed appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2a: use case returns a domain error for invalid status transitions
      vi.mocked(container.cancelAppointmentUseCase.execute).mockResolvedValue(
        Result.fail({
          code: 'VALIDATION_ERROR',
          message: 'Cannot cancel a COMPLETED appointment',
        } as any)
      );

      await expect(caller.cancel({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });
  });

  describe('markNoShow', () => {
    it('should mark appointment as no-show', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CONFIRMED',
      } as any);
      prismaMock.appointment.update.mockResolvedValue({
        ...mockAppointment,
        status: 'NO_SHOW',
      } as any);

      const result = await caller.markNoShow({ id: mockAppointment.id });

      expect(result.status).toBe('NO_SHOW');
    });

    it('should throw when marking completed appointment as no-show', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      } as any);

      await expect(caller.markNoShow({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });
  });

  describe('delete', () => {
    it('should delete an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointment.delete.mockResolvedValue(mockAppointment as any);

      const result = await caller.delete({ id: mockAppointment.id });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND when deleting non-existent appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(caller.delete({ id: 'non-existent' })).rejects.toThrow(TRPCError);
    });
  });

  describe('checkConflicts', () => {
    it('should check for conflicts', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2c: checkConflicts routes through checkConflictsUseCase.checkConflicts.
      // No conflicts → hasConflicts: false, empty conflicts array.
      vi.mocked(container.checkConflictsUseCase.checkConflicts).mockResolvedValue(
        Result.ok({ hasConflicts: false, conflicts: [] })
      );
      // Router post-fetches appointmentType for conflict IDs — no IDs so findMany not called.

      const result = await caller.checkConflicts({
        startTime: now,
        endTime: oneHourLater,
        attendeeIds: [TEST_UUIDS.user1],
      });

      expect(result).toBeDefined();
      expect(result.hasConflicts).toBe(false);
      expect(vi.mocked(container.checkConflictsUseCase.checkConflicts)).toHaveBeenCalled();
    });
  });

  describe('checkAvailability', () => {
    it('should check availability', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2c: checkAvailability routes through checkConflictsUseCase.checkAvailability.
      vi.mocked(container.checkConflictsUseCase.checkAvailability).mockResolvedValue(
        Result.ok({
          availableSlots: [{ startTime: now, endTime: oneHourLater, durationMinutes: 60 }],
          totalAvailableMinutes: 60,
        })
      );

      const result = await caller.checkAvailability({
        attendeeId: TEST_UUIDS.user1,
        startTime: now,
        endTime: oneHourLater,
        minimumSlotMinutes: 30,
      });

      expect(result).toBeDefined();
      expect(result.availableSlots).toBeDefined();
      expect(typeof result.totalAvailableMinutes).toBe('number');
      expect(vi.mocked(container.checkConflictsUseCase.checkAvailability)).toHaveBeenCalled();
    });
  });

  describe('findNextSlot', () => {
    it('should find next available slot', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2c: findNextSlot routes through checkConflictsUseCase.findNextSlot.
      vi.mocked(container.checkConflictsUseCase.findNextSlot).mockResolvedValue(
        Result.ok({
          slot: { startTime: now, endTime: oneHourLater, durationMinutes: 60 },
          searchedUntil: oneHourLater,
        })
      );

      const result = await caller.findNextSlot({
        attendeeId: TEST_UUIDS.user1,
        startFrom: now,
        durationMinutes: 60,
      });

      expect(result).toBeDefined();
      expect(result.slot).toBeDefined();
      expect(vi.mocked(container.checkConflictsUseCase.findNextSlot)).toHaveBeenCalled();
    });

    it('should find next slot with buffer times', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      // Phase 2c: findNextSlot routes through checkConflictsUseCase.findNextSlot.
      vi.mocked(container.checkConflictsUseCase.findNextSlot).mockResolvedValue(
        Result.ok({
          slot: { startTime: now, endTime: oneHourLater, durationMinutes: 60 },
          searchedUntil: oneHourLater,
        })
      );

      const result = await caller.findNextSlot({
        attendeeId: TEST_UUIDS.user1,
        startFrom: now,
        durationMinutes: 60,
        bufferMinutesBefore: 15,
        bufferMinutesAfter: 15,
        maxDaysAhead: 14,
      });

      expect(result).toBeDefined();
      expect(vi.mocked(container.checkConflictsUseCase.findNextSlot)).toHaveBeenCalledWith(
        expect.objectContaining({
          bufferMinutesBefore: 15,
          bufferMinutesAfter: 15,
          maxDaysAhead: 14,
        })
      );
    });
  });

  describe('linkToCase', () => {
    it('should link appointment to case', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.case.count.mockResolvedValue(1);
      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointmentCase.findUnique.mockResolvedValue(null);
      prismaMock.appointmentCase.create.mockResolvedValue({
        id: 'link-1',
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      } as any);

      const result = await caller.linkToCase({
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      });

      expect(result.success).toBe(true);
    });

    it('should return success if already linked', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.case.count.mockResolvedValue(1);
      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointmentCase.findUnique.mockResolvedValue({
        id: 'link-1',
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      } as any);

      const result = await caller.linkToCase({
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already linked');
    });

    it('should throw NOT_FOUND if appointment does not exist', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.case.count.mockResolvedValue(1);
      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(
        caller.linkToCase({
          appointmentId: 'non-existent',
          caseId: TEST_UUIDS.account1,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('unlinkFromCase', () => {
    it('should unlink appointment from case', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointmentCase.findUnique.mockResolvedValue({
        id: 'link-1',
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      } as any);
      prismaMock.appointmentCase.delete.mockResolvedValue({} as any);

      const result = await caller.unlinkFromCase({
        appointmentId: mockAppointment.id,
        caseId: TEST_UUIDS.account1,
      });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND if link does not exist', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointmentCase.findUnique.mockResolvedValue(null);

      await expect(
        caller.unlinkFromCase({
          appointmentId: mockAppointment.id,
          caseId: TEST_UUIDS.account1,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('addAttendee', () => {
    it('should add attendee to appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointmentAttendee.findUnique.mockResolvedValue(null);
      prismaMock.appointmentAttendee.create.mockResolvedValue({
        id: 'attendee-1',
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      } as any);

      const result = await caller.addAttendee({
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      });

      expect(result.success).toBe(true);
    });

    it('should return success if attendee already added', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointmentAttendee.findUnique.mockResolvedValue({
        id: 'attendee-1',
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      } as any);

      const result = await caller.addAttendee({
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Already added');
    });

    it('should throw NOT_FOUND if appointment does not exist', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(null);

      await expect(
        caller.addAttendee({
          appointmentId: 'non-existent',
          userId: TEST_UUIDS.user2,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('removeAttendee', () => {
    it('should remove attendee from appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointmentAttendee.findUnique.mockResolvedValue({
        id: 'attendee-1',
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      } as any);
      prismaMock.appointmentAttendee.delete.mockResolvedValue({} as any);

      const result = await caller.removeAttendee({
        appointmentId: mockAppointment.id,
        userId: TEST_UUIDS.user2,
      });

      expect(result.success).toBe(true);
    });

    it('should throw NOT_FOUND if attendee not found', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointmentAttendee.findUnique.mockResolvedValue(null);

      await expect(
        caller.removeAttendee({
          appointmentId: mockAppointment.id,
          userId: TEST_UUIDS.user2,
        })
      ).rejects.toThrow(TRPCError);
    });
  });

  describe('upcoming', () => {
    it('should return upcoming appointments', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([mockAppointment] as any);

      const result = await caller.upcoming({ limit: 10 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('should return appointment statistics', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.count.mockResolvedValue(10);
      (prismaMock.appointment.groupBy as any).mockResolvedValue([
        { status: 'SCHEDULED', _count: 5 },
        { status: 'COMPLETED', _count: 3 },
      ]);

      const result = await caller.stats();

      expect(result).toBeDefined();
      expect(result.total).toBe(10);
      expect(result.byStatus).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// PG-202: firm availability enforced at booking (AC-015, AC-016, AC-017, AC-020)
// ---------------------------------------------------------------------------
describe('availability enforcement (PG-202)', () => {
  const NOW = new Date('2026-04-13T06:00:00Z'); // Monday 07:00 BST
  const APPT = TEST_UUIDS.task1;
  const TENANT = TEST_UUIDS.tenant;
  const MON_FRI_9_12 = weekdayRanges([[h(9), h(12)]]);

  function okCreate() {
    vi.mocked(container.scheduleAppointmentUseCase.execute).mockResolvedValue(
      Result.ok({ appointment: { id: { value: APPT } } as any, conflictWarnings: [] })
    );
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: APPT,
      attendees: [],
      linkedCases: [],
    } as any);
  }

  function okReschedule() {
    vi.mocked(container.rescheduleAppointmentUseCase.execute).mockResolvedValue(
      Result.ok({ previousTimeSlot: { startTime: NOW, endTime: NOW }, conflictWarnings: [] } as any)
    );
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: APPT,
      attendees: [],
      linkedCases: [],
    } as any);
  }

  const create = (start: string, end: string, extra: Record<string, unknown> = {}) =>
    appointmentsRouter.createCaller(createTestContext()).create({
      title: 'Client call',
      startTime: new Date(start),
      endTime: new Date(end),
      appointmentType: 'MEETING',
      ...extra,
    } as any);

  const reschedule = (start: string, end: string) =>
    appointmentsRouter
      .createCaller(createTestContext())
      .reschedule({ id: APPT, newStartTime: new Date(start), newEndTime: new Date(end) });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('allows a booking inside the firm hours and calls the use case', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      okCreate();
      await expect(create('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')).resolves.toBeDefined();
      expect(container.scheduleAppointmentUseCase.execute).toHaveBeenCalledTimes(1);
      expectEveryCallTenantScoped(prismaMock, TENANT);
    });

    it.each([
      [
        'outside hours',
        {},
        '2026-04-14T12:00:00Z',
        '2026-04-14T13:00:00Z',
        /Tuesday must fall within 09:00-12:00/,
      ],
      [
        'a closed weekday',
        {},
        '2026-04-18T09:00:00Z',
        '2026-04-18T10:00:00Z',
        /closed on Saturdays/,
      ],
      [
        'a closure date',
        { closures: [{ startDate: '2026-04-14', endDate: '2026-04-14' }] },
        '2026-04-14T09:00:00Z',
        '2026-04-14T10:00:00Z',
        /closed on 2026-04-14/,
      ],
      [
        'the daily cap',
        { cap: 1, count: 1 },
        '2026-04-14T09:00:00Z',
        '2026-04-14T10:00:00Z',
        /daily booking limit/,
      ],
      [
        'running past midnight',
        { ranges: weekdayRanges([[0, 1440]], [0, 1, 2, 3, 4, 5, 6]) },
        '2026-04-14T22:30:00Z',
        '2026-04-14T23:30:00Z',
        /past midnight/,
      ],
    ])('rejects %s before the use case runs', async (_label, stub, start, end, message) => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12, ...stub });
      okCreate();
      await expect(create(start, end)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: expect.stringMatching(message),
      });
      expect(container.scheduleAppointmentUseCase.execute).not.toHaveBeenCalled();
    });

    it('is not bypassed by forceOverrideConflicts', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      okCreate();
      await expect(
        create('2026-04-18T09:00:00Z', '2026-04-18T10:00:00Z', { forceOverrideConflicts: true })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('uses the firm zone and ignores input.timezone', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      okCreate();
      // 08:30Z = 09:30 BST (open); in Tokyo it is 17:30.
      await expect(
        create('2026-04-14T08:30:00Z', '2026-04-14T09:30:00Z', { timezone: 'Asia/Tokyo' })
      ).resolves.toBeDefined();
    });

    it('keeps the legacy 07:00-19:00 rule for a tenant that never saved availability', async () => {
      stubTenantAvailability(prismaMock, { configured: false });
      okCreate();
      await expect(create('2026-04-18T15:00:00Z', '2026-04-18T16:00:00Z')).resolves.toBeDefined(); // Saturday ok
      await expect(create('2026-04-14T06:00:00Z', '2026-04-14T07:00:00Z')).rejects.toMatchObject({
        message: 'Appointments must start and end between 07:00 and 19:00.',
      });
    });

    it('runs the availability check before the use case', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      okCreate();
      await create('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z');
      const settingsRead = prismaMock.appointmentSettings.findUnique.mock.invocationCallOrder[0];
      const useCase = vi.mocked(container.scheduleAppointmentUseCase.execute).mock
        .invocationCallOrder[0];
      expect(settingsRead).toBeLessThan(useCase);
    });
  });

  describe('reschedule', () => {
    beforeEach(() => {
      prismaMock.appointment.findFirst.mockResolvedValue({ id: APPT } as any);
    });

    it('returns NOT_FOUND for an unknown or foreign appointment before any availability check', async () => {
      stubTenantAvailability(prismaMock, {
        ranges: MON_FRI_9_12,
        closures: [{ startDate: '2026-04-15', endDate: '2026-04-15' }],
      });
      prismaMock.appointment.findFirst.mockResolvedValue(null);
      okReschedule();
      await expect(
        reschedule('2026-04-15T09:00:00Z', '2026-04-15T10:00:00Z')
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(prismaMock.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: APPT, tenantId: TENANT } })
      );
      expect(prismaMock.appointmentSettings.findUnique).not.toHaveBeenCalled();
      expect(container.rescheduleAppointmentUseCase.execute).not.toHaveBeenCalled();
    });

    it('rejects a move onto a closure date', async () => {
      stubTenantAvailability(prismaMock, {
        ranges: MON_FRI_9_12,
        closures: [{ startDate: '2026-04-15', endDate: '2026-04-15' }],
      });
      okReschedule();
      await expect(
        reschedule('2026-04-15T09:00:00Z', '2026-04-15T10:00:00Z')
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'The firm is closed on 2026-04-15.',
      });
      expect(container.rescheduleAppointmentUseCase.execute).not.toHaveBeenCalled();
    });

    it('excludes the appointment itself from the daily cap', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12, cap: 2, count: 1 });
      okReschedule();
      await expect(
        reschedule('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')
      ).resolves.toBeDefined();
      expect(prismaMock.appointment.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId: TENANT, id: { not: APPT } }),
      });
    });

    it('rejects a move into a full day', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12, cap: 2, count: 2 });
      okReschedule();
      await expect(
        reschedule('2026-04-14T09:00:00Z', '2026-04-14T10:00:00Z')
      ).rejects.toMatchObject({
        message: 'The daily booking limit for 2026-04-14 has been reached.',
      });
    });

    it('uses the firm zone, not UTC', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      okReschedule();
      // 11:30Z is inside the legacy UTC window but 12:30 BST, after the firm closes at 12:00.
      await expect(
        reschedule('2026-04-14T08:00:00Z', '2026-04-14T09:00:00Z')
      ).resolves.toBeDefined();
      await expect(
        reschedule('2026-04-14T11:30:00Z', '2026-04-14T12:00:00Z')
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('keeps the legacy UTC rule for a tenant that never saved availability', async () => {
      stubTenantAvailability(prismaMock, { configured: false });
      okReschedule();
      await expect(
        reschedule('2026-04-14T06:00:00Z', '2026-04-14T07:00:00Z')
      ).rejects.toMatchObject({
        message: 'Appointments must start and end between 07:00 and 19:00.',
      });
    });
  });

  describe('findNextSlot', () => {
    it('keeps the legacy 9-17 call for an unconfigured tenant', async () => {
      stubTenantAvailability(prismaMock, { configured: false });
      vi.mocked(container.checkConflictsUseCase.findNextSlot).mockResolvedValue(
        Result.ok({ slot: null, searchedUntil: NOW } as any)
      );
      await appointmentsRouter
        .createCaller(createTestContext())
        .findNextSlot({ attendeeId: TEST_UUIDS.user1, startFrom: NOW, durationMinutes: 60 });
      expect(container.checkConflictsUseCase.findNextSlot).toHaveBeenCalledWith(
        expect.objectContaining({ workingHoursStart: 9, workingHoursEnd: 17 })
      );
    });

    it('offers only slots inside saved availability for a configured tenant', async () => {
      stubTenantAvailability(prismaMock, { ranges: MON_FRI_9_12 });
      const findFirstFreeCandidate = vi
        .fn()
        .mockImplementation(async ({ candidates }: any) => Result.ok(candidates[1]));
      (container.checkConflictsUseCase as any).findFirstFreeCandidate = findFirstFreeCandidate;

      const result = await appointmentsRouter
        .createCaller(createTestContext())
        .findNextSlot({ attendeeId: TEST_UUIDS.user1, startFrom: NOW, durationMinutes: 60 });

      expect(container.checkConflictsUseCase.findNextSlot).not.toHaveBeenCalled();
      expect(result.slot).toEqual({
        startTime: new Date('2026-04-13T09:00:00Z'), // 10:00 BST Monday, second grid point
        endTime: new Date('2026-04-13T10:00:00Z'),
        durationMinutes: 60,
      });
      expect(typeof result.searchDurationMs).toBe('number');
    });
  });

  describe('cross-tenant isolation', () => {
    const OTHER = generateTestUUID('tenant-b');

    function stubPerTenant() {
      // Tenant A (TENANT): Mon-Fri 09-12. Tenant B (OTHER): never configured.
      prismaMock.appointmentSettings.findUnique.mockImplementation((async (args: any) =>
        args.where.tenantId === TENANT
          ? {
              availabilityConfiguredAt: new Date('2026-04-01T00:00:00Z'),
              defaultTimezone: 'Europe/London',
              maxDailyBookings: null,
            }
          : null) as any);
      prismaMock.availabilityHour.findMany.mockImplementation((async (args: any) =>
        args.where.tenantId === TENANT ? MON_FRI_9_12 : []) as any);
      prismaMock.availabilityClosure.findMany.mockResolvedValue([] as any);
    }

    function ctxFor(tenantId: string) {
      const base = createTestContext();
      return createTestContext({
        user: { ...base.user!, tenantId },
        tenant: { ...base.tenant!, tenantId },
      });
    }

    it('the hours of tenant A never govern a booking of tenant B', async () => {
      stubPerTenant();
      okCreate();
      const input = {
        title: 'Call',
        startTime: new Date('2026-04-18T14:00:00Z'), // Saturday
        endTime: new Date('2026-04-18T15:00:00Z'),
        appointmentType: 'MEETING',
      } as any;

      await expect(
        appointmentsRouter.createCaller(ctxFor(OTHER)).create(input)
      ).resolves.toBeDefined();
      await expect(
        appointmentsRouter.createCaller(ctxFor(TENANT)).create(input)
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });

      const tenantsRead = prismaMock.appointmentSettings.findUnique.mock.calls.map(
        (c: any) => c[0].where.tenantId
      );
      expect(tenantsRead).toEqual([OTHER, TENANT]);
    });
  });
});
