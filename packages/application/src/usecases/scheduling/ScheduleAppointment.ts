import {
  Appointment,
  CreateAppointmentProps,
  AppointmentRepository,
  TimeSlot,
  Buffer,
  Recurrence,
  ConflictDetector,
  ConflictDetectionError,
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
  tenantId: string;
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
      const bufferResult = this.createBuffer(input);
      if (bufferResult.isFailure) return Result.fail(bufferResult.error);
      const buffer = bufferResult.value;

      const recurrenceResult = this.resolveRecurrence(input);
      if (recurrenceResult.isFailure) return Result.fail(recurrenceResult.error);

      const caseIdsResult = this.parseLinkedCaseIds(input.linkedCaseIds);
      if (caseIdsResult.isFailure) return Result.fail(caseIdsResult.error);

      const appointmentResult = Appointment.create({
        title: input.title,
        description: input.description,
        startTime: input.startTime,
        endTime: input.endTime,
        appointmentType: input.appointmentType,
        location: input.location,
        organizerId: input.organizerId,
        tenantId: input.tenantId,
        attendeeIds: input.attendeeIds,
        linkedCaseIds: caseIdsResult.value,
        buffer,
        recurrence: recurrenceResult.value,
        reminderMinutes: input.reminderMinutes,
      });
      if (appointmentResult.isFailure) return Result.fail(appointmentResult.error);

      const appointment = appointmentResult.value;

      const timeSlotResult = TimeSlot.create(input.startTime, input.endTime);
      if (timeSlotResult.isFailure) return Result.fail(timeSlotResult.error);

      const existingAppointments = await this.fetchConflictCandidates(input, buffer);
      const conflictResult = ConflictDetector.checkConflicts(appointment, existingAppointments);
      const conflictWarnings = this.mapConflictWarnings(conflictResult);

      if (conflictResult.hasConflicts && !input.forceOverrideConflicts) {
        return Result.ok({ appointment, conflictWarnings });
      }

      await this.appointmentRepository.save(appointment);
      return Result.ok({ appointment, conflictWarnings });
    } catch (error) {
      if (error instanceof ConflictDetectionError) return Result.fail(error);
      return Result.fail(
        new PersistenceError(
          `Failed to schedule appointment: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  private createBuffer(input: ScheduleAppointmentInput): Result<Buffer, DomainError> {
    if (input.bufferMinutesBefore === undefined && input.bufferMinutesAfter === undefined) {
      return Result.ok(Buffer.none());
    }
    return Buffer.create(input.bufferMinutesBefore ?? 0, input.bufferMinutesAfter ?? 0);
  }

  private resolveRecurrence(
    input: ScheduleAppointmentInput
  ): Result<Recurrence | undefined, DomainError> {
    if (!input.recurrence) return Result.ok(undefined);
    return this.createRecurrence(input.recurrence);
  }

  private parseLinkedCaseIds(caseIdStrings?: string[]): Result<CaseId[], DomainError> {
    if (!caseIdStrings) return Result.ok([]);
    const ids: CaseId[] = [];
    for (const str of caseIdStrings) {
      const result = CaseId.create(str);
      if (result.isFailure) return Result.fail(result.error);
      ids.push(result.value);
    }
    return Result.ok(ids);
  }

  private async fetchConflictCandidates(
    input: ScheduleAppointmentInput,
    buffer: Buffer
  ): Promise<Appointment[]> {
    const allAttendees = [input.organizerId, ...(input.attendeeIds ?? [])];
    try {
      return await this.appointmentRepository.findForConflictCheck(allAttendees, {
        startTime: buffer.adjustStartTime(input.startTime),
        endTime: buffer.adjustEndTime(input.endTime),
      });
    } catch (error) {
      throw new ConflictDetectionError(
        `Failed to fetch appointments for conflict check: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private mapConflictWarnings(conflictResult: ReturnType<typeof ConflictDetector.checkConflicts>) {
    if (!conflictResult.hasConflicts) return undefined;
    return conflictResult.conflicts.map((c) => ({
      appointmentId: c.conflictingAppointmentId.value,
      overlapMinutes: c.overlapMinutes,
    }));
  }

  private createWeeklyRecurrence(
    recurrenceInput: NonNullable<ScheduleAppointmentInput['recurrence']>,
    options: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, DomainError> {
    if (!recurrenceInput.daysOfWeek || recurrenceInput.daysOfWeek.length === 0) {
      return Result.fail(new ValidationError('Days of week required for weekly recurrence'));
    }
    return Recurrence.createWeekly(recurrenceInput.daysOfWeek, recurrenceInput.interval, options);
  }

  private createMonthlyRecurrence(
    recurrenceInput: NonNullable<ScheduleAppointmentInput['recurrence']>,
    options: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, DomainError> {
    if (recurrenceInput.dayOfMonth === undefined) {
      return Result.fail(new ValidationError('Day of month required for monthly recurrence'));
    }
    return Recurrence.createMonthly(recurrenceInput.dayOfMonth, recurrenceInput.interval, options);
  }

  private createYearlyRecurrence(
    recurrenceInput: NonNullable<ScheduleAppointmentInput['recurrence']>,
    options: { endDate?: Date; occurrenceCount?: number }
  ): Result<Recurrence, DomainError> {
    if (recurrenceInput.monthOfYear === undefined || recurrenceInput.dayOfMonth === undefined) {
      return Result.fail(new ValidationError('Month and day required for yearly recurrence'));
    }
    return Recurrence.createYearly(
      recurrenceInput.monthOfYear,
      recurrenceInput.dayOfMonth,
      recurrenceInput.interval,
      options
    );
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
        return this.createWeeklyRecurrence(recurrenceInput, options);
      case 'MONTHLY':
        return this.createMonthlyRecurrence(recurrenceInput, options);
      case 'YEARLY':
        return this.createYearlyRecurrence(recurrenceInput, options);
      default:
        return Result.fail(
          new ValidationError(`Unknown recurrence frequency: ${recurrenceInput.frequency}`)
        );
    }
  }
}
