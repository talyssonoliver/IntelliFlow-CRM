import { Result, DomainError, Appointment } from '@intelliflow/domain';

/**
 * ICS Generation Service Port
 * Defines the contract for generating RFC 5545 compliant iCalendar (.ics) files
 * for appointment invitations, reschedules, and cancellations
 *
 * @see IFC-158: Scheduling communications - ICS invites, reschedule/cancel flows, reminders
 * @see RFC 5545: https://datatracker.ietf.org/doc/html/rfc5545
 */

/**
 * ICS Method type
 * Defines the purpose of the iCalendar message
 */
export type IcsMethod =
  | 'REQUEST' // Invitation or update request
  | 'CANCEL' // Cancellation notice
  | 'REPLY' // Attendee response
  | 'PUBLISH'; // Informational (no response expected)

/**
 * ICS Priority level
 */
export type IcsPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * ICS Alarm action type
 */
export type IcsAlarmAction = 'EMAIL' | 'DISPLAY' | 'AUDIO';

/**
 * ICS Reminder configuration
 */
export interface IcsReminder {
  /**
   * Minutes before event to trigger reminder
   * e.g., 15 for 15 minutes, 60 for 1 hour, 1440 for 1 day
   */
  minutesBefore: number;

  /**
   * Type of reminder action
   */
  action: IcsAlarmAction;

  /**
   * Description for the reminder
   */
  description?: string;

  /**
   * Email address for email reminders
   */
  emailTo?: string;
}

/**
 * ICS Generation Options
 */
export interface IcsGenerationOptions {
  /**
   * Method determines the purpose (REQUEST for invite/update, CANCEL for cancellation)
   */
  method: IcsMethod;

  /**
   * Sequence number for versioning
   * Increment this on each update to signal changes to calendar clients
   * Start at 0 for initial invitation
   */
  sequence: number;

  /**
   * Priority level of the event
   */
  priority?: IcsPriority;

  /**
   * Organizer name (defaults to appointment organizerId)
   */
  organizerName?: string;

  /**
   * Organizer email
   */
  organizerEmail: string;

  /**
   * List of attendee emails
   */
  attendees: string[];

  /**
   * Reminders to include in the ICS file
   */
  reminders?: IcsReminder[];

  /**
   * Cancellation reason (for METHOD:CANCEL)
   */
  cancellationReason?: string;

  /**
   * URL for the event (e.g., Zoom link, Google Meet)
   */
  meetingUrl?: string;

  /**
   * Additional custom properties
   */
  customProperties?: Record<string, string>;
}

/**
 * Generated ICS file result
 */
export interface GeneratedIcs {
  /**
   * RFC 5545 compliant ICS file content
   */
  content: string;

  /**
   * Suggested filename (e.g., "appointment-123.ics")
   */
  filename: string;

  /**
   * MIME type (always "text/calendar; charset=utf-8")
   */
  mimeType: string;

  /**
   * Size in bytes
   */
  size: number;

  /**
   * Method used in generation
   */
  method: IcsMethod;

  /**
   * Sequence number
   */
  sequence: number;

  /**
   * UID from the ICS file (for tracking)
   */
  uid: string;
}

/**
 * Domain Errors for ICS Generation
 */
export class IcsGenerationError extends DomainError {
  readonly code = 'ICS_GENERATION_ERROR';
  constructor(message: string) {
    super(`ICS generation failed: ${message}`);
  }
}

export class IcsValidationError extends DomainError {
  readonly code = 'ICS_VALIDATION_ERROR';
  constructor(message: string) {
    super(`ICS validation failed: ${message}`);
  }
}

/**
 * ICS Generation Service Port Interface
 * Implementation lives in adapters layer
 */
export interface IcsGenerationServicePort {
  /**
   * Generate ICS file for a new appointment invitation
   * Sets METHOD:REQUEST and SEQUENCE:0
   */
  generateInvitation(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method' | 'sequence'>
  ): Result<GeneratedIcs, DomainError>;

  /**
   * Generate ICS file for appointment update (reschedule)
   * Sets METHOD:REQUEST and increments SEQUENCE
   */
  generateUpdate(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method'> & { sequence: number }
  ): Result<GeneratedIcs, DomainError>;

  /**
   * Generate ICS file for appointment cancellation
   * Sets METHOD:CANCEL and STATUS:CANCELLED
   */
  generateCancellation(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method'> & {
      sequence: number;
      cancellationReason?: string;
    }
  ): Result<GeneratedIcs, DomainError>;

  /**
   * Generate ICS file with custom options
   * For advanced use cases
   */
  generate(appointment: Appointment, options: IcsGenerationOptions): Result<GeneratedIcs, DomainError>;

  /**
   * Validate ICS file content for RFC 5545 compliance
   */
  validate(icsContent: string): Result<boolean, DomainError>;

  /**
   * Parse ICS file to extract key information
   */
  parse(icsContent: string): Result<{
    uid: string;
    sequence: number;
    method: IcsMethod;
    summary: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
  }, DomainError>;

  /**
   * Generate unique UID for ICS file
   * Format: appointmentId@intelliflow-crm.com
   */
  generateUid(appointmentId: string): string;
}
