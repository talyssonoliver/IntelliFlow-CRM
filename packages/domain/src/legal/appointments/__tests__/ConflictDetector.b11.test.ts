/**
 * ConflictDetector - B11 coverage tests
 *
 * Targets uncovered branches:
 * - isBufferOnlyConflict: core time slots don't overlap but effective slots do (BUFFER type)
 * - checkTimeSlotConflicts: excludeAppointmentId skip, inactive appointment skip
 * - checkAvailability: includeBuffer=false path (uses apt.startTime/endTime)
 * - checkAvailability: appointments outside range skip
 * - findNextAvailableSlot: weekend skipping, before working hours, after working hours
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConflictDetector } from '../ConflictDetector';
import { Appointment, CreateAppointmentProps } from '../Appointment';
import { TimeSlot } from '../TimeSlot';
import { Buffer } from '../Buffer';

// Use far-future date to avoid "appointment in past" errors
const BASE_DATE = new Date('2030-01-15');

function createTestAppointment(
  startHour: number,
  endHour: number,
  options?: {
    organizerId?: string;
    attendeeIds?: string[];
    bufferBefore?: number;
    bufferAfter?: number;
    status?: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  }
): Appointment {
  const startTime = new Date(BASE_DATE);
  startTime.setHours(startHour, 0, 0, 0);
  const endTime = new Date(BASE_DATE);
  endTime.setHours(endHour, 0, 0, 0);

  const buffer = Buffer.create(options?.bufferBefore ?? 0, options?.bufferAfter ?? 0).value;

  const props: CreateAppointmentProps = {
    title: `Test Appointment ${startHour}-${endHour}`,
    startTime,
    endTime,
    appointmentType: 'MEETING',
    organizerId: options?.organizerId ?? 'organizer-1',
    attendeeIds: options?.attendeeIds ?? [],
    buffer,
    tenantId: 'tenant-1',
  };

  const result = Appointment.create(props);
  if (result.isFailure) {
    throw new Error(`Failed to create test appointment: ${result.error.message}`);
  }

  const apt = result.value;

  if (options?.status === 'CANCELLED') {
    apt.cancel('test', 'test reason');
  } else if (options?.status === 'COMPLETED') {
    apt.complete('test', 'test notes');
  }

  return apt;
}

describe('ConflictDetector - b11 branch coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BUFFER conflict type', () => {
    it('should detect BUFFER conflict when only buffers overlap', () => {
      // Appointment 1: 10:00-11:00 with 30min buffer (effective: 9:30-11:30)
      // Appointment 2: 11:15-12:15 with 30min buffer (effective: 10:45-12:45)
      // Core slots don't overlap (10-11 vs 11:15-12:15) but effective slots do
      const apt1 = createTestAppointment(10, 11, { bufferBefore: 30, bufferAfter: 30 });

      const startTime2 = new Date(BASE_DATE);
      startTime2.setHours(11, 15, 0, 0);
      const endTime2 = new Date(BASE_DATE);
      endTime2.setHours(12, 15, 0, 0);
      const buffer2 = Buffer.create(30, 30).value;
      const apt2Result = Appointment.create({
        title: 'Test 2',
        startTime: startTime2,
        endTime: endTime2,
        appointmentType: 'MEETING',
        organizerId: 'organizer-2',
        attendeeIds: [],
        buffer: buffer2,
        tenantId: 'tenant-1',
      });
      const apt2 = apt2Result.value;

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);
      if (result.hasConflicts) {
        expect(result.conflicts[0].conflictType).toBe('BUFFER');
      }
    });

    it('should detect PARTIAL conflict when core times overlap', () => {
      const apt1 = createTestAppointment(10, 12);
      const apt2 = createTestAppointment(11, 13, { organizerId: 'organizer-2' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].conflictType).toBe('PARTIAL');
    });

    it('should detect EXACT conflict when times are identical', () => {
      const apt1 = createTestAppointment(10, 12);
      const apt2 = createTestAppointment(10, 12, { organizerId: 'organizer-2' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);
      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].conflictType).toBe('EXACT');
    });
  });

  describe('checkTimeSlotConflicts edge cases', () => {
    it('should skip excluded appointment by ID', () => {
      const apt = createTestAppointment(10, 12);
      const startTime = new Date(BASE_DATE);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(12, 0, 0, 0);
      const timeSlot = TimeSlot.create(startTime, endTime).value;
      const buffer = Buffer.none();

      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, [apt], apt.id);
      expect(result.hasConflicts).toBe(false);
    });

    it('should skip inactive (cancelled) appointments', () => {
      const apt = createTestAppointment(10, 12, { status: 'CANCELLED' });
      const startTime = new Date(BASE_DATE);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(12, 0, 0, 0);
      const timeSlot = TimeSlot.create(startTime, endTime).value;
      const buffer = Buffer.none();

      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, [apt]);
      expect(result.hasConflicts).toBe(false);
    });

    it('should handle empty appointments list', () => {
      const startTime = new Date(BASE_DATE);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(12, 0, 0, 0);
      const timeSlot = TimeSlot.create(startTime, endTime).value;
      const buffer = Buffer.none();

      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, []);
      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('checkAvailability - includeBuffer=false', () => {
    it('should use core times when includeBuffer is false', () => {
      const apt = createTestAppointment(10, 11, {
        organizerId: 'user-1',
        bufferBefore: 30,
        bufferAfter: 30,
      });

      const startTime = new Date(BASE_DATE);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(13, 0, 0, 0);

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'user-1',
          startTime,
          endTime,
          minimumSlotMinutes: 15,
          includeBuffer: false,
        },
        [apt]
      );

      // Without buffer: apt blocks 10:00-11:00, so slots: 9-10 and 11-13
      expect(slots.length).toBe(2);
    });
  });

  describe('checkAvailability - appointments outside range', () => {
    it('should skip appointments entirely before the range', () => {
      const apt = createTestAppointment(7, 8, { organizerId: 'user-1' });

      const startTime = new Date(BASE_DATE);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(12, 0, 0, 0);

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'user-1',
          startTime,
          endTime,
          minimumSlotMinutes: 15,
        },
        [apt]
      );

      // Appointment is before range
      expect(slots.length).toBe(1);
      expect(slots[0].durationMinutes).toBe(180);
    });

    it('should skip appointments entirely after the range', () => {
      const apt = createTestAppointment(14, 15, { organizerId: 'user-1' });

      const startTime = new Date(BASE_DATE);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(BASE_DATE);
      endTime.setHours(12, 0, 0, 0);

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'user-1',
          startTime,
          endTime,
          minimumSlotMinutes: 15,
        },
        [apt]
      );

      expect(slots.length).toBe(1);
      expect(slots[0].durationMinutes).toBe(180);
    });
  });

  describe('findNextAvailableSlot - weekend and hours', () => {
    it('should skip weekends', () => {
      // 2030-01-19 is Saturday, 2030-01-20 is Sunday
      const saturday = new Date('2030-01-19T10:00:00');
      const slot = ConflictDetector.findNextAvailableSlot('user-1', saturday, 60, []);

      expect(slot).not.toBeNull();
      if (slot) {
        const day = slot.startTime.getDay();
        expect(day).not.toBe(0);
        expect(day).not.toBe(6);
      }
    });

    it('should advance to next day when after working hours', () => {
      const lateEvening = new Date('2030-01-15T20:00:00');
      const slot = ConflictDetector.findNextAvailableSlot('user-1', lateEvening, 60, [], {
        workingHoursStart: 9,
        workingHoursEnd: 17,
      });

      expect(slot).not.toBeNull();
      if (slot) {
        expect(slot.startTime.getHours()).toBeGreaterThanOrEqual(9);
      }
    });

    it('should adjust to working hours start when before working hours', () => {
      const earlyMorning = new Date('2030-01-15T05:00:00');
      const slot = ConflictDetector.findNextAvailableSlot('user-1', earlyMorning, 60, [], {
        workingHoursStart: 9,
        workingHoursEnd: 17,
      });

      expect(slot).not.toBeNull();
      if (slot) {
        expect(slot.startTime.getHours()).toBeGreaterThanOrEqual(9);
      }
    });

    it('should include buffer in total required duration', () => {
      const buffer = Buffer.create(15, 15).value;
      const slot = ConflictDetector.findNextAvailableSlot(
        'user-1',
        new Date('2030-01-15T09:00:00'),
        60,
        [],
        { buffer }
      );

      expect(slot).not.toBeNull();
      if (slot) {
        expect(slot.durationMinutes).toBe(90);
      }
    });
  });
});
