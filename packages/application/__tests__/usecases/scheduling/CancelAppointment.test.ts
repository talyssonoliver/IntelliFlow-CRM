import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CancelAppointmentUseCase } from '../../../src/usecases/scheduling/CancelAppointment';
import { InMemoryAppointmentRepository } from '../../../../adapters/src/repositories/InMemoryAppointmentRepository';
import { Appointment } from '@intelliflow/domain';

describe('CancelAppointmentUseCase', () => {
  let useCase: CancelAppointmentUseCase;
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    useCase = new CancelAppointmentUseCase(repository);
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
    it('should cancel an appointment', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.status).toBe('CANCELLED');
    });

    it('should return cancelled timestamp', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.cancelledAt).toBeInstanceOf(Date);
    });

    it('should save the cancelled appointment', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-123',
      };

      await useCase.execute(input);

      const saved = await repository.findById(appointment.id);
      expect(saved?.status).toBe('CANCELLED');
    });

    it('should cancel with reason', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-123',
        reason: 'Client requested rescheduling',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.cancellationReason).toBe('Client requested rescheduling');
    });

    it('should fail for non-existent appointment', async () => {
      const input = {
        appointmentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        cancelledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail for invalid appointment ID', async () => {
      const input = {
        appointmentId: 'invalid-id',
        cancelledBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should fail when appointment is already cancelled', async () => {
      const appointment = await createAndSaveAppointment();

      // Cancel once
      const firstCancel = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-123',
      };
      await useCase.execute(firstCancel);

      // Try to cancel again
      const secondCancel = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-456',
      };
      const result = await useCase.execute(secondCancel);

      expect(result.isFailure).toBe(true);
    });

    it('should fail when appointment is already completed', async () => {
      const appointment = await createAndSaveAppointment();

      // Complete the appointment first
      appointment.complete('user-123');
      await repository.save(appointment);

      // Try to cancel
      const input = {
        appointmentId: appointment.id.value,
        cancelledBy: 'user-456',
      };
      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });
  });
});
