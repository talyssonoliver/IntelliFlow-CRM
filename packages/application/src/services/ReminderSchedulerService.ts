import {
  Appointment,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
} from '@intelliflow/domain';
import type { NotificationServicePort } from '../ports/external';

/**
 * Reminder Scheduler Service
 * Handles scheduling, rescheduling, and cancellation of appointment reminders
 *
 * @see IFC-158: Scheduling communications
 */
export class ReminderSchedulerService {
  /**
   * In-memory reminder ID storage
   * In production, this would be persisted in a database
   * Key: appointmentId, Value: array of reminder notification IDs
   */
  private reminderStore: Map<string, string[]> = new Map();

  constructor(private readonly notificationService: NotificationServicePort) {}

  /**
   * Handle appointment created event
   * Schedules reminder notification if reminderMinutes is set
   */
  async handleAppointmentCreated(
    event: AppointmentCreatedEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      if (!appointment.reminderMinutes) {
        console.log(
          `[ReminderSchedulerService] No reminder set for appointment ${appointment.id.value}`
        );
        return;
      }

      // Calculate trigger time
      const triggerTime = this.calculateTriggerTime(
        appointment.startTime,
        appointment.reminderMinutes
      );

      // Schedule reminder
      const reminderResult = await this.notificationService.schedule(
        'email',
        triggerTime,
        {
          to: [...appointment.attendeeIds],
          subject: `Reminder: ${appointment.title}`,
          htmlBody: this.buildReminderEmailBodyHtml(appointment),
          textBody: this.buildReminderEmailBodyText(appointment),
        },
        'high'
      );

      if (reminderResult.isFailure) {
        console.error(
          '[ReminderSchedulerService] Failed to schedule reminder:',
          reminderResult.error
        );
        return;
      }

      // Store reminder ID for future cancellation
      const reminderId = reminderResult.value.id;
      const existingReminders = this.reminderStore.get(appointment.id.value) || [];
      this.reminderStore.set(appointment.id.value, [...existingReminders, reminderId]);

      console.log(
        `[ReminderSchedulerService] Scheduled reminder ${reminderId} for appointment ${appointment.id.value} at ${triggerTime.toISOString()}`
      );
    } catch (error) {
      console.error(
        '[ReminderSchedulerService] Error handling appointment created:',
        error
      );
    }
  }

  /**
   * Handle appointment rescheduled event
   * Cancels old reminders and schedules new ones with updated time
   */
  async handleAppointmentRescheduled(
    event: AppointmentRescheduledEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      // Cancel existing reminders
      const existingReminderIds = this.reminderStore.get(appointment.id.value) || [];

      for (const reminderId of existingReminderIds) {
        const cancelResult = await this.notificationService.cancelScheduled(reminderId);
        if (cancelResult.isFailure) {
          console.error(
            `[ReminderSchedulerService] Failed to cancel reminder ${reminderId}:`,
            cancelResult.error
          );
        } else {
          console.log(
            `[ReminderSchedulerService] Cancelled old reminder ${reminderId}`
          );
        }
      }

      // Clear old reminder IDs
      this.reminderStore.delete(appointment.id.value);

      // Schedule new reminder if reminderMinutes is still set
      if (appointment.reminderMinutes) {
        const triggerTime = this.calculateTriggerTime(
          appointment.startTime,
          appointment.reminderMinutes
        );

        const reminderResult = await this.notificationService.schedule(
          'email',
          triggerTime,
          {
            to: [...appointment.attendeeIds],
            subject: `Reminder: ${appointment.title} (Rescheduled)`,
            htmlBody: this.buildReminderEmailBodyHtml(appointment, true),
            textBody: this.buildReminderEmailBodyText(appointment, true),
          },
          'high'
        );

        if (reminderResult.isFailure) {
          console.error(
            '[ReminderSchedulerService] Failed to schedule new reminder:',
            reminderResult.error
          );
          return;
        }

        // Store new reminder ID
        const reminderId = reminderResult.value.id;
        this.reminderStore.set(appointment.id.value, [reminderId]);

        console.log(
          `[ReminderSchedulerService] Scheduled new reminder ${reminderId} for rescheduled appointment ${appointment.id.value}`
        );
      }
    } catch (error) {
      console.error(
        '[ReminderSchedulerService] Error handling appointment rescheduled:',
        error
      );
    }
  }

  /**
   * Handle appointment cancelled event
   * Cancels all scheduled reminders
   */
  async handleAppointmentCancelled(
    event: AppointmentCancelledEvent,
    appointment: Appointment
  ): Promise<void> {
    try {
      const reminderIds = this.reminderStore.get(appointment.id.value) || [];

      if (reminderIds.length === 0) {
        console.log(
          `[ReminderSchedulerService] No reminders to cancel for appointment ${appointment.id.value}`
        );
        return;
      }

      // Cancel all reminders
      for (const reminderId of reminderIds) {
        const cancelResult = await this.notificationService.cancelScheduled(reminderId);
        if (cancelResult.isFailure) {
          console.error(
            `[ReminderSchedulerService] Failed to cancel reminder ${reminderId}:`,
            cancelResult.error
          );
        } else {
          console.log(
            `[ReminderSchedulerService] Cancelled reminder ${reminderId}`
          );
        }
      }

      // Clear reminder IDs
      this.reminderStore.delete(appointment.id.value);

      console.log(
        `[ReminderSchedulerService] Cancelled ${reminderIds.length} reminder(s) for appointment ${appointment.id.value}`
      );
    } catch (error) {
      console.error(
        '[ReminderSchedulerService] Error handling appointment cancelled:',
        error
      );
    }
  }

  /**
   * Get reminder IDs for an appointment
   */
  async getReminderIds(appointmentId: string): Promise<string[]> {
    return this.reminderStore.get(appointmentId) || [];
  }

  // ==================== Private Helper Methods ====================

  /**
   * Calculate trigger time for reminder
   * @param startTime Appointment start time
   * @param reminderMinutes Minutes before start time to send reminder
   */
  private calculateTriggerTime(startTime: Date, reminderMinutes: number): Date {
    const triggerTime = new Date(startTime);
    triggerTime.setMinutes(triggerTime.getMinutes() - reminderMinutes);
    return triggerTime;
  }

  /**
   * Build HTML email body for reminder notification
   */
  private buildReminderEmailBodyHtml(
    appointment: Appointment,
    isRescheduled = false
  ): string {
    const rescheduledNote = isRescheduled
      ? '<p style="color: #d97706;"><em>Note: This appointment has been rescheduled.</em></p>'
      : '';

    return `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>🔔 Reminder: ${appointment.title}</h2>
          ${rescheduledNote}
          <p><strong>Starting in ${appointment.reminderMinutes} minutes</strong></p>
          <p><strong>When:</strong> ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}</p>
          ${appointment.location ? `<p><strong>Where:</strong> ${appointment.location}</p>` : ''}
          ${appointment.description ? `<p><strong>Description:</strong> ${appointment.description}</p>` : ''}
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated reminder from IntelliFlow CRM.</p>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email body for reminder notification
   */
  private buildReminderEmailBodyText(
    appointment: Appointment,
    isRescheduled = false
  ): string {
    let body = `🔔 Reminder: ${appointment.title}\n\n`;

    if (isRescheduled) {
      body += 'Note: This appointment has been rescheduled.\n\n';
    }

    body += `Starting in ${appointment.reminderMinutes} minutes\n\n`;
    body += `When: ${this.formatDateTime(appointment.startTime)} - ${this.formatDateTime(appointment.endTime)}\n`;

    if (appointment.location) {
      body += `Where: ${appointment.location}\n`;
    }

    if (appointment.description) {
      body += `\nDescription: ${appointment.description}\n`;
    }

    body += '\n---\nThis is an automated reminder from IntelliFlow CRM.\n';

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
