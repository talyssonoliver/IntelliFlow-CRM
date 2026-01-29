import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RescheduleAppointmentUseCase } from '../../../src/usecases/scheduling/RescheduleAppointment';
import { InMemoryAppointmentRepository } from '../../../../adapters/src/repositories/InMemoryAppointmentRepository';
import { Appointment } from '@intelliflow/domain';

describe('RescheduleAppointmentUseCase', () => {
  let useCase: RescheduleAppointmentUseCase;
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    useCase = new RescheduleAppointmentUseCase(repository);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 1, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    repository.clear();
  });

  async function createAndSaveAppointment(overrides: Partial<{
    title: string;
    startTime: Date;
    endTime: Date;
  }> = {}) {
    const result = Appointment.create({
      title: overrides.title ?? 'Test Meeting',
      startTime: overrides.startTime ?? new Date(2025, 0, 2, 14, 0, 0),
      endTime: overrides.endTime ?? new Date(2025, 0, 2, 15, 0, 0),
      appointmentType: 'INTERNAL_MEETING',
      organizerId: 'user-123',
    });
    await repository.save(result.value);
    return result.value;
  }

  describe('execute', () => {
    it('should reschedule an appointment to a new time', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.startTime).toEqual(new Date(2025, 0, 3, 10, 0, 0));
      expect(result.value.appointment.endTime).toEqual(new Date(2025, 0, 3, 11, 0, 0));
    });

    it('should return previous time slot', async () => {
      const appointment = await createAndSaveAppointment({
        startTime: new Date(2025, 0, 2, 14, 0, 0),
        endTime: new Date(2025, 0, 2, 15, 0, 0),
      });

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.value.previousTimeSlot.startTime).toEqual(new Date(2025, 0, 2, 14, 0, 0));
      expect(result.value.previousTimeSlot.endTime).toEqual(new Date(2025, 0, 2, 15, 0, 0));
    });

    it('should save the rescheduled appointment', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
      };

      await useCase.execute(input);

      const saved = await repository.findById(appointment.id);
      expect(saved?.startTime).toEqual(new Date(2025, 0, 3, 10, 0, 0));
    });

    it('should detect conflicts at new time', async () => {
      const appointment = await createAndSaveAppointment();

      // Create another appointment at the target time
      await createAndSaveAppointment({
        title: 'Conflicting Meeting',
        startTime: new Date(2025, 0, 3, 10, 0, 0),
        endTime: new Date(2025, 0, 3, 11, 0, 0),
      });

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 30, 0),
        newEndTime: new Date(2025, 0, 3, 11, 30, 0),
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.conflictWarnings).toBeDefined();
      expect(result.value.conflictWarnings!.length).toBeGreaterThan(0);
    });

    it('should not reschedule when conflicts exist and force is false', async () => {
      const appointment = await createAndSaveAppointment();
      const originalStartTime = appointment.startTime;

      // Create conflicting appointment
      await createAndSaveAppointment({
        title: 'Conflict',
        startTime: new Date(2025, 0, 3, 10, 0, 0),
        endTime: new Date(2025, 0, 3, 11, 0, 0),
      });

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 30, 0),
        newEndTime: new Date(2025, 0, 3, 11, 30, 0),
        rescheduledBy: 'user-123',
        forceOverrideConflicts: false,
      };

      await useCase.execute(input);

      // Should not have changed the time
      const saved = await repository.findById(appointment.id);
      expect(saved?.startTime).toEqual(originalStartTime);
    });

    it('should reschedule when force override is true', async () => {
      const appointment = await createAndSaveAppointment();

      // Create conflicting appointment
      await createAndSaveAppointment({
        title: 'Conflict',
        startTime: new Date(2025, 0, 3, 10, 0, 0),
        endTime: new Date(2025, 0, 3, 11, 0, 0),
      });

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 30, 0),
        newEndTime: new Date(2025, 0, 3, 11, 30, 0),
        rescheduledBy: 'user-123',
        forceOverrideConflicts: true,
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.startTime).toEqual(new Date(2025, 0, 3, 10, 30, 0));
    });

    it('should update buffer if provided', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
        updateBuffer: {
          bufferMinutesBefore: 15,
          bufferMinutesAfter: 10,
        },
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.buffer.beforeMinutes).toBe(15);
      expect(result.value.appointment.buffer.afterMinutes).toBe(10);
    });

    it('should fail for non-existent appointment', async () => {
      const input = {
        appointmentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail for invalid appointment ID', async () => {
      const input = {
        appointmentId: 'invalid-id',
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should fail for invalid new time slot', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 11, 0, 0),
        newEndTime: new Date(2025, 0, 3, 10, 0, 0), // End before start
        rescheduledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should include reason in reschedule', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        newStartTime: new Date(2025, 0, 3, 10, 0, 0),
        newEndTime: new Date(2025, 0, 3, 11, 0, 0),
        rescheduledBy: 'user-123',
        reason: 'Client requested different time',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      // The domain should handle the reason in the event
    });
  });
});
