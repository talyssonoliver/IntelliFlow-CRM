/**
 * Appointment Domain Service
 *
 * Bridge between the API layer and the domain layer for appointments.
 * Uses domain services (ConflictDetector) for business logic instead
 * of reimplementing in the API layer.
 *
 * @module apps/api/src/services/appointment-domain.service
 */

import {
  Appointment,
  AppointmentId,
  TimeSlot,
  Buffer,
  ConflictDetector,
  type AppointmentConflict,
  type ConflictCheckResult,
  type AvailabilitySlot,
  type AvailabilityCheckOptions,
  type CreateAppointmentProps,
  type AppointmentType,
  type AppointmentStatus,
  type RecurrenceFrequency,
  type DayOfWeek,
  Recurrence,
} from '@intelliflow/domain';

// ============================================================================
// Types for Service Layer
// ============================================================================

/**
 * Input for creating an appointment through the service
 */
export interface CreateAppointmentInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  appointmentType: AppointmentType;
  location?: string;
  organizerId: string;
  attendeeIds: string[];
  linkedCaseIds?: string[];
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  recurrence?: {
    frequency: RecurrenceFrequency;
    interval?: number;
    daysOfWeek?: DayOfWeek[];
    dayOfMonth?: number;
    monthOfYear?: number;
    endDate?: Date;
    occurrenceCount?: number;
  };
  reminderMinutes?: number;
}

/**
 * Input for rescheduling an appointment
 */
export interface RescheduleInput {
  appointmentId: string;
  newStartTime: Date;
  newEndTime: Date;
  reason?: string;
}

/**
 * Conflict check input
 */
export interface CheckConflictsInput {
  startTime: Date;
  endTime: Date;
  attendeeIds: string[];
  bufferMinutesBefore?: number;
  bufferMinutesAfter?: number;
  excludeAppointmentId?: string;
}

/**
 * Find next slot input
 */
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

/**
 * Conflict result for API responses
 */
export interface ConflictInfo {
  appointmentId: string;
  overlapMinutes: number;
  conflictType: 'EXACT' | 'PARTIAL' | 'BUFFER';
  conflictStart: Date;
  conflictEnd: Date;
}

// ============================================================================
// Appointment Domain Service
// ============================================================================

/**
 * AppointmentDomainService - Applies domain logic to appointment operations
 *
 * This service:
 * - Uses ConflictDetector for sophisticated conflict detection
 * - Creates proper domain entities with validation
 * - Supports recurrence patterns
 * - Applies buffer time logic correctly
 */
export class AppointmentDomainService {
  /**
   * Convert DB appointment records to domain Appointments
   * This allows us to use ConflictDetector with existing data
   */
  static toDomainAppointments(
    dbAppointments: Array<{
      id: string;
      title: string;
      description?: string | null;
      startTime: Date;
      endTime: Date;
      appointmentType: string;
      location?: string | null;
      organizerId: string;
      attendees?: Array<{ userId: string }>;
      status: string;
      bufferMinutesBefore: number;
      bufferMinutesAfter: number;
      recurrence?: unknown;
    }>
  ): Appointment[] {
    const appointments: Appointment[] = [];

    for (const dbApt of dbAppointments) {
      try {
        // Create TimeSlot
        const timeSlotResult = TimeSlot.create(dbApt.startTime, dbApt.endTime);
        if (timeSlotResult.isFailure) continue;

        // Create Buffer
        const bufferResult = Buffer.create(dbApt.bufferMinutesBefore, dbApt.bufferMinutesAfter);
        if (bufferResult.isFailure) continue;

        // Create Recurrence if present
        let recurrence: Recurrence | undefined;
        if (dbApt.recurrence) {
          const rec = dbApt.recurrence as {
            frequency: RecurrenceFrequency;
            interval?: number;
            daysOfWeek?: DayOfWeek[];
            dayOfMonth?: number;
            monthOfYear?: number;
            endDate?: string;
            occurrenceCount?: number;
            exceptionDates?: string[];
          };
          const recurrenceResult = Recurrence.createCustom({
            frequency: rec.frequency,
            interval: rec.interval ?? 1,
            daysOfWeek: rec.daysOfWeek,
            dayOfMonth: rec.dayOfMonth,
            monthOfYear: rec.monthOfYear,
            endDate: rec.endDate ? new Date(rec.endDate) : undefined,
            occurrenceCount: rec.occurrenceCount,
            exceptionDates: rec.exceptionDates?.map(d => new Date(d)),
          });
          if (recurrenceResult.isSuccess) {
            recurrence = recurrenceResult.value;
          }
        }

        // Create Appointment
        const props: CreateAppointmentProps = {
          title: dbApt.title,
          description: dbApt.description ?? undefined,
          startTime: dbApt.startTime,
          endTime: dbApt.endTime,
          appointmentType: dbApt.appointmentType as AppointmentType,
          location: dbApt.location ?? undefined,
          organizerId: dbApt.organizerId,
          attendeeIds: dbApt.attendees?.map((a) => a.userId) ?? [],
          buffer: bufferResult.value,
          recurrence,
        };

        const appointmentResult = Appointment.create(props);
        if (appointmentResult.isSuccess) {
          // Reconstitute with the correct ID and status
          const apt = appointmentResult.value;
          const idResult = AppointmentId.create(dbApt.id);
          if (idResult.isSuccess) {
            // Use reflection to set the ID (since domain objects are normally created fresh)
            Object.assign(apt, {
              _id: idResult.value,
              _status: dbApt.status as AppointmentStatus,
            });
            appointments.push(apt);
          }
        }
      } catch (error) {
        console.error(`[AppointmentDomainService] Failed to convert appointment ${dbApt.id}:`, error);
      }
    }

    return appointments;
  }

  /**
   * Check for conflicts using domain ConflictDetector
   *
   * This provides more sophisticated conflict detection than the basic
   * Prisma queries, including:
   * - Proper buffer time handling
   * - Conflict type classification (EXACT, PARTIAL, BUFFER)
   * - Performance optimized O(n) algorithm
   */
  static checkConflicts(
    input: CheckConflictsInput,
    existingAppointments: Appointment[],
  ): { hasConflicts: boolean; conflicts: ConflictInfo[] } {
    // Create TimeSlot
    const timeSlotResult = TimeSlot.create(input.startTime, input.endTime);
    if (timeSlotResult.isFailure) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Create Buffer
    const bufferResult = Buffer.create(
      input.bufferMinutesBefore ?? 0,
      input.bufferMinutesAfter ?? 0
    );
    if (bufferResult.isFailure) {
      return { hasConflicts: false, conflicts: [] };
    }

    // Filter to only relevant appointments (those involving the attendees)
    const relevantAppointments = existingAppointments.filter((apt) => {
      if (!apt.isActive) return false;

      // Check if any attendee overlaps
      return (
        input.attendeeIds.includes(apt.organizerId) ||
        apt.attendeeIds.some((id) => input.attendeeIds.includes(id))
      );
    });

    // Exclude the appointment being rescheduled
    const excludeId = input.excludeAppointmentId;
    const appointmentsToCheck = excludeId
      ? relevantAppointments.filter((apt) => apt.id.value !== excludeId)
      : relevantAppointments;

    // Use domain ConflictDetector
    let excludeAppointmentId: AppointmentId | undefined;
    if (excludeId) {
      const idResult = AppointmentId.create(excludeId);
      if (idResult.isSuccess) {
        excludeAppointmentId = idResult.value;
      }
    }

    const result = ConflictDetector.checkTimeSlotConflicts(
      timeSlotResult.value,
      bufferResult.value,
      appointmentsToCheck,
      excludeAppointmentId
    );

    return {
      hasConflicts: result.hasConflicts,
      conflicts: result.conflicts.map((c) => ({
        appointmentId: c.conflictingAppointmentId.value,
        overlapMinutes: c.overlapMinutes,
        conflictType: c.conflictType,
        conflictStart: c.conflictStart,
        conflictEnd: c.conflictEnd,
      })),
    };
  }

  /**
   * Check availability using domain ConflictDetector
   */
  static checkAvailability(
    options: AvailabilityCheckOptions,
    existingAppointments: Appointment[]
  ): AvailabilitySlot[] {
    return ConflictDetector.checkAvailability(options, existingAppointments);
  }

  /**
   * Find next available slot using domain ConflictDetector
   */
  static findNextAvailableSlot(
    input: FindNextSlotInput,
    existingAppointments: Appointment[]
  ): AvailabilitySlot | null {
    // Create buffer if specified
    let buffer: Buffer | undefined;
    if (input.bufferMinutesBefore || input.bufferMinutesAfter) {
      const bufferResult = Buffer.create(
        input.bufferMinutesBefore ?? 0,
        input.bufferMinutesAfter ?? 0
      );
      if (bufferResult.isSuccess) {
        buffer = bufferResult.value;
      }
    }

    return ConflictDetector.findNextAvailableSlot(
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
  }

  /**
   * Batch check conflicts for multiple appointments
   * Useful for validating recurrence patterns
   */
  static batchCheckConflicts(
    appointments: Appointment[]
  ): Map<string, ConflictCheckResult> {
    return ConflictDetector.batchCheckConflicts(appointments);
  }

  /**
   * Calculate conflict detection accuracy
   * For KPI tracking (target >95%)
   */
  static calculateAccuracy(
    detectedConflicts: AppointmentConflict[],
    actualConflicts: AppointmentConflict[]
  ): number {
    return ConflictDetector.calculateConflictAccuracy(detectedConflicts, actualConflicts);
  }

  /**
   * Validate appointment creation input
   * Applies domain validation rules
   */
  static validateInput(input: CreateAppointmentInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Time validation
    if (input.startTime >= input.endTime) {
      errors.push('Start time must be before end time');
    }

    // Duration validation
    const durationMs = input.endTime.getTime() - input.startTime.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    if (durationMinutes < 5) {
      errors.push('Appointment must be at least 5 minutes long');
    }
    if (durationMinutes > 24 * 60) {
      errors.push('Appointment cannot be longer than 24 hours');
    }

    // Buffer validation
    if (input.bufferMinutesBefore && (input.bufferMinutesBefore < 0 || input.bufferMinutesBefore > 240)) {
      errors.push('Buffer before must be between 0 and 240 minutes');
    }
    if (input.bufferMinutesAfter && (input.bufferMinutesAfter < 0 || input.bufferMinutesAfter > 240)) {
      errors.push('Buffer after must be between 0 and 240 minutes');
    }

    // Title validation
    if (!input.title || input.title.trim().length === 0) {
      errors.push('Title is required');
    }
    if (input.title && input.title.length > 255) {
      errors.push('Title cannot exceed 255 characters');
    }

    // Recurrence validation
    if (input.recurrence) {
      const recurrenceResult = Recurrence.createCustom({
        frequency: input.recurrence.frequency,
        interval: input.recurrence.interval ?? 1,
        daysOfWeek: input.recurrence.daysOfWeek,
        dayOfMonth: input.recurrence.dayOfMonth,
        monthOfYear: input.recurrence.monthOfYear,
        endDate: input.recurrence.endDate,
        occurrenceCount: input.recurrence.occurrenceCount,
      });
      if (recurrenceResult.isFailure) {
        errors.push(`Invalid recurrence: ${recurrenceResult.error.message}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate recurrence instances
   * Creates appointment instances from a recurrence pattern
   */
  static generateRecurrenceInstances(
    input: CreateAppointmentInput,
    maxInstances: number = 52
  ): Array<{ startTime: Date; endTime: Date }> {
    if (!input.recurrence) {
      return [{ startTime: input.startTime, endTime: input.endTime }];
    }

    const recurrenceResult = Recurrence.createCustom({
      frequency: input.recurrence.frequency,
      interval: input.recurrence.interval ?? 1,
      daysOfWeek: input.recurrence.daysOfWeek,
      dayOfMonth: input.recurrence.dayOfMonth,
      monthOfYear: input.recurrence.monthOfYear,
      endDate: input.recurrence.endDate,
      occurrenceCount: input.recurrence.occurrenceCount,
    });

    if (recurrenceResult.isFailure) {
      return [{ startTime: input.startTime, endTime: input.endTime }];
    }

    const recurrence = recurrenceResult.value;
    const duration = input.endTime.getTime() - input.startTime.getTime();

    // Get occurrence dates using generateOccurrences method
    const occurrenceDates = recurrence.generateOccurrences(
      input.startTime,
      Math.min(maxInstances, input.recurrence.occurrenceCount ?? maxInstances),
      input.recurrence.endDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    );

    return occurrenceDates.map((startTime) => ({
      startTime,
      endTime: new Date(startTime.getTime() + duration),
    }));
  }
}

// Export singleton instance
export const appointmentDomainService = new AppointmentDomainService();
