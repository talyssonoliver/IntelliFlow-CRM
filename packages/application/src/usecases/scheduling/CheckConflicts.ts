import {
  AppointmentRepository,
  TimeSlot,
  Buffer,
  ConflictDetector,
  AvailabilitySlot,
  DomainError,
  Result,
} from '@intelliflow/domain';
import { PersistenceError } from '../../errors';

export interface CheckConflictsInput {
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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

export interface FindFirstFreeCandidateInput {
  tenantId: string;
  attendeeId: string;
  /** Candidate slots in the order they should be tried (PG-202: generated from firm availability). */
  candidates: { start: Date; end: Date }[];
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
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

      // Find potentially conflicting appointments (tenant-scoped)
      const existingAppointments = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findForConflictCheck(input.attendeeIds, {
          startTime: buffer.adjustStartTime(input.startTime),
          endTime: buffer.adjustEndTime(input.endTime),
        });

      // Check for conflicts
      const conflictResult = ConflictDetector.checkTimeSlotConflicts(
        timeSlotResult.value,
        buffer,
        existingAppointments
      );

      // Enrich conflict data with appointment details
      const enrichedConflicts = conflictResult.conflicts.map((conflict) => {
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
      });

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
      // Find existing appointments for the attendee (tenant-scoped)
      const existingAppointments = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findForConflictCheck([input.attendeeId], {
          startTime: input.startTime,
          endTime: input.endTime,
        });

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
      searchEndDate.setUTCDate(searchEndDate.getUTCDate() + (input.maxDaysAhead ?? 30));

      // Find existing appointments in the search range (tenant-scoped)
      const existingAppointments = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findForConflictCheck([input.attendeeId], {
          startTime: input.startFrom,
          endTime: searchEndDate,
        });

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
  /**
   * First candidate with no conflict (PG-202). One repository read covers the
   * whole candidate window; each candidate is then checked in memory.
   */
  async findFirstFreeCandidate(
    input: FindFirstFreeCandidateInput
  ): Promise<Result<{ start: Date; end: Date } | null, DomainError>> {
    if (input.candidates.length === 0) return Result.ok(null);
    try {
      const bufferResult = Buffer.create(
        input.bufferMinutesBefore ?? 0,
        input.bufferMinutesAfter ?? 0
      );
      if (bufferResult.isFailure) {
        return Result.fail(bufferResult.error);
      }
      const buffer = bufferResult.value;
      const windowStart = Math.min(...input.candidates.map((c) => c.start.getTime()));
      const windowEnd = Math.max(...input.candidates.map((c) => c.end.getTime()));

      const existingAppointments = await this.appointmentRepository
        .forTenant(input.tenantId)
        .findForConflictCheck([input.attendeeId], {
          startTime: buffer.adjustStartTime(new Date(windowStart)),
          endTime: buffer.adjustEndTime(new Date(windowEnd)),
        });

      for (const candidate of input.candidates) {
        const slot = TimeSlot.create(candidate.start, candidate.end);
        if (slot.isFailure) continue;
        const result = ConflictDetector.checkTimeSlotConflicts(
          slot.value,
          buffer,
          existingAppointments
        );
        if (!result.hasConflicts) return Result.ok(candidate);
      }
      return Result.ok(null);
    } catch (error) {
      return Result.fail(
        new PersistenceError(
          `Failed to find a free slot: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
