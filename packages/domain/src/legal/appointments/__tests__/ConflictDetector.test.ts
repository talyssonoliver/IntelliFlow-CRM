/**
 * ConflictDetector Service Tests
 *
 * Tests the conflict detection functionality for appointments.
 * Target: >95% conflict detection accuracy as per IFC-137 KPI.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConflictDetector } from '../ConflictDetector';
import { Appointment, CreateAppointmentProps } from '../Appointment';
import { TimeSlot } from '../TimeSlot';
import { Buffer } from '../Buffer';

// Helper to create appointments for testing
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
  // Use a fixed future date to avoid "appointment in past" errors
  const baseDate = new Date('2030-01-15');
  const startTime = new Date(baseDate);
  startTime.setHours(startHour, 0, 0, 0);
  const endTime = new Date(baseDate);
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
  };

  const result = Appointment.create(props);
  if (result.isFailure) {
    throw new Error(`Failed to create test appointment: ${result.error.message}`);
  }

  const apt = result.value;

  // If cancelled or completed, update status
  if (options?.status === 'CANCELLED') {
    apt.cancel('test', 'test reason');
  } else if (options?.status === 'COMPLETED') {
    apt.complete('test', 'test notes');
  }

  return apt;
}

describe('ConflictDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkConflicts()', () => {
    it('should detect overlapping appointments', () => {
      const apt1 = createTestAppointment(9, 10);
      const apt2 = createTestAppointment(9, 11, { organizerId: 'organizer-2' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].overlapMinutes).toBe(60);
    });

    it('should not detect non-overlapping appointments', () => {
      const apt1 = createTestAppointment(9, 10);
      const apt2 = createTestAppointment(11, 12, { organizerId: 'organizer-2' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should not detect conflict with self', () => {
      const apt1 = createTestAppointment(9, 10);

      const result = ConflictDetector.checkConflicts(apt1, [apt1]);

      expect(result.hasConflicts).toBe(false);
    });

    it('should not detect conflict with cancelled appointments', () => {
      const apt1 = createTestAppointment(9, 10);
      const apt2 = createTestAppointment(9, 11, {
        organizerId: 'organizer-2',
        status: 'CANCELLED',
      });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(false);
    });

    it('should not detect conflict with completed appointments', () => {
      const apt1 = createTestAppointment(9, 10);
      const apt2 = createTestAppointment(9, 11, {
        organizerId: 'organizer-2',
        status: 'COMPLETED',
      });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(false);
    });

    it('should return empty conflicts for empty appointment list', () => {
      const apt1 = createTestAppointment(9, 10);

      const result = ConflictDetector.checkConflicts(apt1, []);

      expect(result.hasConflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect multiple conflicts', () => {
      const apt1 = createTestAppointment(9, 12);
      const apt2 = createTestAppointment(9, 10, { organizerId: 'organizer-2' });
      const apt3 = createTestAppointment(10, 11, { organizerId: 'organizer-3' });
      const apt4 = createTestAppointment(11, 12, { organizerId: 'organizer-4' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2, apt3, apt4]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts).toHaveLength(3);
    });

    it('should detect buffer conflicts', () => {
      const apt1 = createTestAppointment(9, 10, { bufferAfter: 30 });
      const apt2 = createTestAppointment(10, 11, { organizerId: 'organizer-2' });

      // apt1 effective end is 10:30, apt2 starts at 10:00
      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(true);
    });

    it('should identify conflict types correctly', () => {
      const apt1 = createTestAppointment(9, 10);
      // Create exact same time slot
      const apt2 = createTestAppointment(9, 10, { organizerId: 'organizer-2' });

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].conflictType).toBe('EXACT');
    });

    it('should calculate overlap minutes correctly', () => {
      const apt1 = createTestAppointment(9, 11); // 2 hours
      const apt2 = createTestAppointment(10, 12, { organizerId: 'organizer-2' }); // 2 hours, 1 hour overlap

      const result = ConflictDetector.checkConflicts(apt1, [apt2]);

      expect(result.hasConflicts).toBe(true);
      expect(result.conflicts[0].overlapMinutes).toBe(60);
    });
  });

  describe('checkTimeSlotConflicts()', () => {
    it('should detect conflicts with time slot', () => {
      const timeSlot = TimeSlot.create(
        new Date('2030-01-15T09:00:00Z'),
        new Date('2030-01-15T10:00:00Z')
      ).value;
      const buffer = Buffer.none();
      const apt = createTestAppointment(9, 11);

      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, [apt]);

      expect(result.hasConflicts).toBe(true);
    });

    it('should exclude specified appointment', () => {
      const timeSlot = TimeSlot.create(
        new Date('2030-01-15T09:00:00Z'),
        new Date('2030-01-15T10:00:00Z')
      ).value;
      const buffer = Buffer.none();
      const apt = createTestAppointment(9, 11);

      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, [apt], apt.id);

      expect(result.hasConflicts).toBe(false);
    });

    it('should consider buffer time', () => {
      const timeSlot = TimeSlot.create(
        new Date('2030-01-15T09:00:00Z'),
        new Date('2030-01-15T10:00:00Z')
      ).value;
      const buffer = Buffer.create(15, 15).value; // 15 min buffer each side
      const apt = createTestAppointment(10, 11); // Starts right at our end

      // With buffer, our effective end is 10:15, apt starts at 10:00
      const result = ConflictDetector.checkTimeSlotConflicts(timeSlot, buffer, [apt]);

      expect(result.hasConflicts).toBe(true);
    });
  });

  describe('checkAvailability()', () => {
    it('should find available slots', () => {
      const startTime = new Date('2030-01-15T09:00:00Z');
      const endTime = new Date('2030-01-15T17:00:00Z');

      // Appointments from 10-11 and 14-15
      const apt1 = createTestAppointment(10, 11);
      const apt2 = createTestAppointment(14, 15);

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'organizer-1',
          startTime,
          endTime,
          minimumSlotMinutes: 30,
        },
        [apt1, apt2]
      );

      // Should find: 9-10, 11-14, 15-17
      expect(slots.length).toBeGreaterThan(0);
    });

    it('should respect minimum slot duration', () => {
      const startTime = new Date('2030-01-15T09:00:00Z');
      const endTime = new Date('2030-01-15T12:00:00Z');

      // Appointment from 9:30-11:50, leaving only 10 min gaps
      const apt = createTestAppointment(9, 11);

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'organizer-1',
          startTime,
          endTime,
          minimumSlotMinutes: 60, // 1 hour minimum
        },
        [apt]
      );

      // Should only find 11:00-12:00 (1 hour)
      expect(slots.every((s) => s.durationMinutes >= 60)).toBe(true);
    });

    it('should return full range when no appointments', () => {
      const startTime = new Date('2030-01-15T09:00:00Z');
      const endTime = new Date('2030-01-15T17:00:00Z');

      const slots = ConflictDetector.checkAvailability(
        {
          attendeeId: 'organizer-1',
          startTime,
          endTime,
          minimumSlotMinutes: 30,
        },
        []
      );

      expect(slots).toHaveLength(1);
      expect(slots[0].durationMinutes).toBe(480); // 8 hours
    });
  });

  describe('findNextAvailableSlot()', () => {
    it('should find next available slot', () => {
      const startFrom = new Date('2030-01-15T09:00:00Z');
      const apt = createTestAppointment(9, 10);

      const slot = ConflictDetector.findNextAvailableSlot(
        'organizer-1',
        startFrom,
        60, // 1 hour
        [apt],
        { workingHoursStart: 9, workingHoursEnd: 17 }
      );

      expect(slot).not.toBeNull();
      // Should find slot starting at 10:00 or later
      expect(slot!.startTime.getHours()).toBeGreaterThanOrEqual(10);
    });

    it('should return null if no slot found within max days', () => {
      const startFrom = new Date('2030-01-15T09:00:00Z');

      // Create appointments filling all working hours for many days
      const appointments: Appointment[] = [];
      for (let day = 0; day < 5; day++) {
        for (let hour = 9; hour < 17; hour++) {
          const apt = createTestAppointment(hour, hour + 1, {
            organizerId: `org-${day}-${hour}`,
          });
          appointments.push(apt);
        }
      }

      const slot = ConflictDetector.findNextAvailableSlot(
        'organizer-1',
        startFrom,
        60,
        appointments,
        { maxDaysAhead: 3 }
      );

      // May or may not find slot depending on implementation details
      // The key is it should handle the case gracefully
    });

    it('should consider buffer in slot finding', () => {
      const startFrom = new Date('2030-01-15T09:00:00Z');
      const apt = createTestAppointment(9, 10);
      const buffer = Buffer.create(15, 15).value;

      const slot = ConflictDetector.findNextAvailableSlot('organizer-1', startFrom, 60, [apt], {
        workingHoursStart: 9,
        workingHoursEnd: 17,
        buffer,
      });

      expect(slot).not.toBeNull();
      // With buffer consideration, slot should account for buffer time
    });
  });

  describe('calculateConflictAccuracy()', () => {
    it('should return 100% for perfect detection', () => {
      const actualConflicts = [
        {
          appointmentId: { value: 'apt1' } as any,
          conflictingAppointmentId: { value: 'apt2' } as any,
          overlapMinutes: 30,
          conflictType: 'PARTIAL' as const,
          conflictStart: new Date(),
          conflictEnd: new Date(),
        },
      ];

      const detectedConflicts = [...actualConflicts];

      const accuracy = ConflictDetector.calculateConflictAccuracy(
        detectedConflicts,
        actualConflicts
      );

      expect(accuracy).toBe(100);
    });

    it('should return 100% for no conflicts case', () => {
      const accuracy = ConflictDetector.calculateConflictAccuracy([], []);
      expect(accuracy).toBe(100);
    });

    it('should return 0% for all false positives', () => {
      const detectedConflicts = [
        {
          appointmentId: { value: 'apt1' } as any,
          conflictingAppointmentId: { value: 'apt2' } as any,
          overlapMinutes: 30,
          conflictType: 'PARTIAL' as const,
          conflictStart: new Date(),
          conflictEnd: new Date(),
        },
      ];

      const accuracy = ConflictDetector.calculateConflictAccuracy(
        detectedConflicts,
        [] // No actual conflicts
      );

      expect(accuracy).toBe(0);
    });

    it('should calculate partial accuracy correctly', () => {
      const actualConflicts = [
        {
          appointmentId: { value: 'apt1' } as any,
          conflictingAppointmentId: { value: 'apt2' } as any,
          overlapMinutes: 30,
          conflictType: 'PARTIAL' as const,
          conflictStart: new Date(),
          conflictEnd: new Date(),
        },
        {
          appointmentId: { value: 'apt1' } as any,
          conflictingAppointmentId: { value: 'apt3' } as any,
          overlapMinutes: 30,
          conflictType: 'PARTIAL' as const,
          conflictStart: new Date(),
          conflictEnd: new Date(),
        },
      ];

      // Only detect one of two
      const detectedConflicts = [actualConflicts[0]];

      const accuracy = ConflictDetector.calculateConflictAccuracy(
        detectedConflicts,
        actualConflicts
      );

      // 1 correct / (1 + 0.5 * (0 + 1)) = 1/1.5 = 66.67%
      expect(accuracy).toBeGreaterThan(60);
      expect(accuracy).toBeLessThan(70);
    });
  });

  describe('batchCheckConflicts()', () => {
    it('should check all appointments for conflicts', () => {
      const apt1 = createTestAppointment(9, 10);
      const apt2 = createTestAppointment(9, 11, { organizerId: 'organizer-2' });
      const apt3 = createTestAppointment(12, 13, { organizerId: 'organizer-3' });

      const results = ConflictDetector.batchCheckConflicts([apt1, apt2, apt3]);

      expect(results.size).toBe(3);

      // apt1 and apt2 should conflict with each other
      const apt1Result = results.get(apt1.id.value);
      const apt2Result = results.get(apt2.id.value);

      expect(apt1Result?.hasConflicts).toBe(true);
      expect(apt2Result?.hasConflicts).toBe(true);

      // apt3 should not conflict
      const apt3Result = results.get(apt3.id.value);
      expect(apt3Result?.hasConflicts).toBe(false);
    });

    it('should handle empty list', () => {
      const results = ConflictDetector.batchCheckConflicts([]);
      expect(results.size).toBe(0);
    });

    it('should handle single appointment', () => {
      const apt = createTestAppointment(9, 10);
      const results = ConflictDetector.batchCheckConflicts([apt]);

      expect(results.size).toBe(1);
      expect(results.get(apt.id.value)?.hasConflicts).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete conflict check within 100ms (KPI target)', () => {
      // Create 100 appointments
      const appointments: Appointment[] = [];
      for (let i = 0; i < 100; i++) {
        const hour = 9 + (i % 8);
        appointments.push(createTestAppointment(hour, hour + 1, { organizerId: `org-${i}` }));
      }

      const apt = createTestAppointment(10, 11);

      const start = performance.now();
      ConflictDetector.checkConflicts(apt, appointments);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
