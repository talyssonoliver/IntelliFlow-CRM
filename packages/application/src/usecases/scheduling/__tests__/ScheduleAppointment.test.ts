import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScheduleAppointmentUseCase } from '../../../src/usecases/scheduling/ScheduleAppointment';
import { InMemoryAppointmentRepository } from '../../../../adapters/src/repositories/InMemoryAppointmentRepository';
import { Appointment, TimeSlot, Buffer } from '@intelliflow/domain';

describe('ScheduleAppointmentUseCase', () => {
  let useCase: ScheduleAppointmentUseCase;
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    useCase = new ScheduleAppointmentUseCase(repository);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    repository.clear();
  });

  describe('execute', () => {
    it('should schedule a basic appointment', async () => {
      const input = {
        title: 'Client Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'CLIENT_MEETING' as const,
        organizerId: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.title).toBe('Client Meeting');
      expect(result.value.appointment.organizerId).toBe('user-123');
      expect(result.value.appointment.status).toBe('SCHEDULED');
    });

    it('should save the appointment to repository', async () => {
      const input = {
        title: 'Team Sync',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 14, 30, 0),
        appointmentType: 'INTERNAL_MEETING' as const,
        organizerId: 'user-123',
      };

      await useCase.execute(input);

      const saved = repository.getAll();
      expect(saved).toHaveLength(1);
      expect(saved[0].title).toBe('Team Sync');
    });

    it('should schedule with description and location', async () => {
      const input = {
        title: 'Consultation',
        description: 'Initial consultation with new client',
        location: 'Conference Room A',
        startTime: new Date(2025, 0, 2, 10, 0, 0),
        endTime: new Date(2025, 0, 2, 11, 0, 0),
        appointmentType: 'CONSULTATION' as const,
        organizerId: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.description).toBe('Initial consultation with new client');
      expect(result.value.appointment.location).toBe('Conference Room A');
    });

    it('should schedule with attendees', async () => {
      const input = {
        title: 'Project Review',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING' as const,
        organizerId: 'user-123',
        attendeeIds: ['user-456', 'user-789'],
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.attendeeIds).toContain('user-456');
      expect(result.value.appointment.attendeeIds).toContain('user-789');
    });

    it('should schedule with buffer times', async () => {
      const input = {
        title: 'Client Call',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'PHONE_CALL' as const,
        organizerId: 'user-123',
        bufferMinutesBefore: 15,
        bufferMinutesAfter: 10,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.buffer.beforeMinutes).toBe(15);
      expect(result.value.appointment.buffer.afterMinutes).toBe(10);
    });

    it('should schedule with reminder', async () => {
      const input = {
        title: 'Court Hearing',
        startTime: new Date(2025, 0, 2, 9, 0, 0),
        endTime: new Date(2025, 0, 2, 12, 0, 0),
        appointmentType: 'COURT_HEARING' as const,
        organizerId: 'user-123',
        reminderMinutes: 60,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.reminderMinutes).toBe(60);
    });

    it('should detect conflicts with existing appointments', async () => {
      // Create an existing appointment
      const existingResult = Appointment.create({
        title: 'Existing Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      });
      await repository.save(existingResult.value);

      // Try to schedule overlapping appointment
      const input = {
        title: 'New Meeting',
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        appointmentType: 'CLIENT_MEETING' as const,
        organizerId: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.conflictWarnings).toBeDefined();
      expect(result.value.conflictWarnings!.length).toBeGreaterThan(0);
    });

    it('should not save when conflicts exist and force override is false', async () => {
      // Create an existing appointment
      const existingResult = Appointment.create({
        title: 'Existing Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      });
      await repository.save(existingResult.value);

      const initialCount = repository.count();

      // Try to schedule overlapping appointment without force
      const input = {
        title: 'Conflicting Meeting',
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        appointmentType: 'CLIENT_MEETING' as const,
        organizerId: 'user-123',
        forceOverrideConflicts: false,
      };

      await useCase.execute(input);

      // Should not have added a new appointment
      expect(repository.count()).toBe(initialCount);
    });

    it('should save when force override conflicts is true', async () => {
      // Create an existing appointment
      const existingResult = Appointment.create({
        title: 'Existing Meeting',
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
      });
      await repository.save(existingResult.value);

      const initialCount = repository.count();

      // Force schedule overlapping appointment
      const input = {
        title: 'Forced Meeting',
        startTime: new Date(2025, 0, 2, 14, 30, 0),
        endTime: new Date(2025, 0, 2, 15, 30, 0),
        appointmentType: 'CLIENT_MEETING' as const,
        organizerId: 'user-123',
        forceOverrideConflicts: true,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(repository.count()).toBe(initialCount + 1);
    });

    it('should fail for invalid time slot (end before start)', async () => {
      const input = {
        title: 'Invalid Meeting',
        startTime: new Date(2025, 0, 2, 15, 0, 0),
        endTime: new Date(2025, 0, 2, 14, 0, 0), // End before start
        appointmentType: 'CLIENT_MEETING' as const,
        organizerId: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    describe('recurrence', () => {
      it('should schedule daily recurring appointment', async () => {
        const input = {
          title: 'Daily Standup',
          startTime: new Date(2025, 0, 2, 9, 0, 0),
          endTime: new Date(2025, 0, 2, 9, 15, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'DAILY' as const,
            interval: 1,
            occurrenceCount: 5,
          },
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.appointment.isRecurring).toBe(true);
      });

      it('should schedule weekly recurring appointment', async () => {
        const input = {
          title: 'Weekly Review',
          startTime: new Date(2025, 0, 6, 14, 0, 0), // Monday
          endTime: new Date(2025, 0, 6, 15, 0, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'WEEKLY' as const,
            interval: 1,
            daysOfWeek: ['MONDAY' as const],
            endDate: new Date(2025, 2, 1),
          },
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.appointment.isRecurring).toBe(true);
      });

      it('should fail for weekly recurrence without days of week', async () => {
        const input = {
          title: 'Invalid Weekly',
          startTime: new Date(2025, 0, 2, 14, 0, 0),
          endTime: new Date(2025, 0, 2, 15, 0, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'WEEKLY' as const,
            interval: 1,
            // Missing daysOfWeek
          },
        };

        const result = await useCase.execute(input);

        expect(result.isFailure).toBe(true);
        expect(result.error.message).toContain('Days of week required');
      });

      it('should schedule monthly recurring appointment', async () => {
        const input = {
          title: 'Monthly Report',
          startTime: new Date(2025, 0, 15, 10, 0, 0),
          endTime: new Date(2025, 0, 15, 11, 0, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'MONTHLY' as const,
            interval: 1,
            dayOfMonth: 15,
            occurrenceCount: 12,
          },
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.appointment.isRecurring).toBe(true);
      });

      it('should fail for monthly recurrence without day of month', async () => {
        const input = {
          title: 'Invalid Monthly',
          startTime: new Date(2025, 0, 2, 14, 0, 0),
          endTime: new Date(2025, 0, 2, 15, 0, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'MONTHLY' as const,
            interval: 1,
            // Missing dayOfMonth
          },
        };

        const result = await useCase.execute(input);

        expect(result.isFailure).toBe(true);
        expect(result.error.message).toContain('Day of month required');
      });

      it('should schedule yearly recurring appointment', async () => {
        const input = {
          title: 'Annual Review',
          startTime: new Date(2025, 0, 15, 10, 0, 0),
          endTime: new Date(2025, 0, 15, 12, 0, 0),
          appointmentType: 'INTERNAL_MEETING' as const,
          organizerId: 'user-123',
          recurrence: {
            frequency: 'YEARLY' as const,
            interval: 1,
            monthOfYear: 1,
            dayOfMonth: 15,
            occurrenceCount: 5,
          },
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.appointment.isRecurring).toBe(true);
      });
    });

    describe('linked cases', () => {
      it('should schedule with linked case IDs', async () => {
        // Need valid UUIDs for case IDs
        const input = {
          title: 'Case Discussion',
          startTime: new Date(2025, 0, 2, 14, 0, 0),
          endTime: new Date(2025, 0, 2, 15, 0, 0),
          appointmentType: 'CLIENT_MEETING' as const,
          organizerId: 'user-123',
          linkedCaseIds: [
            '123e4567-e89b-12d3-a456-426614174000',
            '550e8400-e29b-41d4-a716-446655440000',
          ],
        };

        const result = await useCase.execute(input);

        expect(result.isSuccess).toBe(true);
        expect(result.value.appointment.linkedCaseIds).toHaveLength(2);
      });

      it('should fail for invalid case ID format', async () => {
        const input = {
          title: 'Case Discussion',
          startTime: new Date(2025, 0, 2, 14, 0, 0),
          endTime: new Date(2025, 0, 2, 15, 0, 0),
          appointmentType: 'CLIENT_MEETING' as const,
          organizerId: 'user-123',
          linkedCaseIds: ['invalid-case-id'],
        };

        const result = await useCase.execute(input);

        expect(result.isFailure).toBe(true);
      });
    });
  });
});
