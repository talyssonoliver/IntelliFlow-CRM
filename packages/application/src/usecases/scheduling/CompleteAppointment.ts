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
  tenantId: string;
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

      // Find the appointment (tenant-scoped read)
      const scoped = this.appointmentRepository.forTenant(input.tenantId);
      const appointment = await scoped.findById(appointmentId);
      if (!appointment) {
        return Result.fail(new ValidationError(`Appointment not found: ${input.appointmentId}`));
      }

      // Complete the appointment
      const completeResult = appointment.complete(input.completedBy, input.notes);
      if (completeResult.isFailure) {
        return Result.fail(completeResult.error);
      }

      // Save changes via root repo — entity already carries tenantId
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
