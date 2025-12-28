import {
  AppointmentRepository,
  TimeSlot,
  Buffer,
  ConflictDetector,
  AppointmentConflict,
  AvailabilitySlot,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError } from '../../errors';

export interface CheckConflictsInput {
  startTime: Date;
  endTime: Date;
  attendeeIds: string[];
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  excludeAppointmentId?: string;
}

export interface CheckConflictsOutput {
  hasConflicts: boolean;
  conflicts: {
    appointmentId: string;
    title: string;
    startTime: Date;
    endTime: Date;
    overlapMinutes: number;
    conflictType: 'EXACT' | 'PARTIAL' | 'BUFFER';
  }[];
  availableSlots?: AvailabilitySlot[];
}

export interface CheckAvailabilityInput {
  attendeeId: string;
  startTime: Date;
  endTime: Date;
  minimumSlotMinutes?: number;
  includeBuffer?: boolean;
}

export interface CheckAvailabilityOutput {
  availableSlots: AvailabilitySlot[];
  totalAvailableMinutes: number;
}

export interface FindNextSlotInput {
  attendeeId: string;
  startFrom: Date;
  durationMinutes: number;
  maxDaysAhead?: number;
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  workingHoursStart?: number;
  workingHoursEnd?: number;
}

export interface FindNextSlotOutput {
  slot: AvailabilitySlot | null;
  searchedUntil: Date;
}

/**
 * Check Conflicts Use Case
 * Checks for scheduling conflicts and availability
 */
export class CheckConflictsUseCase {
  constructor(private readonly appointmentRepository: AppointmentRepository) {}

  /**
   * Check for conflicts with a proposed time slot
   */
  async checkConflicts(
    input: CheckConflictsInput
  ): Promise<Result<CheckConflictsOutput, DomainError>> {
    try {
      // Create time slot
      const timeSlotResult = TimeSlot.create(input.startTime, input.endTime);
      if (timeSlotResult.isFailure) {
        return Result.fail(timeSlotResult.error);
      }

      // Create buffer
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

      // Find potentially conflicting appointments
      const existingAppointments = await this.appointmentRepository.findForConflictCheck(
        input.attendeeIds,
        {
          startTime: buffer.adjustStartTime(input.startTime),
          endTime: buffer.adjustEndTime(input.endTime),
        }
      );

      // Check for conflicts
      const conflictResult = ConflictDetector.checkTimeSlotConflicts(
        timeSlotResult.value,
        buffer,
        existingAppointments
      );

      // Enrich conflict data with appointment details
      const enrichedConflicts = await Promise.all(
        conflictResult.conflicts.map(async (conflict) => {
          const apt = existingAppointments.find(
            (a) => a.id.value === conflict.conflictingAppointmentId.value
          );
          return {
            appointmentId: conflict.conflictingAppointmentId.value,
            title: apt?.title ?? 'Unknown',
            startTime: apt?.startTime ?? new Date(),
            endTime: apt?.endTime ?? new Date(),
            overlapMinutes: conflict.overlapMinutes,
            conflictType: conflict.conflictType,
          };
        })
      );

      return Result.ok({
        hasConflicts: conflictResult.hasConflicts,
        conflicts: enrichedConflicts,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to check conflicts: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Check availability for an attendee
   */
  async checkAvailability(
    input: CheckAvailabilityInput
  ): Promise<Result<CheckAvailabilityOutput, DomainError>> {
    try {
      // Find existing appointments for the attendee
      const existingAppointments = await this.appointmentRepository.findForConflictCheck(
        [input.attendeeId],
        {
          startTime: input.startTime,
          endTime: input.endTime,
        }
      );

      // Calculate available slots
      const availableSlots = ConflictDetector.checkAvailability(
        {
          attendeeId: input.attendeeId,
          startTime: input.startTime,
          endTime: input.endTime,
          minimumSlotMinutes: input.minimumSlotMinutes,
          includeBuffer: input.includeBuffer,
        },
        existingAppointments
      );

      const totalAvailableMinutes = availableSlots.reduce(
        (sum, slot) => sum + slot.durationMinutes,
        0
      );

      return Result.ok({
        availableSlots,
        totalAvailableMinutes,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to check availability: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }

  /**
   * Find the next available slot
   */
  async findNextSlot(input: FindNextSlotInput): Promise<Result<FindNextSlotOutput, DomainError>> {
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

      // Calculate search range
      const searchEndDate = new Date(input.startFrom);
      searchEndDate.setDate(searchEndDate.getDate() + (input.maxDaysAhead ?? 30));

      // Find existing appointments in the search range
      const existingAppointments = await this.appointmentRepository.findForConflictCheck(
        [input.attendeeId],
        {
          startTime: input.startFrom,
          endTime: searchEndDate,
        }
      );

      // Find next available slot
      const slot = ConflictDetector.findNextAvailableSlot(
        input.attendeeId,
        input.startFrom,
        input.durationMinutes,
        existingAppointments,
        {
          maxDaysAhead: input.maxDaysAhead,
          workingHoursStart: input.workingHoursStart,
          workingHoursEnd: input.workingHoursEnd,
          buffer,
        }
      );

      return Result.ok({
        slot,
        searchedUntil: searchEndDate,
      });
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to find next slot: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
