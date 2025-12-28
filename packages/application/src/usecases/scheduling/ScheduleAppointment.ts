import {
  Appointment,
  CreateAppointmentProps,
  AppointmentRepository,
  TimeSlot,
  Buffer,
  Recurrence,
  ConflictDetector,
  AppointmentType,
  CaseId,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError, ValidationError } from '../../errors';

export interface ScheduleAppointmentInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  appointmentType: AppointmentType;
  location?: string;
  organizerId: string;
  attendeeIds?: string[];
  linkedCaseIds?: string[];
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  recurrence?: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval?: number;
    daysOfWeek?: (
      | 'SUNDAY'
      | 'MONDAY'
      | 'TUESDAY'
      | 'WEDNESDAY'
      | 'THURSDAY'
      | 'FRIDAY'
      | 'SATURDAY'
    )[];
    dayOfMonth?: number;
    monthOfYear?: number;
    endDate?: Date;
    occurrenceCount?: number;
  };
  reminderMinutes?: number;
  forceOverrideConflicts?: boolean;
}

export interface ScheduleAppointmentOutput {
  appointment: Appointment;
  conflictWarnings?: {
    appointmentId: string;
    overlapMinutes: number;
  }[];
}

/**
 * Schedule Appointment Use Case
 * Creates a new appointment with optional conflict checking
 */
export class ScheduleAppointmentUseCase {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  async execute(
    input: ScheduleAppointmentInput
  ): Promise<Result<ScheduleAppointmentOutput, DomainError>> {
    try {
      // Create buffer if provided
      let buffer = Buffer.none();
      if (input.bufferMinutesBefore !== undefined || input.bufferMinutesAfter !== undefined) {
        const bufferResult = Buffer.create(
          input.bufferMinutesBefore ?? 0,
          input.bufferMinutesAfter ?? 0
        );
        if (bufferResult.isFailure) {
          return Result.fail(bufferResult.error);
        }
        buffer = bufferResult.value;
      }

      // Create recurrence if provided
      let recurrence: Recurrence | undefined;
      if (input.recurrence) {
        const recurrenceResult = this.createRecurrence(input.recurrence);
        if (recurrenceResult.isFailure) {
          return Result.fail(recurrenceResult.error);
        }
        recurrence = recurrenceResult.value;
      }

      // Convert case IDs
      const linkedCaseIds: CaseId[] = [];
      if (input.linkedCaseIds) {
        for (const caseIdStr of input.linkedCaseIds) {
          const caseIdResult = CaseId.create(caseIdStr);
          if (caseIdResult.isFailure) {
            return Result.fail(caseIdResult.error);
          }
          linkedCaseIds.push(caseIdResult.value);
        }
      }

      // Create the appointment
      const createProps: CreateAppointmentProps = {
        title: input.title,
        description: input.description,
        startTime: input.startTime,
        endTime: input.endTime,
        appointmentType: input.appointmentType,
        location: input.location,
        organizerId: input.organizerId,
        attendeeIds: input.attendeeIds,
        linkedCaseIds,
        buffer,
        recurrence,
        reminderMinutes: input.reminderMinutes,
      };

      const appointmentResult = Appointment.create(createProps);
      if (appointmentResult.isFailure) {
        return Result.fail(appointmentResult.error);
      }

      const appointment = appointmentResult.value;

      // Check for conflicts
      const allAttendees = [input.organizerId, ...(input.attendeeIds ?? [])];
      const timeSlotResult = TimeSlot.create(input.startTime, input.endTime);
      if (timeSlotResult.isFailure) {
        return Result.fail(timeSlotResult.error);
      }

      const existingAppointments = await this.appointmentRepository.findForConflictCheck(
        allAttendees,
        {
          startTime: buffer.adjustStartTime(input.startTime),
          endTime: buffer.adjustEndTime(input.endTime),
        }
      );

      const conflictResult = ConflictDetector.checkConflicts(appointment, existingAppointments);

      // If conflicts exist and not forcing override
      if (conflictResult.hasConflicts && !input.forceOverrideConflicts) {
        const conflictWarnings = conflictResult.conflicts.map((c) => ({
          appointmentId: c.conflictingAppointmentId.value,
          overlapMinutes: c.overlapMinutes,
        }));

        // Return appointment but with conflict warnings (user must confirm)
        return Result.ok({
          appointment,
          conflictWarnings,
        });
      }

      // Save the appointment
      await this.appointmentRepository.save(appointment);

      return Result.ok({
        appointment,
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
          `Failed to schedule appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  private createRecurrence(
    recurrenceInput: NonNullable<ScheduleAppointmentInput['recurrence']>
  ): Result<Recurrence, DomainError> {
    const options = {
      endDate: recurrenceInput.endDate,
      occurrenceCount: recurrenceInput.occurrenceCount,
    };

    switch (recurrenceInput.frequency) {
      case 'DAILY':
        return Recurrence.createDaily(recurrenceInput.interval, options);

      case 'WEEKLY':
        if (!recurrenceInput.daysOfWeek || recurrenceInput.daysOfWeek.length === 0) {
          return Result.fail(new ValidationError('Days of week required for weekly recurrence'));
        }
        return Recurrence.createWeekly(
          recurrenceInput.daysOfWeek,
          recurrenceInput.interval,
          options
        );

      case 'MONTHLY':
        if (recurrenceInput.dayOfMonth === undefined) {
          return Result.fail(new ValidationError('Day of month required for monthly recurrence'));
        }
        return Recurrence.createMonthly(
          recurrenceInput.dayOfMonth,
          recurrenceInput.interval,
          options
        );

      case 'YEARLY':
        if (recurrenceInput.monthOfYear === undefined || recurrenceInput.dayOfMonth === undefined) {
          return Result.fail(new ValidationError('Month and day required for yearly recurrence'));
        }
        return Recurrence.createYearly(
          recurrenceInput.monthOfYear,
          recurrenceInput.dayOfMonth,
          recurrenceInput.interval,
          options
        );

      default:
        return Result.fail(
          new ValidationError(`Unknown recurrence frequency: ${recurrenceInput.frequency}`)
        );
    }
  }
}
