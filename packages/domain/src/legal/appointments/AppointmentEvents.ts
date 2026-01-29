import { DomainEvent } from '../../shared/DomainEvent';
import { AppointmentId } from './AppointmentId';
import { TimeSlot } from './TimeSlot';
import { CaseId } from '../cases/CaseId';

// Canonical enum values - single source of truth
export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const APPOINTMENT_TYPES = [
  'MEETING',
  'CALL',
  'HEARING',
  'CONSULTATION',
  'DEPOSITION',
  'OTHER',
] as const;

// Derive types from const arrays
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

/**
 * Event: Appointment was created
 */
export class AppointmentCreatedEvent extends DomainEvent {
  readonly eventType = 'appointment.created';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly title: string,
    public readonly timeSlot: TimeSlot,
    public readonly appointmentType: AppointmentType,
    public readonly createdBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      title: this.title,
      timeSlot: this.timeSlot.toJSON(),
      appointmentType: this.appointmentType,
      createdBy: this.createdBy,
    };
  }
}

/**
 * Event: Appointment was rescheduled
 */
export class AppointmentRescheduledEvent extends DomainEvent {
  readonly eventType = 'appointment.rescheduled';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly previousTimeSlot: TimeSlot,
    public readonly newTimeSlot: TimeSlot,
    public readonly rescheduledBy: string,
    public readonly reason?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      previousTimeSlot: this.previousTimeSlot.toJSON(),
      newTimeSlot: this.newTimeSlot.toJSON(),
      rescheduledBy: this.rescheduledBy,
      reason: this.reason,
    };
  }
}

/**
 * Event: Appointment was confirmed
 */
export class AppointmentConfirmedEvent extends DomainEvent {
  readonly eventType = 'appointment.confirmed';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly confirmedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      confirmedBy: this.confirmedBy,
    };
  }
}

/**
 * Event: Appointment was cancelled
 */
export class AppointmentCancelledEvent extends DomainEvent {
  readonly eventType = 'appointment.cancelled';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly cancelledBy: string,
    public readonly reason?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      cancelledBy: this.cancelledBy,
      reason: this.reason,
    };
  }
}

/**
 * Event: Appointment was completed
 */
export class AppointmentCompletedEvent extends DomainEvent {
  readonly eventType = 'appointment.completed';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly completedBy: string,
    public readonly notes?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      completedBy: this.completedBy,
      notes: this.notes,
    };
  }
}

/**
 * Event: Appointment was marked as no-show
 */
export class AppointmentNoShowEvent extends DomainEvent {
  readonly eventType = 'appointment.no_show';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly markedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      markedBy: this.markedBy,
    };
  }
}

/**
 * Event: Appointment was linked to a case
 */
export class AppointmentLinkedToCaseEvent extends DomainEvent {
  readonly eventType = 'appointment.linked_to_case';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly caseId: CaseId,
    public readonly linkedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      caseId: this.caseId.value,
      linkedBy: this.linkedBy,
    };
  }
}

/**
 * Event: Appointment was unlinked from a case
 */
export class AppointmentUnlinkedFromCaseEvent extends DomainEvent {
  readonly eventType = 'appointment.unlinked_from_case';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly caseId: CaseId,
    public readonly unlinkedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      caseId: this.caseId.value,
      unlinkedBy: this.unlinkedBy,
    };
  }
}

/**
 * Event: Attendee was added to appointment
 */
export class AppointmentAttendeeAddedEvent extends DomainEvent {
  readonly eventType = 'appointment.attendee_added';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly attendeeId: string,
    public readonly addedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      attendeeId: this.attendeeId,
      addedBy: this.addedBy,
    };
  }
}

/**
 * Event: Attendee was removed from appointment
 */
export class AppointmentAttendeeRemovedEvent extends DomainEvent {
  readonly eventType = 'appointment.attendee_removed';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly attendeeId: string,
    public readonly removedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      attendeeId: this.attendeeId,
      removedBy: this.removedBy,
    };
  }
}

/**
 * Event: Conflict was detected for appointment
 */
export class AppointmentConflictDetectedEvent extends DomainEvent {
  readonly eventType = 'appointment.conflict_detected';

  constructor(
    public readonly appointmentId: AppointmentId,
    public readonly conflictingAppointmentIds: AppointmentId[],
    public readonly detectedAt: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      appointmentId: this.appointmentId.value,
      conflictingAppointmentIds: this.conflictingAppointmentIds.map((id) => id.value),
      detectedAt: this.detectedAt.toISOString(),
    };
  }
}
