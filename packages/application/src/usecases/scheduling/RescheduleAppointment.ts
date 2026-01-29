import {
  Appointment,
  AppointmentRepository,
  AppointmentId,
  TimeSlot,
  Buffer,
  ConflictDetector,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError, ValidationError } from '../../errors';

export interface RescheduleAppointmentInput {
  appointmentId: string;
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
      const appointment = await this.appointmentRepository.findById(appointmentId);
      if (!appointment) {
        return Result.fail(new ValidationError(`Appointment not found: ${input.appointmentId}`));
      }

      // Store previous time slot
      const previousTimeSlot = {
        startTime: appointment.startTime,
        endTime: appointment.endTime,
      };

      // Update buffer if provided
      if (input.updateBuffer) {
        const bufferResult = Buffer.create(
          input.updateBuffer.bufferMinutesBefore,
          input.updateBuffer.bufferMinutesAfter
        );
        if (bufferResult.isFailure) {
          return Result.fail(bufferResult.error);
        }
        const updateBufferResult = appointment.updateBuffer(bufferResult.value);
        if (updateBufferResult.isFailure) {
          return Result.fail(updateBufferResult.error);
        }
      }

      // Check for conflicts at new time
      const allAttendees = [appointment.organizerId, ...appointment.attendeeIds];
      const newTimeSlotResult = TimeSlot.create(input.newStartTime, input.newEndTime);
      if (newTimeSlotResult.isFailure) {
        return Result.fail(newTimeSlotResult.error);
      }

      const existingAppointments = await this.appointmentRepository.findForConflictCheck(
        allAttendees,
        {
          startTime: appointment.buffer.adjustStartTime(input.newStartTime),
          endTime: appointment.buffer.adjustEndTime(input.newEndTime),
        },
        appointmentId // Exclude self
      );

      const conflictResult = ConflictDetector.checkTimeSlotConflicts(
        newTimeSlotResult.value,
        appointment.buffer,
        existingAppointments
      );

      // If conflicts exist and not forcing override
      if (conflictResult.hasConflicts && !input.forceOverrideConflicts) {
        const conflictWarnings = conflictResult.conflicts.map((c) => ({
          appointmentId: c.conflictingAppointmentId.value,
          overlapMinutes: c.overlapMinutes,
        }));

        return Result.ok({
          appointment,
          previousTimeSlot,
          conflictWarnings,
        });
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

      return Result.ok({
        appointment,
        previousTimeSlot,
        conflictWarnings: conflictResult.hasConflicts
          ? conflictResult.conflicts.map((c) => ({
              appointmentId: c.conflictingAppointmentId.value,
              overlapMinutes: c.overlapMinutes,
            }))
          : undefined,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to reschedule appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
