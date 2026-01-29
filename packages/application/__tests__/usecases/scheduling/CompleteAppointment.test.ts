import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CompleteAppointmentUseCase } from '../../../src/usecases/scheduling/CompleteAppointment';
import { InMemoryAppointmentRepository } from '../../../../adapters/src/repositories/InMemoryAppointmentRepository';
import { Appointment } from '@intelliflow/domain';

describe('CompleteAppointmentUseCase', () => {
  let useCase: CompleteAppointmentUseCase;
  let repository: InMemoryAppointmentRepository;

  beforeEach(() => {
    repository = new InMemoryAppointmentRepository();
    useCase = new CompleteAppointmentUseCase(repository);
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
    it('should complete an appointment', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        completedBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.status).toBe('COMPLETED');
    });

    it('should return completed timestamp', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        completedBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.completedAt).toBeInstanceOf(Date);
    });

    it('should save the completed appointment', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        completedBy: 'user-123',
      };

      await useCase.execute(input);

      const saved = await repository.findById(appointment.id);
      expect(saved?.status).toBe('COMPLETED');
    });

    it('should complete with notes', async () => {
      const appointment = await createAndSaveAppointment();

      const input = {
        appointmentId: appointment.id.value,
        completedBy: 'user-123',
        notes: 'Meeting went well. Follow-up scheduled for next week.',
      };

      const result = await useCase.execute(input);

      expect(result.isSuccess).toBe(true);
      expect(result.value.appointment.notes).toBe(
        'Meeting went well. Follow-up scheduled for next week.'
      );
    });

    it('should fail for non-existent appointment', async () => {
      const input = {
        appointmentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        completedBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('not found');
    });

    it('should fail for invalid appointment ID', async () => {
      const input = {
        appointmentId: 'invalid-id',
        completedBy: 'user-123',
      };

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });

    it('should fail when appointment is already completed', async () => {
      const appointment = await createAndSaveAppointment();

      // Complete once
      const firstComplete = {
        appointmentId: appointment.id.value,
        completedBy: 'user-123',
      };
      await useCase.execute(firstComplete);

      // Try to complete again
      const secondComplete = {
        appointmentId: appointment.id.value,
        completedBy: 'user-456',
      };
      const result = await useCase.execute(secondComplete);

      expect(result.isFailure).toBe(true);
    });

    it('should fail when appointment is cancelled', async () => {
      const appointment = await createAndSaveAppointment();

      // Cancel the appointment first
      appointment.cancel('user-123', 'No longer needed');
      await repository.save(appointment);

      // Try to complete
      const input = {
        appointmentId: appointment.id.value,
        completedBy: 'user-456',
      };
      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
    });
  });
});
