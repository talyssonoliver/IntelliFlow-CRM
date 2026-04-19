import {
  Appointment,
  AppointmentRepository,
  AppointmentId,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError, ValidationError } from '../../errors';

export interface CancelAppointmentInput {
  appointmentId: string;
  tenantId: string;
  cancelledBy: string;
  reason?: string;
}

export interface CancelAppointmentOutput {
  appointment: Appointment;
  cancelledAt: Date;
}

/**
 * Cancel Appointment Use Case
 * Cancels an existing appointment
 */
export class CancelAppointmentUseCase {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  async execute(
    input: CancelAppointmentInput
  ): Promise<Result<CancelAppointmentOutput, DomainError>> {
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

      // Cancel the appointment
      const cancelResult = appointment.cancel(input.cancelledBy, input.reason);
      if (cancelResult.isFailure) {
        return Result.fail(cancelResult.error);
      }

      // Save changes via root repo — entity already carries tenantId
      await this.appointmentRepository.save(appointment);

      return Result.ok({
        appointment,
        cancelledAt: appointment.cancelledAt!,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to cancel appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
