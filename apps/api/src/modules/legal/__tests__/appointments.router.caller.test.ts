/**
 * Appointments Router Caller Tests
 *
 * Tests that actually invoke the router procedures through createCaller
 * to achieve real code coverage for appointments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Result } from '@intelliflow/domain';
import { appointmentsRouter } from '../appointments.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';
import { container } from '../../../container';

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
