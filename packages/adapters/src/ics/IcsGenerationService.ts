import { createEvent, EventAttributes, Alarm } from 'ics';
import { Result, Appointment } from '@intelliflow/domain';
import {
  IcsGenerationServicePort,
  IcsGenerationOptions,
  GeneratedIcs,
  IcsMethod,
  IcsReminder,
  IcsGenerationError,
  IcsValidationError,
} from '@intelliflow/application';

/**
 * ICS Generation Service Implementation
 * Generates RFC 5545 compliant iCalendar files for appointment invitations,
 * updates, and cancellations
 *
 * @see RFC 5545: https://datatracker.ietf.org/doc/html/rfc5545
 * @implements {IcsGenerationServicePort}
 */
export class IcsGenerationService implements IcsGenerationServicePort {
  private readonly prodId = '-//IntelliFlow CRM//EN';

  /**
   * Generate ICS file for a new appointment invitation
   */
  generateInvitation(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method' | 'sequence'>
  ): Result<GeneratedIcs, IcsGenerationError> {
    return this.generate(appointment, {
      ...options,
      method: 'REQUEST',
      sequence: 0,
    });
  }

  /**
   * Generate ICS file for appointment update (reschedule)
   */
  generateUpdate(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method'> & { sequence: number }
  ): Result<GeneratedIcs, IcsGenerationError> {
    return this.generate(appointment, {
      ...options,
      method: 'REQUEST',
    });
  }

  /**
   * Generate ICS file for appointment cancellation
   */
  generateCancellation(
    appointment: Appointment,
    options: Omit<IcsGenerationOptions, 'method'> & {
      sequence: number;
      cancellationReason?: string;
    }
  ): Result<GeneratedIcs, IcsGenerationError> {
    return this.generate(appointment, {
      ...options,
      method: 'CANCEL',
    });
  }

  /**
   * Generate ICS file with custom options
   */
  generate(appointment: Appointment, options: IcsGenerationOptions): Result<GeneratedIcs, IcsGenerationError> {
    try {
      const uid = this.generateUid(appointment.id.value);

      // Build event attributes for ics library
      const eventAttributes: EventAttributes = {
        uid,
        start: this.formatDateArray(appointment.startTime),
        end: this.formatDateArray(appointment.endTime),
        title: appointment.title,
        description: this.buildDescription(appointment, options),
        location: appointment.location,
        organizer: {
          name: options.organizerName,
          email: options.organizerEmail,
        },
        attendees: options.attendees.map((email) => ({
          name: email.split('@')[0], // Simple name extraction
          email,
          rsvp: true,
          role: 'REQ-PARTICIPANT',
        })),
        status: options.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED',
        sequence: options.sequence,
        productId: this.prodId,
      };

      // Add reminders (VALARM components)
      if (options.reminders && options.reminders.length > 0) {
        eventAttributes.alarms = options.reminders.map(this.convertReminderToAlarm);
      }

      // Add meeting URL if provided
      if (options.meetingUrl) {
        eventAttributes.url = options.meetingUrl;
      }

      // Generate ICS content using ics library
      const { error, value } = createEvent(eventAttributes);

      if (error) {
        return Result.fail(
          new IcsGenerationError(`Failed to create ICS event: ${error.message || String(error)}`)
        );
      }

      if (!value) {
        return Result.fail(new IcsGenerationError('ICS generation returned empty content'));
      }

      // Add METHOD to VCALENDAR (ics library doesn't support this directly)
      const contentWithMethod = this.addMethod(value, options.method);

      const generatedIcs: GeneratedIcs = {
        content: contentWithMethod,
        filename: `appointment-${appointment.id.value}.ics`,
        mimeType: 'text/calendar; charset=utf-8',
        size: contentWithMethod.length,
        method: options.method,
        sequence: options.sequence,
        uid,
      };

      return Result.ok(generatedIcs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Result.fail(new IcsGenerationError(`ICS generation failed: ${message}`));
    }
  }

  /**
   * Validate ICS file content for RFC 5545 compliance
   */
  validate(icsContent: string): Result<boolean, IcsValidationError> {
    try {
      // Basic RFC 5545 validation
      const requiredFields = [
        'BEGIN:VCALENDAR',
        'END:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'END:VEVENT',
        'UID:',
        'DTSTART:',
        'DTEND:',
        'SUMMARY:',
        'DTSTAMP:',
      ];

      for (const field of requiredFields) {
        if (!icsContent.includes(field)) {
          return Result.fail(
            new IcsValidationError(`Missing required field: ${field}`)
          );
        }
      }

      // Validate date format (basic check)
      const dateRegex = /DT(START|END|STAMP):(\d{8}T\d{6}Z?)/g;
      const dateMatches = icsContent.match(dateRegex);

      if (!dateMatches || dateMatches.length < 2) {
        return Result.fail(
          new IcsValidationError('Invalid or missing date fields')
        );
      }

      return Result.ok(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Result.fail(new IcsValidationError(`Validation failed: ${message}`));
    }
  }

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
  }, IcsGenerationError> {
    try {
      // Simple regex-based parsing (for basic use cases)
      const uid = this.extractField(icsContent, 'UID');
      const sequenceStr = this.extractField(icsContent, 'SEQUENCE') || '0';
      const sequence = parseInt(sequenceStr, 10);
      const method = (this.extractField(icsContent, 'METHOD') || 'REQUEST') as IcsMethod;
      const summary = this.extractField(icsContent, 'SUMMARY') || '';

      // Validate required fields
      if (!uid) {
        return Result.fail(new IcsGenerationError('Missing UID field'));
      }

      // Parse dates (simplified)
      const dtstartStr = this.extractField(icsContent, 'DTSTART');
      const dtendStr = this.extractField(icsContent, 'DTEND');

      if (!dtstartStr || !dtendStr) {
        return Result.fail(new IcsGenerationError('Missing DTSTART or DTEND fields'));
      }

      const startTime = this.parseIcsDate(dtstartStr);
      const endTime = this.parseIcsDate(dtendStr);

      // Extract attendees
      const attendeeRegex = /ATTENDEE[^:]*:mailto:([^\r\n]+)/g;
      const attendees: string[] = [];
      let match;
      while ((match = attendeeRegex.exec(icsContent)) !== null) {
        attendees.push(match[1].trim());
      }

      return Result.ok({
        uid,
        sequence,
        method,
        summary,
        startTime,
        endTime,
        attendees,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Result.fail(new IcsGenerationError(`Parse failed: ${message}`));
    }
  }

  /**
   * Generate unique UID for ICS file
   */
  generateUid(appointmentId: string): string {
    return `${appointmentId}@intelliflow-crm.com`;
  }

  // ==================== Private Helper Methods ====================

  /**
   * Format Date to array format required by ics library
   * [year, month, day, hour, minute]
   */
  private formatDateArray(date: Date): [number, number, number, number, number] {
    return [
      date.getUTCFullYear(),
      date.getUTCMonth() + 1, // ics library uses 1-based months
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
    ];
  }

  /**
   * Build description including cancellation reason if applicable
   */
  private buildDescription(appointment: Appointment, options: IcsGenerationOptions): string {
    let description = appointment.description || '';

    if (options.method === 'CANCEL' && options.cancellationReason) {
      description = options.cancellationReason + (description ? `\n\nOriginal description: ${description}` : '');
    }

    return description;
  }

  /**
   * Convert IcsReminder to ics library Alarm format
   */
  private convertReminderToAlarm(reminder: IcsReminder): Alarm {
    return {
      action: reminder.action === 'EMAIL' ? 'email' : 'display',
      trigger: {
        minutes: reminder.minutesBefore,
        before: true,
      },
      description: reminder.description || 'Reminder',
    };
  }

  /**
   * Add METHOD field to VCALENDAR
   * The ics library doesn't support METHOD directly, so we add it manually
   */
  private addMethod(icsContent: string, method: IcsMethod): string {
    // Find the PRODID line and insert METHOD after it
    const prodIdIndex = icsContent.indexOf('PRODID:');
    if (prodIdIndex === -1) {
      // If no PRODID, insert after VERSION
      const versionIndex = icsContent.indexOf('VERSION:2.0');
      if (versionIndex !== -1) {
        const insertPoint = icsContent.indexOf('\n', versionIndex) + 1;
        return (
          icsContent.substring(0, insertPoint) +
          `METHOD:${method}\r\n` +
          icsContent.substring(insertPoint)
        );
      }
    } else {
      const insertPoint = icsContent.indexOf('\n', prodIdIndex) + 1;
      return (
        icsContent.substring(0, insertPoint) +
        `METHOD:${method}\r\n` +
        icsContent.substring(insertPoint)
      );
    }

    return icsContent;
  }

  /**
   * Extract field value from ICS content
   */
  private extractField(icsContent: string, fieldName: string): string | null {
    const regex = new RegExp(`${fieldName}:([^\r\n]+)`);
    const match = icsContent.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Parse ICS date format to JavaScript Date
   * Format: YYYYMMDDTHHmmssZ or YYYYMMDDTHHmmss
   */
  private parseIcsDate(dateStr: string): Date {
    // Remove any colons that might be in the string
    dateStr = dateStr.replace(/:/g, '');

    // Format: YYYYMMDDTHHmmssZ or YYYYMMDDTHHmmss
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-based
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hour = parseInt(dateStr.substring(9, 11), 10);
    const minute = parseInt(dateStr.substring(11, 13), 10);
    const second = parseInt(dateStr.substring(13, 15), 10);

    // If ends with Z, it's UTC
    if (dateStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    // Otherwise, treat as local (though RFC 5545 recommends UTC)
    return new Date(year, month, day, hour, minute, second);
  }
}
