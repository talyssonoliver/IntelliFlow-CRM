import { Result, DomainError } from '../../shared/Result';
import { Appointment } from './Appointment';
import { AppointmentId } from './AppointmentId';
import { TimeSlot } from './TimeSlot';
import { Buffer } from './Buffer';

export class ConflictDetectionError extends DomainError {
  readonly code = 'CONFLICT_DETECTION_ERROR';

  constructor(message: string) {
    super(`Conflict detection error: ${message}`);
  }
}

/**
 * Represents a conflict between appointments
 */
export interface AppointmentConflict {
  appointmentId: AppointmentId;
  conflictingAppointmentId: AppointmentId;
  overlapMinutes: number;
  conflictType: 'EXACT' | 'PARTIAL' | 'BUFFER';
  conflictStart: Date;
  conflictEnd: Date;
}

/**
 * Availability slot representation
 */
export interface AvailabilitySlot {
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
}

/**
 * Conflict check result
 */
export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: AppointmentConflict[];
  conflictingAppointmentIds: AppointmentId[];
}

/**
 * Availability check options
 */
export interface AvailabilityCheckOptions {
  attendeeId: string;
  startTime: Date;
  endTime: Date;
  minimumSlotMinutes?: number;
  includeBuffer?: boolean;
}

/**
 * ConflictDetector - Domain Service
 * Provides conflict detection functionality for appointments
 * Implements O(n) conflict detection algorithm for performance
 */
export class ConflictDetector {
  /**
   * Check for conflicts between an appointment and a list of existing appointments
   * Optimized for performance with O(n) complexity
   * Target: <100ms for scheduling latency
   */
  static checkConflicts(
    appointment: Appointment,
    existingAppointments: Appointment[]
  ): ConflictCheckResult {
    const conflicts: AppointmentConflict[] = [];
    const conflictingIds: AppointmentId[] = [];

    // Quick early return if no existing appointments
    if (existingAppointments.length === 0) {
      return {
        hasConflicts: false,
        conflicts: [],
        conflictingAppointmentIds: [],
      };
    }

    // Get the effective time slot (including buffer)
    const appointmentSlot = appointment.effectiveTimeSlot;
    const appointmentStart = appointmentSlot.startTime.getTime();
    const appointmentEnd = appointmentSlot.endTime.getTime();

    for (const existing of existingAppointments) {
      // Skip self-comparison
      if (existing.id.value === appointment.id.value) {
        continue;
      }

      // Skip inactive appointments (cancelled, completed, no-show)
      if (!existing.isActive) {
        continue;
      }

      const existingSlot = existing.effectiveTimeSlot;
      const existingStart = existingSlot.startTime.getTime();
      const existingEnd = existingSlot.endTime.getTime();

      // Efficient overlap check using interval comparison
      if (appointmentStart < existingEnd && appointmentEnd > existingStart) {
        // Calculate overlap
        const overlapStart = Math.max(appointmentStart, existingStart);
        const overlapEnd = Math.min(appointmentEnd, existingEnd);
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / (1000 * 60));

        // Determine conflict type
        let conflictType: 'EXACT' | 'PARTIAL' | 'BUFFER';
        if (appointmentStart === existingStart && appointmentEnd === existingEnd) {
          conflictType = 'EXACT';
        } else if (this.isBufferOnlyConflict(appointment, existing)) {
          conflictType = 'BUFFER';
        } else {
          conflictType = 'PARTIAL';
        }

        conflicts.push({
          appointmentId: appointment.id,
          conflictingAppointmentId: existing.id,
          overlapMinutes,
          conflictType,
          conflictStart: new Date(overlapStart),
          conflictEnd: new Date(overlapEnd),
        });

        conflictingIds.push(existing.id);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      conflictingAppointmentIds: conflictingIds,
    };
  }

  /**
   * Check if conflict is only due to buffer time
   */
  private static isBufferOnlyConflict(appointment: Appointment, existing: Appointment): boolean {
    // Check if core time slots (without buffer) overlap
    const coreOverlap = appointment.timeSlot.overlaps(existing.timeSlot);

    // If core slots don't overlap but effective slots do, it's a buffer conflict
    return !coreOverlap;
  }

  /**
   * Check for conflicts with a proposed time slot
   */
  static checkTimeSlotConflicts(
    timeSlot: TimeSlot,
    buffer: Buffer,
    existingAppointments: Appointment[],
    excludeAppointmentId?: AppointmentId
  ): ConflictCheckResult {
    const conflicts: AppointmentConflict[] = [];
    const conflictingIds: AppointmentId[] = [];

    // Calculate effective time slot with buffer
    const effectiveStart = buffer.adjustStartTime(timeSlot.startTime);
    const effectiveEnd = buffer.adjustEndTime(timeSlot.endTime);
    const effectiveSlotResult = TimeSlot.create(effectiveStart, effectiveEnd);

    if (effectiveSlotResult.isFailure) {
      return {
        hasConflicts: false,
        conflicts: [],
        conflictingAppointmentIds: [],
      };
    }

    const effectiveSlot = effectiveSlotResult.value;
    const slotStart = effectiveSlot.startTime.getTime();
    const slotEnd = effectiveSlot.endTime.getTime();

    for (const existing of existingAppointments) {
      // Skip excluded appointment (e.g., when rescheduling)
      if (excludeAppointmentId && existing.id.value === excludeAppointmentId.value) {
        continue;
      }

      // Skip inactive appointments
      if (!existing.isActive) {
        continue;
      }

      const existingSlot = existing.effectiveTimeSlot;
      const existingStart = existingSlot.startTime.getTime();
      const existingEnd = existingSlot.endTime.getTime();

      if (slotStart < existingEnd && slotEnd > existingStart) {
        const overlapStart = Math.max(slotStart, existingStart);
        const overlapEnd = Math.min(slotEnd, existingEnd);
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / (1000 * 60));

        conflicts.push({
          appointmentId: AppointmentId.generate(), // Placeholder for proposed appointment
          conflictingAppointmentId: existing.id,
          overlapMinutes,
          conflictType: 'PARTIAL',
          conflictStart: new Date(overlapStart),
          conflictEnd: new Date(overlapEnd),
        });

        conflictingIds.push(existing.id);
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      conflictingAppointmentIds: conflictingIds,
    };
  }

  /**
   * Check availability for an attendee in a time range
   */
  static checkAvailability(
    options: AvailabilityCheckOptions,
    existingAppointments: Appointment[]
  ): AvailabilitySlot[] {
    const {
      attendeeId,
      startTime,
      endTime,
      minimumSlotMinutes = 15,
      includeBuffer = true,
    } = options;

    // Filter appointments for this attendee
    const attendeeAppointments = existingAppointments.filter(
      (apt) =>
        apt.isActive && (apt.organizerId === attendeeId || apt.attendeeIds.includes(attendeeId))
    );

    // Sort by start time
    const sortedAppointments = [...attendeeAppointments].sort(
      (a, b) => a.effectiveStartTime.getTime() - b.effectiveStartTime.getTime()
    );

    const availableSlots: AvailabilitySlot[] = [];
    let currentStart = startTime;

    for (const apt of sortedAppointments) {
      const aptStart = includeBuffer ? apt.effectiveStartTime : apt.startTime;
      const aptEnd = includeBuffer ? apt.effectiveEndTime : apt.endTime;

      // Skip appointments outside our range
      if (aptEnd <= startTime || aptStart >= endTime) {
        continue;
      }

      // Check for gap before this appointment
      if (currentStart < aptStart) {
        const slotEnd = new Date(Math.min(aptStart.getTime(), endTime.getTime()));
        const duration = Math.round((slotEnd.getTime() - currentStart.getTime()) / (1000 * 60));

        if (duration >= minimumSlotMinutes) {
          availableSlots.push({
            startTime: new Date(currentStart),
            endTime: slotEnd,
            durationMinutes: duration,
          });
        }
      }

      // Move current start to after this appointment
      currentStart = new Date(Math.max(currentStart.getTime(), aptEnd.getTime()));
    }

    // Check for remaining time at the end
    if (currentStart < endTime) {
      const duration = Math.round((endTime.getTime() - currentStart.getTime()) / (1000 * 60));

      if (duration >= minimumSlotMinutes) {
        availableSlots.push({
          startTime: new Date(currentStart),
          endTime: new Date(endTime),
          durationMinutes: duration,
        });
      }
    }

    return availableSlots;
  }

  /**
   * Find next available slot of specified duration
   */
  static findNextAvailableSlot(
    attendeeId: string,
    startFrom: Date,
    durationMinutes: number,
    existingAppointments: Appointment[],
    options?: {
      maxDaysAhead?: number;
      workingHoursStart?: number;
      workingHoursEnd?: number;
      buffer?: Buffer;
    }
  ): AvailabilitySlot | null {
    const maxDays = options?.maxDaysAhead ?? 30;
    const workStart = options?.workingHoursStart ?? 9;
    const workEnd = options?.workingHoursEnd ?? 17;
    const buffer = options?.buffer ?? Buffer.none();

    // Total required duration including buffer
    const totalDuration = durationMinutes + buffer.totalMinutes;

    // Start from the beginning of the current hour or start time, whichever is later
    let currentDate = new Date(startFrom);
    currentDate.setMinutes(0, 0, 0);

    const endSearchDate = new Date(startFrom);
    endSearchDate.setDate(endSearchDate.getDate() + maxDays);

    while (currentDate < endSearchDate) {
      // Set to working hours start if before
      const hour = currentDate.getHours();
      if (hour < workStart) {
        currentDate.setHours(workStart, 0, 0, 0);
      }

      // Skip to next day if after working hours
      if (hour >= workEnd) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
        continue;
      }

      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workStart, 0, 0, 0);
        continue;
      }

      // Calculate end of working day
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(workEnd, 0, 0, 0);

      // Check availability for rest of day
      const availableSlots = this.checkAvailability(
        {
          attendeeId,
          startTime: currentDate,
          endTime: endOfDay,
          minimumSlotMinutes: totalDuration,
          includeBuffer: true,
        },
        existingAppointments
      );

      // Return first slot that fits
      const suitableSlot = availableSlots.find((slot) => slot.durationMinutes >= totalDuration);
      if (suitableSlot) {
        return {
          startTime: suitableSlot.startTime,
          endTime: new Date(suitableSlot.startTime.getTime() + totalDuration * 60 * 1000),
          durationMinutes: totalDuration,
        };
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(workStart, 0, 0, 0);
    }

    return null;
  }

  /**
   * Calculate conflict accuracy percentage
   * Used for KPI tracking (>95% accuracy target)
   */
  static calculateConflictAccuracy(
    detectedConflicts: AppointmentConflict[],
    actualConflicts: AppointmentConflict[]
  ): number {
    if (actualConflicts.length === 0 && detectedConflicts.length === 0) {
      return 100;
    }

    if (actualConflicts.length === 0) {
      return 0; // False positives
    }

    let correctDetections = 0;

    for (const actual of actualConflicts) {
      const found = detectedConflicts.some(
        (detected) =>
          detected.conflictingAppointmentId.value === actual.conflictingAppointmentId.value
      );
      if (found) {
        correctDetections++;
      }
    }

    const falsePositives = detectedConflicts.length - correctDetections;
    const falseNegatives = actualConflicts.length - correctDetections;

    // F1-style accuracy: true positives / (true positives + 0.5 * (false positives + false negatives))
    const accuracy =
      (correctDetections / (correctDetections + 0.5 * (falsePositives + falseNegatives))) * 100;

    return Math.round(accuracy * 100) / 100;
  }

  /**
   * Batch check for conflicts across multiple appointments
   * Optimized for bulk operations
   */
  static batchCheckConflicts(appointments: Appointment[]): Map<string, ConflictCheckResult> {
    const results = new Map<string, ConflictCheckResult>();

    // Sort appointments by start time for efficient comparison
    const sorted = [...appointments].sort(
      (a, b) => a.effectiveStartTime.getTime() - b.effectiveStartTime.getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const conflicts: AppointmentConflict[] = [];
      const conflictingIds: AppointmentId[] = [];

      // Only need to check appointments that could possibly overlap
      // (start before current ends)
      for (let j = 0; j < sorted.length; j++) {
        if (i === j) continue;

        const other = sorted[j];

        // Optimization: if other starts after current ends, no more conflicts possible
        if (other.effectiveStartTime > current.effectiveEndTime) {
          break;
        }

        if (current.conflictsWith(other)) {
          const overlapStart = Math.max(
            current.effectiveStartTime.getTime(),
            other.effectiveStartTime.getTime()
          );
          const overlapEnd = Math.min(
            current.effectiveEndTime.getTime(),
            other.effectiveEndTime.getTime()
          );

          conflicts.push({
            appointmentId: current.id,
            conflictingAppointmentId: other.id,
            overlapMinutes: Math.round((overlapEnd - overlapStart) / (1000 * 60)),
            conflictType: 'PARTIAL',
            conflictStart: new Date(overlapStart),
            conflictEnd: new Date(overlapEnd),
          });

          conflictingIds.push(other.id);
        }
      }

      results.set(current.id.value, {
        hasConflicts: conflicts.length > 0,
        conflicts,
        conflictingAppointmentIds: conflictingIds,
      });
    }

    return results;
  }
}
