/**
 * Appointment side effects run after an appointment is created: ICS invitation,
 * reminder scheduling and the AppointmentCreatedEvent audit trail (IFC-158).
 *
 * Moved out of appointments.router.ts (PG-203) so the public booking flow can
 * run them too. A public booking passes `sendIcs: false`: the ICS handler uses
 * placeholder recipient addresses, and the booker gets a fixed confirmation
 * email from the booking flow instead (ADR-083).
 */
import { AppointmentCreatedEvent, AppointmentId, Appointment, TimeSlot } from '@intelliflow/domain';
import { AppointmentDomainService } from '../../services';
import { container } from '../../container';

/**
 * Convert a Prisma appointment record to a domain Appointment for ICS/reminder handlers.
 * Uses AppointmentDomainService.toDomainAppointments (handles TimeSlot, Buffer, etc.)
 * and returns the first result, or null if conversion fails.
 */
export function toDomainAppointment(dbRecord: any): Appointment | null {
  const results = AppointmentDomainService.toDomainAppointments([
    {
      ...dbRecord,
      bufferMinutesBefore: dbRecord.bufferMinutesBefore ?? 0,
      bufferMinutesAfter: dbRecord.bufferMinutesAfter ?? 0,
      attendees: dbRecord.attendees?.map((a: any) => ({ userId: a.userId ?? a })) ?? [],
    },
  ]);
  return results.length > 0 ? results[0] : null;
}

/**
 * Fire-and-forget: dispatch ICS invitation, schedule reminder, and emit audit event
 * after an appointment is created. Errors are logged but do not block the response.
 */
export async function onAppointmentCreated(
  dbRecord: any,
  userId: string,
  opts: { sendIcs?: boolean } = {}
): Promise<void> {
  try {
    const appointment = toDomainAppointment(dbRecord);
    if (!appointment) return;

    const idResult = AppointmentId.create(dbRecord.id);
    if (idResult.isFailure) return;

    const timeSlotResult = TimeSlot.create(dbRecord.startTime, dbRecord.endTime);
    if (timeSlotResult.isFailure) return;

    const event = new AppointmentCreatedEvent(
      idResult.value,
      dbRecord.title,
      timeSlotResult.value,
      dbRecord.appointmentType,
      userId
    );

    // ICS invitation
    if (opts.sendIcs !== false) {
      await container.appointmentIcsHandler.handleAppointmentCreated(event, appointment);
    }
    // Schedule reminder
    await container.reminderScheduler.handleAppointmentCreated(event, appointment);
    // Audit trail via event bus
    await container.adapters.eventBus.publish(event);
  } catch (error) {
    console.error('[appointments] onAppointmentCreated side-effect error:', error);
  }
}
