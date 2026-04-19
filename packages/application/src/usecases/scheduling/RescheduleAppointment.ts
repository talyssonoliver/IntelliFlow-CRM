import {
  Appointment,
  AppointmentRepository,
  AppointmentId,
  TimeSlot,
  Buffer,
  ConflictDetector,
  ConflictDetectionError,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError, ValidationError } from '../../errors';

export interface RescheduleAppointmentInput {
  appointmentId: string;
  tenantId: string;
  newStartTime: Date;
  newEndTime: Date;
  rescheduledBy: string;
  reason?: string;
  updateBuffer?: {
    bufferMinutesBefore: number;
    bufferMinutesAfter: number;
  };
  forceOverrideConflicts?: boolean;
}

export interface RescheduleAppointmentOutput {
  appointment: Appointment;
  previousTimeSlot: {
    startTime: Date;
    endTime: Date;
  };
  conflictWarnings?: {
    appointmentId: string;
    overlapMinutes: number;
  }[];
}

/**
 * Reschedule Appointment Use Case
 * Changes the time of an existing appointment
 */
export class RescheduleAppointmentUseCase {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  private applyBufferUpdate(
    appointment: Appointment,
    updateBuffer: { bufferMinutesBefore: number; bufferMinutesAfter: number }
  ): DomainError | null {
    const bufferResult = Buffer.create(
      updateBuffer.bufferMinutesBefore,
      updateBuffer.bufferMinutesAfter
    );
    if (bufferResult.isFailure) return bufferResult.error;
    const updateBufferResult = appointment.updateBuffer(bufferResult.value);
    return updateBufferResult.isFailure ? updateBufferResult.error : null;
  }

  private mapConflictWarnings(
    conflicts: Array<{ conflictingAppointmentId: { value: string }; overlapMinutes: number }>
  ): Array<{ appointmentId: string; overlapMinutes: number }> {
    return conflicts.map((c) => ({
      appointmentId: c.conflictingAppointmentId.value,
      overlapMinutes: c.overlapMinutes,
    }));
  }

  private async fetchConflicts(
    appointment: Appointment,
    appointmentId: ReturnType<typeof AppointmentId.create> extends Result<infer V, unknown>
      ? V
      : never,
    input: RescheduleAppointmentInput
  ): Promise<Result<Appointment[], DomainError>> {
    try {
      const allAttendees = [appointment.organizerId, ...appointment.attendeeIds];
      const appointments = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findForConflictCheck(
          allAttendees,
          {
            startTime: appointment.buffer.adjustStartTime(input.newStartTime),
            endTime: appointment.buffer.adjustEndTime(input.newEndTime),
          },
          appointmentId
        );
      return Result.ok(appointments);
    } catch (error) {
      return Result.fail(
        new ConflictDetectionError(
          `Failed to fetch appointments for conflict check: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  async execute(
    input: RescheduleAppointmentInput
  ): Promise<Result<RescheduleAppointmentOutput, DomainError>> {
    try {
      // Validate appointment ID
      const appointmentIdResult = AppointmentId.create(input.appointmentId);
      if (appointmentIdResult.isFailure) {
        return Result.fail(appointmentIdResult.error);
      }
      const appointmentId = appointmentIdResult.value;

      // Find the appointment
      const appointment = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findById(appointmentId);
      if (!appointment) {
        return Result.fail(new ValidationError(`Appointment not found: ${input.appointmentId}`));
      }

      // Store previous time slot
      const previousTimeSlot = {
        startTime: appointment.startTime,
        endTime: appointment.endTime,
      };

      // Check for conflicts at new time BEFORE mutating the entity.
      // Buffer update is intentionally deferred until after the conflict gate so
      // that a blocked reschedule (conflict without forceOverride) never leaves the
      // in-memory entity in a dirty/mutated state.
      const newTimeSlotResult = TimeSlot.create(input.newStartTime, input.newEndTime);
      if (newTimeSlotResult.isFailure) {
        return Result.fail(newTimeSlotResult.error);
      }

      const conflictsResult = await this.fetchConflicts(appointment, appointmentId, input);
      if (conflictsResult.isFailure) return Result.fail(conflictsResult.error);
      const existingAppointments = conflictsResult.value;

      const conflictResult = ConflictDetector.checkTimeSlotConflicts(
        newTimeSlotResult.value,
        appointment.buffer,
        existingAppointments
      );

      // If conflicts exist and not forcing override
      const conflictWarnings = conflictResult.hasConflicts
        ? this.mapConflictWarnings(conflictResult.conflicts)
        : undefined;

      if (conflictResult.hasConflicts && !input.forceOverrideConflicts) {
        return Result.ok({ appointment, previousTimeSlot, conflictWarnings });
      }

      // Apply buffer update AFTER the conflict gate — entity is only mutated
      // when we know the reschedule will proceed.
      if (input.updateBuffer) {
        const bufferError = this.applyBufferUpdate(appointment, input.updateBuffer);
        if (bufferError) return Result.fail(bufferError);
      }

      // Perform the reschedule
      const rescheduleResult = appointment.reschedule(
        input.newStartTime,
        input.newEndTime,
        input.rescheduledBy,
        input.reason
      );

      if (rescheduleResult.isFailure) {
        return Result.fail(rescheduleResult.error);
      }

      // Save changes
      await this.appointmentRepository.save(appointment);

      return Result.ok({ appointment, previousTimeSlot, conflictWarnings });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to reschedule appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
