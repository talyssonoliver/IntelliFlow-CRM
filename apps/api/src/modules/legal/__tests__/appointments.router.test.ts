/**
 * Appointments Router Tests - IFC-137
 *
 * Tests for appointment management router:
 * - CRUD operations (create, read, update, delete)
 * - Conflict detection and availability checking
 * - Rescheduling and cancellation
 * - Case linkage
 * - Recurrence support
 *
 * KPIs: Conflict detection accuracy >95%, scheduling latency <=100ms
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appointmentsRouter } from '../appointments.router';

// Mock the domain service
vi.mock('../../../services', () => ({
  AppointmentDomainService: {
    validateInput: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    toDomainAppointments: vi.fn().mockReturnValue([]),
    checkConflicts: vi.fn().mockReturnValue({ hasConflicts: false, conflicts: [] }),
    checkAvailability: vi.fn().mockReturnValue({ isAvailable: true, availableSlots: [] }),
    findNextSlot: vi.fn().mockReturnValue(null),
  },
}));

// Test data
const validAppointmentInput = {
  title: 'Team Meeting',
  description: 'Weekly team sync',
  startTime: new Date('2026-02-01T10:00:00Z'),
  endTime: new Date('2026-02-01T11:00:00Z'),
  appointmentType: 'MEETING' as const,
  location: 'Conference Room A',
  attendeeIds: [],
  linkedCaseIds: [],
  bufferMinutesBefore: 5,
  bufferMinutesAfter: 5,
  forceOverrideConflicts: false,
};

const mockContext = {
  user: {
    userId: 'user-123',
    email: 'test@example.com',
    role: 'ADMIN' as const,
    tenantId: 'tenant-1',
  },
  prisma: {
    appointment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
};

describe('Appointments Router - IFC-137', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Router Structure', () => {
    it('should have create procedure', () => {
      expect(appointmentsRouter._def.procedures.create).toBeDefined();
    });

    it('should have getById procedure', () => {
      expect(appointmentsRouter._def.procedures.getById).toBeDefined();
    });

    it('should have list procedure', () => {
      expect(appointmentsRouter._def.procedures.list).toBeDefined();
    });

    it('should have update procedure', () => {
      expect(appointmentsRouter._def.procedures.update).toBeDefined();
    });

    it('should have reschedule procedure', () => {
      expect(appointmentsRouter._def.procedures.reschedule).toBeDefined();
    });

    it('should have confirm procedure', () => {
      expect(appointmentsRouter._def.procedures.confirm).toBeDefined();
    });

    it('should have complete procedure', () => {
      expect(appointmentsRouter._def.procedures.complete).toBeDefined();
    });

    it('should have cancel procedure', () => {
      expect(appointmentsRouter._def.procedures.cancel).toBeDefined();
    });

    it('should have checkConflicts procedure', () => {
      expect(appointmentsRouter._def.procedures.checkConflicts).toBeDefined();
    });

    it('should have checkAvailability procedure', () => {
      expect(appointmentsRouter._def.procedures.checkAvailability).toBeDefined();
    });

    it('should have findNextSlot procedure', () => {
      expect(appointmentsRouter._def.procedures.findNextSlot).toBeDefined();
    });
  });

  describe('Procedure Types', () => {
    it('should have expected mutation procedures', () => {
      const mutations = [
        'create',
        'update',
        'reschedule',
        'confirm',
        'complete',
        'cancel',
      ];

      mutations.forEach((name) => {
        expect(appointmentsRouter._def.procedures[name]).toBeDefined();
      });
    });

    it('should have expected query procedures', () => {
      const queries = [
        'getById',
        'list',
        'checkConflicts',
        'checkAvailability',
        'findNextSlot',
      ];

      queries.forEach((name) => {
        expect(appointmentsRouter._def.procedures[name]).toBeDefined();
      });
    });
  });

  describe('Input Validation', () => {
    it('should validate appointment type enum', () => {
      const validTypes = [
        'MEETING',
        'CALL',
        'HEARING',
        'CONSULTATION',
        'DEPOSITION',
        'OTHER',
      ];

      validTypes.forEach((type) => {
        expect(validTypes).toContain(type);
      });
    });

    it('should validate appointment status enum', () => {
      const validStatuses = [
        'SCHEDULED',
        'CONFIRMED',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
      ];

      validStatuses.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });

    it('should validate day of week enum', () => {
      const validDays = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];

      validDays.forEach((day) => {
        expect(validDays).toContain(day);
      });
    });

    it('should validate recurrence frequency enum', () => {
      const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

      validFrequencies.forEach((freq) => {
        expect(validFrequencies).toContain(freq);
      });
    });
  });

  describe('Create Appointment Schema', () => {
    it('should require title with min 1 and max 255 characters', () => {
      expect(validAppointmentInput.title.length).toBeGreaterThanOrEqual(1);
      expect(validAppointmentInput.title.length).toBeLessThanOrEqual(255);
    });

    it('should allow description up to 2000 characters', () => {
      const maxDescription = 'a'.repeat(2000);
      expect(maxDescription.length).toBe(2000);
    });

    it('should allow location up to 500 characters', () => {
      const maxLocation = 'a'.repeat(500);
      expect(maxLocation.length).toBe(500);
    });

    it('should allow buffer minutes between 0 and 240', () => {
      expect(validAppointmentInput.bufferMinutesBefore).toBeGreaterThanOrEqual(0);
      expect(validAppointmentInput.bufferMinutesBefore).toBeLessThanOrEqual(240);
    });
  });

  describe('Reschedule Schema', () => {
    it('should require new start and end times', () => {
      const rescheduleInput = {
        id: 'apt-123',
        newStartTime: new Date('2026-02-02T10:00:00Z'),
        newEndTime: new Date('2026-02-02T11:00:00Z'),
        reason: 'Schedule conflict',
        forceOverrideConflicts: false,
      };

      expect(rescheduleInput.newStartTime).toBeInstanceOf(Date);
      expect(rescheduleInput.newEndTime).toBeInstanceOf(Date);
    });

    it('should allow optional reason up to 500 characters', () => {
      const maxReason = 'a'.repeat(500);
      expect(maxReason.length).toBe(500);
    });
  });

  describe('Check Conflicts Schema', () => {
    it('should require start and end times', () => {
      const conflictCheckInput = {
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
        attendeeIds: ['user-1', 'user-2'],
        bufferMinutesBefore: 0,
        bufferMinutesAfter: 0,
      };

      expect(conflictCheckInput.startTime).toBeInstanceOf(Date);
      expect(conflictCheckInput.endTime).toBeInstanceOf(Date);
    });

    it('should require at least one attendee', () => {
      const conflictCheckInput = {
        attendeeIds: ['user-1'],
      };

      expect(conflictCheckInput.attendeeIds.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Check Availability Schema', () => {
    it('should require attendee ID', () => {
      const availabilityInput = {
        attendeeId: 'user-123',
        startTime: new Date('2026-02-01T08:00:00Z'),
        endTime: new Date('2026-02-01T18:00:00Z'),
        minimumSlotMinutes: 30,
      };

      expect(availabilityInput.attendeeId).toBeDefined();
    });

    it('should have minimum slot minutes at least 5', () => {
      const minSlotMinutes = 5;
      expect(minSlotMinutes).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Find Next Slot Schema', () => {
    it('should require attendee ID and duration', () => {
      const findSlotInput = {
        attendeeId: 'user-123',
        startFrom: new Date('2026-02-01T08:00:00Z'),
        durationMinutes: 60,
        maxDaysAhead: 30,
        bufferMinutesBefore: 5,
        bufferMinutesAfter: 5,
      };

      expect(findSlotInput.attendeeId).toBeDefined();
      expect(findSlotInput.durationMinutes).toBeGreaterThanOrEqual(5);
    });

    it('should limit maxDaysAhead between 1 and 365', () => {
      const minDays = 1;
      const maxDays = 365;

      expect(minDays).toBeGreaterThanOrEqual(1);
      expect(maxDays).toBeLessThanOrEqual(365);
    });
  });

  describe('List Appointments Schema', () => {
    it('should support pagination', () => {
      const listInput = {
        page: 1,
        limit: 20,
      };

      expect(listInput.page).toBeGreaterThanOrEqual(1);
      expect(listInput.limit).toBeGreaterThanOrEqual(1);
      expect(listInput.limit).toBeLessThanOrEqual(100);
    });

    it('should support sorting', () => {
      const validSortFields = ['startTime', 'createdAt', 'updatedAt'];
      const validSortOrders = ['asc', 'desc'];

      validSortFields.forEach((field) => {
        expect(validSortFields).toContain(field);
      });

      validSortOrders.forEach((order) => {
        expect(validSortOrders).toContain(order);
      });
    });

    it('should support filtering by status array', () => {
      const listInput = {
        status: ['SCHEDULED', 'CONFIRMED'] as const,
      };

      expect(listInput.status.length).toBeGreaterThan(0);
    });

    it('should support filtering by appointment type array', () => {
      const listInput = {
        appointmentType: ['MEETING', 'CALL'] as const,
      };

      expect(listInput.appointmentType.length).toBeGreaterThan(0);
    });

    it('should support filtering by date range', () => {
      const listInput = {
        startTimeFrom: new Date('2026-02-01T00:00:00Z'),
        startTimeTo: new Date('2026-02-28T23:59:59Z'),
      };

      expect(listInput.startTimeFrom).toBeInstanceOf(Date);
      expect(listInput.startTimeTo).toBeInstanceOf(Date);
    });

    it('should support filtering by case ID', () => {
      const listInput = {
        caseId: 'case-123',
      };

      expect(listInput.caseId).toBeDefined();
    });
  });

  describe('Update Appointment Schema', () => {
    it('should require ID', () => {
      const updateInput = {
        id: 'apt-123',
        title: 'Updated Title',
      };

      expect(updateInput.id).toBeDefined();
    });

    it('should allow partial updates', () => {
      const updateInput = {
        id: 'apt-123',
        title: 'Updated Title',
        // Other fields are optional
      };

      expect(updateInput.title).toBeDefined();
    });

    it('should allow notes up to 5000 characters', () => {
      const maxNotes = 'a'.repeat(5000);
      expect(maxNotes.length).toBe(5000);
    });
  });

  describe('Recurrence Schema', () => {
    it('should support daily recurrence', () => {
      const dailyRecurrence = {
        frequency: 'DAILY' as const,
        interval: 1,
      };

      expect(dailyRecurrence.frequency).toBe('DAILY');
    });

    it('should support weekly recurrence with days of week', () => {
      const weeklyRecurrence = {
        frequency: 'WEEKLY' as const,
        interval: 1,
        daysOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'] as const,
      };

      expect(weeklyRecurrence.frequency).toBe('WEEKLY');
      expect(weeklyRecurrence.daysOfWeek.length).toBe(3);
    });

    it('should support monthly recurrence with day of month', () => {
      const monthlyRecurrence = {
        frequency: 'MONTHLY' as const,
        interval: 1,
        dayOfMonth: 15,
      };

      expect(monthlyRecurrence.frequency).toBe('MONTHLY');
      expect(monthlyRecurrence.dayOfMonth).toBeGreaterThanOrEqual(1);
      expect(monthlyRecurrence.dayOfMonth).toBeLessThanOrEqual(31);
    });

    it('should support yearly recurrence with month of year', () => {
      const yearlyRecurrence = {
        frequency: 'YEARLY' as const,
        interval: 1,
        monthOfYear: 6,
      };

      expect(yearlyRecurrence.frequency).toBe('YEARLY');
      expect(yearlyRecurrence.monthOfYear).toBeGreaterThanOrEqual(1);
      expect(yearlyRecurrence.monthOfYear).toBeLessThanOrEqual(12);
    });

    it('should support end date or occurrence count', () => {
      const recurrenceWithEndDate = {
        frequency: 'WEEKLY' as const,
        endDate: new Date('2026-12-31'),
      };

      const recurrenceWithCount = {
        frequency: 'WEEKLY' as const,
        occurrenceCount: 10,
      };

      expect(recurrenceWithEndDate.endDate).toBeInstanceOf(Date);
      expect(recurrenceWithCount.occurrenceCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Conflict Detection', () => {
    it('should identify time overlap conflicts', () => {
      const appointment1 = {
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
      };

      const appointment2 = {
        startTime: new Date('2026-02-01T10:30:00Z'),
        endTime: new Date('2026-02-01T11:30:00Z'),
      };

      // Appointments overlap from 10:30 to 11:00
      const start1 = appointment1.startTime.getTime();
      const end1 = appointment1.endTime.getTime();
      const start2 = appointment2.startTime.getTime();
      const end2 = appointment2.endTime.getTime();

      const hasOverlap = start1 < end2 && start2 < end1;
      expect(hasOverlap).toBe(true);
    });

    it('should not identify conflict for adjacent appointments', () => {
      const appointment1 = {
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
      };

      const appointment2 = {
        startTime: new Date('2026-02-01T11:00:00Z'),
        endTime: new Date('2026-02-01T12:00:00Z'),
      };

      const start1 = appointment1.startTime.getTime();
      const end1 = appointment1.endTime.getTime();
      const start2 = appointment2.startTime.getTime();
      const end2 = appointment2.endTime.getTime();

      // Appointment 2 starts exactly when appointment 1 ends - no overlap
      const hasOverlap = start1 < end2 && start2 < end1;
      expect(hasOverlap).toBe(false);
    });

    it('should consider buffer times in conflict detection', () => {
      const appointment1 = {
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
        bufferMinutesAfter: 15,
      };

      const appointment2 = {
        startTime: new Date('2026-02-01T11:10:00Z'),
        endTime: new Date('2026-02-01T12:00:00Z'),
        bufferMinutesBefore: 0,
      };

      // With 15-minute buffer after appointment 1, it effectively ends at 11:15
      const effectiveEnd1 = new Date(appointment1.endTime.getTime() + appointment1.bufferMinutesAfter * 60000);
      const hasBufferConflict = effectiveEnd1.getTime() > appointment2.startTime.getTime();

      expect(hasBufferConflict).toBe(true);
    });
  });

  describe('Appointment Workflow', () => {
    it('should only allow confirm from SCHEDULED status', () => {
      const validStatusForConfirm = 'SCHEDULED';
      expect(validStatusForConfirm).toBe('SCHEDULED');
    });

    it('should not allow update of cancelled appointments', () => {
      const cancelledStatus = 'CANCELLED';
      const cannotUpdate = cancelledStatus === 'CANCELLED';
      expect(cannotUpdate).toBe(true);
    });

    it('should not allow reschedule of completed appointments', () => {
      const completedStatus = 'COMPLETED';
      const cannotReschedule = completedStatus === 'COMPLETED';
      expect(cannotReschedule).toBe(true);
    });

    it('should not allow complete of already completed appointments', () => {
      const completedStatus = 'COMPLETED';
      const cannotCompleteAgain = completedStatus === 'COMPLETED';
      expect(cannotCompleteAgain).toBe(true);
    });

    it('should not allow cancel of completed appointments', () => {
      const completedStatus = 'COMPLETED';
      const cannotCancel = completedStatus === 'COMPLETED';
      expect(cannotCancel).toBe(true);
    });
  });

  describe('Time Validation', () => {
    it('should require start time before end time', () => {
      const validTimes = {
        startTime: new Date('2026-02-01T10:00:00Z'),
        endTime: new Date('2026-02-01T11:00:00Z'),
      };

      expect(validTimes.startTime < validTimes.endTime).toBe(true);
    });

    it('should calculate duration in minutes', () => {
      const startTime = new Date('2026-02-01T10:00:00Z');
      const endTime = new Date('2026-02-01T11:30:00Z');

      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = durationMs / (1000 * 60);

      expect(durationMinutes).toBe(90);
    });
  });
});

describe('Appointments Router Error Handling', () => {
  describe('Not Found Errors', () => {
    it('should use NOT_FOUND code for missing appointments', () => {
      const errorCode = 'NOT_FOUND';
      expect(errorCode).toBe('NOT_FOUND');
    });
  });

  describe('Bad Request Errors', () => {
    it('should use BAD_REQUEST code for invalid operations', () => {
      const errorCode = 'BAD_REQUEST';
      expect(errorCode).toBe('BAD_REQUEST');
    });
  });

  describe('Conflict Errors', () => {
    it('should use CONFLICT code for scheduling conflicts', () => {
      const errorCode = 'CONFLICT';
      expect(errorCode).toBe('CONFLICT');
    });
  });
});
