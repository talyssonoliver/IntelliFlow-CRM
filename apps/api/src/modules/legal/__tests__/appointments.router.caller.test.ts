/**
 * Appointments Router Caller Tests
 *
 * Tests that actually invoke the router procedures through createCaller
 * to achieve real code coverage for appointments.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appointmentsRouter } from '../appointments.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

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
      })),
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

describe('Appointments Router - Caller Tests', () => {
  const now = new Date();
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
    tenantId: 'test-tenant-id',
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

      prismaMock.appointment.create.mockResolvedValue(mockAppointment as any);
      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.create({
        title: 'Test Appointment',
        startTime: now,
        endTime: oneHourLater,
        appointmentType: 'MEETING',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(mockAppointment.id);
      expect(prismaMock.appointment.create).toHaveBeenCalled();
    });

    it('should handle conflict detection with forceOverrideConflicts', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.create.mockResolvedValue(mockAppointment as any);

      const result = await caller.create({
        title: 'Test Appointment',
        startTime: now,
        endTime: oneHourLater,
        appointmentType: 'MEETING',
        forceOverrideConflicts: true,
      });

      expect(result).toBeDefined();
      // With forceOverrideConflicts, it should skip conflict check
      expect(prismaMock.appointment.findMany).not.toHaveBeenCalled();
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

      const result = await caller.list({});

      expect(result.appointments).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by date range', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.count.mockResolvedValue(0);

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
        TRPCError,
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
        TRPCError,
      );
    });
  });

  describe('reschedule', () => {
    it('should reschedule an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      const newStartTime = new Date(now.getTime() + 86400000);
      const newEndTime = new Date(newStartTime.getTime() + 3600000);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        attendees: [{ userId: TEST_UUIDS.user2 }],
      } as any);
      prismaMock.appointment.findMany.mockResolvedValue([]);
      prismaMock.appointment.update.mockResolvedValue({
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

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      } as any);

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: new Date(),
          newEndTime: new Date(Date.now() + 3600000),
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw when rescheduling cancelled appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CANCELLED',
      } as any);

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: new Date(),
          newEndTime: new Date(Date.now() + 3600000),
        }),
      ).rejects.toThrow(TRPCError);
    });

    it('should throw when new start time is after end time', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        attendees: [],
      } as any);

      await expect(
        caller.reschedule({
          id: mockAppointment.id,
          newStartTime: new Date(Date.now() + 7200000),
          newEndTime: new Date(Date.now() + 3600000),
        }),
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

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CONFIRMED',
      } as any);
      prismaMock.appointment.update.mockResolvedValue({
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

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CANCELLED',
      } as any);

      await expect(caller.complete({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });

    it('should throw when already completed', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      } as any);

      await expect(caller.complete({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });
  });

  describe('cancel', () => {
    it('should cancel an appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue(mockAppointment as any);
      prismaMock.appointment.update.mockResolvedValue({
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

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'CANCELLED',
      } as any);

      await expect(caller.cancel({ id: mockAppointment.id })).rejects.toThrow(TRPCError);
    });

    it('should throw when cancelling completed appointment', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findUnique.mockResolvedValue({
        ...mockAppointment,
        status: 'COMPLETED',
      } as any);

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

      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.checkConflicts({
        startTime: now,
        endTime: oneHourLater,
        attendeeIds: [TEST_UUIDS.user1],
      });

      expect(result).toBeDefined();
      expect(result.hasConflicts).toBe(false);
    });
  });

  describe('checkAvailability', () => {
    it('should check availability', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.checkAvailability({
        attendeeId: TEST_UUIDS.user1,
        startTime: now,
        endTime: oneHourLater,
        minimumSlotMinutes: 30,
      });

      expect(result).toBeDefined();
      expect(result.availableSlots).toBeDefined();
      expect(typeof result.totalAvailableMinutes).toBe('number');
    });
  });

  describe('findNextSlot', () => {
    it('should find next available slot', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.findNextSlot({
        attendeeId: TEST_UUIDS.user1,
        startFrom: now,
        durationMinutes: 60,
      });

      expect(result).toBeDefined();
      expect(result.slot).toBeDefined();
    });

    it('should find next slot with buffer times', async () => {
      const ctx = createTestContext();
      const caller = appointmentsRouter.createCaller(ctx);

      prismaMock.appointment.findMany.mockResolvedValue([]);

      const result = await caller.findNextSlot({
        attendeeId: TEST_UUIDS.user1,
        startFrom: now,
        durationMinutes: 60,
        bufferMinutesBefore: 15,
        bufferMinutesAfter: 15,
        maxDaysAhead: 14,
      });

      expect(result).toBeDefined();
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
        }),
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
        }),
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
        }),
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
        }),
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
      prismaMock.appointment.groupBy.mockResolvedValue([
        { status: 'SCHEDULED', _count: 5 },
        { status: 'COMPLETED', _count: 3 },
      ] as any);

      const result = await caller.stats();

      expect(result).toBeDefined();
      expect(result.total).toBe(10);
      expect(result.byStatus).toBeDefined();
    });
  });
});
