import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CheckConflictsUseCase } from '../../../src/usecases/scheduling/CheckConflicts';
import { InMemoryAppointmentRepository } from '../../../../adapters/src/repositories/InMemoryAppointmentRepository';
import { Appointment } from '@intelliflow/domain';

describe('CheckConflictsUseCase', () => {
  let useCase: CheckConflictsUseCase;
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    useCase = new CheckConflictsUseCase(repository);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    repository.clear();
  });

  describe('checkConflicts', () => {
    it('should return no conflicts when time slot is free', async () => {
      const input = {
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        attendeeIds: ['user-123'],
      };

      const result = await useCase.checkConflicts(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.hasConflicts).toBe(false);
      expect(result.value.conflicts).toHaveLength(0);
    });

    it('should detect conflicts with existing appointments', async () => {
      // Create existing appointment
      const existing = Appointment.create({
        title: 'Existing Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      const input = {
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        attendeeIds: ['user-123'],
      };

      const result = await useCase.checkConflicts(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.hasConflicts).toBe(true);
      expect(result.value.conflicts.length).toBeGreaterThan(0);
    });

    it('should return conflict details', async () => {
      const existing = Appointment.create({
        title: 'Team Standup',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      const input = {
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        attendeeIds: ['user-123'],
      };

      const result = await useCase.checkConflicts(input);

      expect(result.value.conflicts[0].title).toBe('Team Standup');
      expect(result.value.conflicts[0].overlapMinutes).toBeGreaterThan(0);
    });

    it('should check conflicts for multiple attendees', async () => {
      // Create appointments for different users
      const apt1 = Appointment.create({
        title: 'User 1 Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-1',
      }).value;

      const apt2 = Appointment.create({
        title: 'User 2 Meeting',
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-2',
      }).value;

      await repository.save(apt1);
      await repository.save(apt2);

      const input = {
        startTime: new Date(2025, 0, 2, 14, 45, 0),
        endTime: new Date(2025, 0, 2, 15, 45, 0),
        attendeeIds: ['user-1', 'user-2'],
      };

      const result = await useCase.checkConflicts(input);

      expect(result.value.hasConflicts).toBe(true);
      expect(result.value.conflicts.length).toBe(2);
    });

    it('should consider buffer times', async () => {
      const existing = Appointment.create({
        title: 'Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      // Propose appointment that starts right after, but buffer would conflict
      const input = {
        startTime: new Date(2025, 0, 2, 15, 0, 0),
        endTime: new Date(2025, 0, 2, 16, 0, 0),
        attendeeIds: ['user-123'],
        bufferMinutesBefore: 15,
      };

      const result = await useCase.checkConflicts(input);

      // With a 15-minute buffer before, the effective start is 14:45
      // which conflicts with the existing meeting (14:00-15:00)
      expect(result.value.hasConflicts).toBe(true);
    });

    it('should fail for invalid time slot', async () => {
      const input = {
        startTime: new Date(2025, 0, 2, 15, 0, 0),
        endTime: new Date(2025, 0, 2, 14, 0, 0), // End before start
        attendeeIds: ['user-123'],
      };

      const result = await useCase.checkConflicts(input);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('checkAvailability', () => {
    it('should return full availability when no appointments exist', async () => {
      const input = {
        attendeeId: 'user-123',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 17, 0, 0),
      };

      const result = await useCase.checkAvailability(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.totalAvailableMinutes).toBeGreaterThan(0);
    });

    it('should show reduced availability when appointments exist', async () => {
      const existing = Appointment.create({
        title: 'Booked',
        startTime: new Date(2025, 0, 2, 12, 0, 0),
        endTime: new Date(2025, 0, 2, 13, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      const input = {
        attendeeId: 'user-123',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 17, 0, 0),
      };

      const result = await useCase.checkAvailability(input);

      expect(result.isSuccess).toBe(true);
      // 8 hours = 480 minutes, minus 60 for the booked slot
      expect(result.value.totalAvailableMinutes).toBeLessThan(480);
    });

    it('should filter out short slots with minimumSlotMinutes', async () => {
      // Create appointments that leave only short gaps
      const apt1 = Appointment.create({
        title: 'Meeting 1',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 9, 45, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;

      const apt2 = Appointment.create({
        title: 'Meeting 2',
        startTime: new Date(2025, 0, 2, 10, 0, 0),
        endTime: new Date(2025, 0, 2, 11, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;

      await repository.save(apt1);
      await repository.save(apt2);

      const input = {
        attendeeId: 'user-123',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 11, 0, 0),
        minimumSlotMinutes: 30, // Filter out slots shorter than 30 min
      };

      const result = await useCase.checkAvailability(input);

      expect(result.isSuccess).toBe(true);
      // The 15-minute gap (9:45-10:00) should be filtered out
      for (const slot of result.value.availableSlots) {
        expect(slot.durationMinutes).toBeGreaterThanOrEqual(30);
      }
    });
  });

  describe('findNextSlot', () => {
    it('should find next available slot', async () => {
      const input = {
        attendeeId: 'user-123',
        startFrom: new Date(2025, 0, 2, 9, 0, 0),
        durationMinutes: 60,
      };

      const result = await useCase.findNextSlot(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.slot).not.toBeNull();
      expect(result.value.slot!.durationMinutes).toBeGreaterThanOrEqual(60);
    });

    it('should find slot after existing appointments', async () => {
      const existing = Appointment.create({
        title: 'Booked',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 12, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      const input = {
        attendeeId: 'user-123',
        startFrom: new Date(2025, 0, 2, 9, 0, 0),
        durationMinutes: 60,
      };

      const result = await useCase.findNextSlot(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.slot).not.toBeNull();
      // Should find slot starting at or after 12:00
      expect(result.value.slot!.startTime.getTime()).toBeGreaterThanOrEqual(
        new Date(2025, 0, 2, 12, 0, 0).getTime()
      );
    });

    it('should respect buffer requirements', async () => {
      const existing = Appointment.create({
        title: 'Booked',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 10, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      }).value;
      await repository.save(existing);

      const input = {
        attendeeId: 'user-123',
        startFrom: new Date(2025, 0, 2, 9, 0, 0),
        durationMinutes: 60,
        bufferMinutesBefore: 15,
        bufferMinutesAfter: 15,
      };

      const result = await useCase.findNextSlot(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.slot).not.toBeNull();
    });

    it('should respect max days ahead limit', async () => {
      const input = {
        attendeeId: 'user-123',
        startFrom: new Date(2025, 0, 2, 9, 0, 0),
        durationMinutes: 60,
        maxDaysAhead: 7,
      };

      const result = await useCase.findNextSlot(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.searchedUntil.getTime()).toBeLessThanOrEqual(
        new Date(2025, 0, 9, 9, 0, 0).getTime()
      );
    });
  });
});
