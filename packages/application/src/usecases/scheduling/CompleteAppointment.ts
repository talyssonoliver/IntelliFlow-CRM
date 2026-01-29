import {
  Appointment,
  AppointmentRepository,
  AppointmentId,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError, ValidationError } from '../../errors';

export interface CompleteAppointmentInput {
  appointmentId: string;
  completedBy: string;
  notes?: string;
}

export interface CompleteAppointmentOutput {
  appointment: Appointment;
  completedAt: Date;
}

/**
 * Complete Appointment Use Case
 * Marks an appointment as completed
 */
export class CompleteAppointmentUseCase {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  async execute(
    input: CompleteAppointmentInput
  ): Promise<Result<CompleteAppointmentOutput, DomainError>> {
    try {
      // Validate appointment ID
      const appointmentIdResult = AppointmentId.create(input.appointmentId);
      if (appointmentIdResult.isFailure) {
        return Result.fail(appointmentIdResult.error);
      }
      const appointmentId = appointmentIdResult.value;

      // Find the appointment
      const appointment = await this.appointmentRepository.findById(appointmentId);
      if (!appointment) {
        return Result.fail(new ValidationError(`Appointment not found: ${input.appointmentId}`));
      }

      // Complete the appointment
      const completeResult = appointment.complete(input.completedBy, input.notes);
      if (completeResult.isFailure) {
        return Result.fail(completeResult.error);
      }

      // Save changes
      await this.appointmentRepository.save(appointment);

      return Result.ok({
        appointment,
        completedAt: appointment.completedAt!,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to complete appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
