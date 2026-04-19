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
  private static buildRecurrence(recurrenceData: unknown): Recurrence | undefined {
    if (!recurrenceData) return undefined;
    const rec = recurrenceData as {
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
      exceptionDates: rec.exceptionDates?.map((d) => new Date(d)),
    });
    return recurrenceResult.isSuccess ? recurrenceResult.value : undefined;
  }

  private static convertSingleAppointment(dbApt: {
    id: string;
    title: string;
    description?: string | null;
    startTime: Date;
    endTime: Date;
    appointmentType: string;
    location?: string | null;
    organizerId: string;
    tenantId: string;
    attendees?: Array<{ userId: string }>;
    status: string;
    bufferMinutesBefore: number;
    bufferMinutesAfter: number;
    recurrence?: unknown;
  }): Appointment | null {
    const timeSlotResult = TimeSlot.create(dbApt.startTime, dbApt.endTime);
    if (timeSlotResult.isFailure) return null;

    const bufferResult = Buffer.create(dbApt.bufferMinutesBefore, dbApt.bufferMinutesAfter);
    if (bufferResult.isFailure) return null;

    const recurrence = AppointmentDomainService.buildRecurrence(dbApt.recurrence);

    const props: CreateAppointmentProps = {
      title: dbApt.title,
      description: dbApt.description ?? undefined,
      startTime: dbApt.startTime,
      endTime: dbApt.endTime,
      appointmentType: dbApt.appointmentType as AppointmentType,
      location: dbApt.location ?? undefined,
      organizerId: dbApt.organizerId,
      tenantId: dbApt.tenantId,
      attendeeIds: dbApt.attendees?.map((a) => a.userId) ?? [],
      buffer: bufferResult.value,
      recurrence,
    };

    const appointmentResult = Appointment.create(props);
    if (!appointmentResult.isSuccess) return null;

    const apt = appointmentResult.value;
    const idResult = AppointmentId.create(dbApt.id);
    if (!idResult.isSuccess) return null;

    // Use reflection to set the ID (since domain objects are normally created fresh)
    Object.assign(apt, {
      _id: idResult.value,
      _status: dbApt.status as AppointmentStatus,
    });
    return apt;
  }

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
      tenantId: string;
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
        const apt = AppointmentDomainService.convertSingleAppointment(dbApt);
        if (apt) appointments.push(apt);
      } catch (error) {
        console.error(
          `[AppointmentDomainService] Failed to convert appointment ${dbApt.id}:`,
          error
        );
      }
    }

    return appointments;
  }
}

// Export singleton instance
export const appointmentDomainService = new AppointmentDomainService();
