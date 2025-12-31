import {
  Appointment,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
} from '@intelliflow/domain';
import type {
  IcsGenerationServicePort,
  NotificationServicePort,
  IcsReminder,
} from '../ports/external';

/**
 * Appointment ICS Event Handler
 * Handles domain events related to appointments and generates/sends ICS invitations
 *
 * @see IFC-158: Scheduling communications
 */
export class AppointmentIcsEventHandler {
  /**
   * In-memory sequence number storage
   * In production, this would be persisted in a database
   * Key: appointmentId, Value: sequence number
   */
  private sequenceStore: Map<string, number> = new Map();

  constructor(
    private readonly icsService: IcsGenerationServicePort,
    private readonly notificationService: NotificationServicePort
  ) {}

  /**
   * Handle appointment created event
   * Generates initial ICS invitation with SEQUENCE:0 and sends via email
   */
  async handleAppointmentCreated(
    event: AppointmentCreatedEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      // Initialize sequence number
      this.sequenceStore.set(appointment.id.value, 0);

      // Generate ICS invitation
      const icsResult = this.icsService.generateInvitation(appointment, {
        organizerEmail: this.getOrganizerEmail(appointment),
        attendees: this.getAttendeeEmails(appointment),
        reminders: this.getReminders(appointment),
        meetingUrl: this.getMeetingUrl(appointment),
      });

      if (icsResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] ICS generation failed:', icsResult.error);
        return;
      }

      const ics = icsResult.value;

      // Send email with ICS attachment
      const emailResult = await this.notificationService.sendEmail({
        to: this.getAttendeeEmails(appointment),
        subject: `Invitation: ${appointment.title}`,
        htmlBody: this.buildInvitationEmailBody(appointment),
        textBody: this.buildInvitationEmailBodyText(appointment),
        attachments: [
          {
            filename: ics.filename,
            content: ics.content,
            contentType: 'text/calendar; method=REQUEST',
            encoding: 'utf-8',
          },
        ],
      });

      if (emailResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] Email send failed:', emailResult.error);
        return;
      }

      console.log(`[AppointmentIcsEventHandler] Invitation sent for appointment ${appointment.id.value}`);
    } catch (error) {
      console.error('[AppointmentIcsEventHandler] Error handling appointment created:', error);
    }
  }

  /**
   * Handle appointment rescheduled event
   * Generates ICS update with incremented SEQUENCE and sends via email
   */
  async handleAppointmentRescheduled(
    event: AppointmentRescheduledEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      // Increment sequence number
      await this.incrementSequence(appointment.id.value);
      const sequence = await this.getSequenceNumber(appointment.id.value);

      // Generate ICS update
      const icsResult = this.icsService.generateUpdate(appointment, {
        sequence,
        organizerEmail: this.getOrganizerEmail(appointment),
        attendees: this.getAttendeeEmails(appointment),
        reminders: this.getReminders(appointment),
        meetingUrl: this.getMeetingUrl(appointment),
      });

      if (icsResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] ICS update generation failed:', icsResult.error);
        return;
      }

      const ics = icsResult.value;

      // Build reschedule reason
      const reason = event.reason
        ? `Reason: ${event.reason}`
        : 'The appointment time has been changed.';

      // Send email with ICS attachment
      const emailResult = await this.notificationService.sendEmail({
        to: this.getAttendeeEmails(appointment),
        subject: `Rescheduled: ${appointment.title}`,
        htmlBody: this.buildRescheduleEmailBody(appointment, event, reason),
        textBody: this.buildRescheduleEmailBodyText(appointment, event, reason),
        attachments: [
          {
            filename: ics.filename,
            content: ics.content,
            contentType: 'text/calendar; method=REQUEST',
            encoding: 'utf-8',
          },
        ],
      });

      if (emailResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] Reschedule email send failed:', emailResult.error);
        return;
      }

      console.log(`[AppointmentIcsEventHandler] Reschedule notification sent for appointment ${appointment.id.value}`);
    } catch (error) {
      console.error('[AppointmentIcsEventHandler] Error handling appointment rescheduled:', error);
    }
  }

  /**
   * Handle appointment cancelled event
   * Generates ICS cancellation with METHOD:CANCEL and sends via email
   */
  async handleAppointmentCancelled(
    event: AppointmentCancelledEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      // Increment sequence number for cancellation
      await this.incrementSequence(appointment.id.value);
      const sequence = await this.getSequenceNumber(appointment.id.value);

      // Generate ICS cancellation
      const icsResult = this.icsService.generateCancellation(appointment, {
        sequence,
        organizerEmail: this.getOrganizerEmail(appointment),
        attendees: this.getAttendeeEmails(appointment),
        cancellationReason: event.reason,
      });

      if (icsResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] ICS cancellation generation failed:', icsResult.error);
        return;
      }

      const ics = icsResult.value;

      // Build cancellation message
      const reason = event.reason || 'The appointment has been cancelled.';

      // Send email with ICS attachment
      const emailResult = await this.notificationService.sendEmail({
        to: this.getAttendeeEmails(appointment),
        subject: `Cancelled: ${appointment.title}`,
        htmlBody: this.buildCancellationEmailBody(appointment, reason),
        textBody: this.buildCancellationEmailBodyText(appointment, reason),
        attachments: [
          {
            filename: ics.filename,
            content: ics.content,
            contentType: 'text/calendar; method=CANCEL',
            encoding: 'utf-8',
          },
        ],
      });

      if (emailResult.isFailure) {
        console.error('[AppointmentIcsEventHandler] Cancellation email send failed:', emailResult.error);
        return;
      }

      console.log(`[AppointmentIcsEventHandler] Cancellation notification sent for appointment ${appointment.id.value}`);
    } catch (error) {
      console.error('[AppointmentIcsEventHandler] Error handling appointment cancelled:', error);
    }
  }

  /**
   * Get current sequence number for an appointment
   * Returns 0 if not found
   */
  async getSequenceNumber(appointmentId: string): Promise<number> {
    return this.sequenceStore.get(appointmentId) ?? 0;
  }

  /**
   * Increment sequence number for an appointment
   */
  async incrementSequence(appointmentId: string): Promise<void> {
    const current = await this.getSequenceNumber(appointmentId);
    this.sequenceStore.set(appointmentId, current + 1);
  }

  // ==================== Private Helper Methods ====================

  /**
   * Get organizer email from appointment
   * In production, this would look up the user's email from the database
   */
  private getOrganizerEmail(appointment: Appointment): string {
    // For now, construct from organizerId
    // In production: await userRepository.findById(appointment.organizerId).email
    return `${appointment.organizerId}@intelliflow-crm.com`;
  }

  /**
   * Get attendee email addresses
   */
  private getAttendeeEmails(appointment: Appointment): string[] {
    // Assuming attendeeIds are already email addresses
    // In production, might need to look up emails from user IDs
    return [...appointment.attendeeIds];
  }

  /**
   * Convert appointment reminders to ICS reminders
   */
  private getReminders(appointment: Appointment): IcsReminder[] | undefined {
    if (!appointment.reminderMinutes) {
      return undefined;
    }

    return [
      {
        minutesBefore: appointment.reminderMinutes,
        action: 'DISPLAY',
        description: `Reminder: ${appointment.title} in ${appointment.reminderMinutes} minutes`,
      },
    ];
  }

  /**
   * Get meeting URL if available
   * In production, this might come from appointment metadata
   */
  private getMeetingUrl(appointment: Appointment): string | undefined {
    // In production: return appointment.metadata?.meetingUrl
    return undefined;
  }

  /**
   * Build HTML email body for invitation
   */
  private buildInvitationEmailBody(appointment: Appointment): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>You're invited to: ${appointment.title}</h2>
          <p><strong>When:</strong> ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}</p>
          ${appointment.location ? `<p><strong>Where:</strong> ${appointment.location}</p>` : ''}
          ${appointment.description ? `<p><strong>Description:</strong> ${appointment.description}</p>` : ''}
          <p>Please accept or decline this invitation by opening the attached calendar file.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from IntelliFlow CRM.</p>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email body for invitation
   */
  private buildInvitationEmailBodyText(appointment: Appointment): string {
    let body = `You're invited to: ${appointment.title}\n\n`;
    body += `When: ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}\n`;
    if (appointment.location) {
      body += `Where: ${appointment.location}\n`;
    }
    if (appointment.description) {
      body += `\nDescription: ${appointment.description}\n`;
    }
    body += `\nPlease accept or decline this invitation by opening the attached calendar file.\n`;
    return body;
  }

  /**
   * Build HTML email body for reschedule notification
   */
  private buildRescheduleEmailBody(
    appointment: Appointment,
    event: AppointmentRescheduledEvent,
    reason: string
  ): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Appointment Rescheduled: ${appointment.title}</h2>
          <p style="color: #d97706;"><strong>This appointment has been rescheduled.</strong></p>
          <p><strong>New Time:</strong> ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}</p>
          ${appointment.location ? `<p><strong>Location:</strong> ${appointment.location}</p>` : ''}
          <p>${reason}</p>
          <p>Your calendar will be updated automatically when you open the attached file.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from IntelliFlow CRM.</p>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email body for reschedule notification
   */
  private buildRescheduleEmailBodyText(
    appointment: Appointment,
    event: AppointmentRescheduledEvent,
    reason: string
  ): string {
    let body = `Appointment Rescheduled: ${appointment.title}\n\n`;
    body += `This appointment has been rescheduled.\n\n`;
    body += `New Time: ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}\n`;
    if (appointment.location) {
      body += `Location: ${appointment.location}\n`;
    }
    body += `\n${reason}\n\n`;
    body += `Your calendar will be updated automatically when you open the attached file.\n`;
    return body;
  }

  /**
   * Build HTML email body for cancellation notification
   */
  private buildCancellationEmailBody(appointment: Appointment, reason: string): string {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Appointment Cancelled: ${appointment.title}</h2>
          <p style="color: #dc2626;"><strong>This appointment has been cancelled.</strong></p>
          <p><strong>Was scheduled for:</strong> ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p>Your calendar will be updated automatically when you open the attached file.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from IntelliFlow CRM.</p>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email body for cancellation notification
   */
  private buildCancellationEmailBodyText(appointment: Appointment, reason: string): string {
    let body = `Appointment Cancelled: ${appointment.title}\n\n`;
    body += `This appointment has been cancelled.\n\n`;
    body += `Was scheduled for: ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}\n`;
    body += `Reason: ${reason}\n\n`;
    body += `Your calendar will be updated automatically when you open the attached file.\n`;
    return body;
  }

  /**
   * Format date/time for display
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }
}
