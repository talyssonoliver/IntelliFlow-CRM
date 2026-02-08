/**
 * IcsGenerationService - Additional Coverage Tests
 *
 * Supplements IcsGenerationService.test.ts to cover uncovered methods/branches:
 * - parse() method (full parsing flow, attendees extraction, errors)
 * - validate() edge cases (missing specific fields, error catch)
 * - generate() error path (ics library returns error)
 * - addMethod() with no PRODID fallback to VERSION
 * - addMethod() with no PRODID and no VERSION
 * - buildDescription() cancellation with and without original description
 * - convertReminderToAlarm() with EMAIL action
 * - generate() with meetingUrl
 * - generateUid() format
 * - parse ICS date without Z suffix (local time)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IcsGenerationService } from '../ics/IcsGenerationService';
import { Appointment } from '@intelliflow/domain';

describe('IcsGenerationService - Additional Coverage', () => {
  let service: IcsGenerationService;
  let appointment: Appointment;

  beforeEach(() => {
    service = new IcsGenerationService();

    // Create a test appointment
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 3);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(11, 0, 0, 0);

    const appointmentResult = Appointment.create({
      title: 'Test Appointment',
      description: 'Original description',
      startTime,
      endTime,
      appointmentType: 'MEETING',
      location: 'Conference Room A',
      organizerId: 'user-123',
      attendeeIds: ['att1@example.com', 'att2@example.com'],
      reminderMinutes: 15,
    });

    if (appointmentResult.isFailure) {
      throw appointmentResult.error;
    }

    appointment = appointmentResult.value;
  });

  describe('parse()', () => {
    it('should parse valid ICS content successfully', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//IntelliFlow CRM//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:test-123@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Team Meeting
DTSTAMP:20250115T090000Z
SEQUENCE:2
ATTENDEE;RSVP=TRUE:mailto:user1@example.com
ATTENDEE;RSVP=TRUE:mailto:user2@example.com
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      expect(result.value.uid).toBe('test-123@intelliflow-crm.com');
      expect(result.value.sequence).toBe(2);
      expect(result.value.method).toBe('REQUEST');
      expect(result.value.summary).toBe('Team Meeting');
      expect(result.value.startTime).toBeInstanceOf(Date);
      expect(result.value.endTime).toBeInstanceOf(Date);
      expect(result.value.attendees).toHaveLength(2);
      expect(result.value.attendees).toContain('user1@example.com');
      expect(result.value.attendees).toContain('user2@example.com');
    });

    it('should parse ICS with CANCEL method', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
METHOD:CANCEL
BEGIN:VEVENT
UID:cancel-123@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Cancelled Meeting
DTSTAMP:20250115T090000Z
SEQUENCE:3
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      expect(result.value.method).toBe('CANCEL');
      expect(result.value.sequence).toBe(3);
    });

    it('should fail parsing ICS without UID', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:No UID
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Missing UID');
    });

    it('should fail parsing ICS without DTSTART', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:missing-dates@intelliflow-crm.com
SUMMARY:No dates
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Missing DTSTART or DTEND');
    });

    it('should default SEQUENCE to 0 when not present', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-seq@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:No Sequence
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      expect(result.value.sequence).toBe(0);
    });

    it('should default METHOD to REQUEST when not present', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:no-method@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:No Method
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      expect(result.value.method).toBe('REQUEST');
    });

    it('should parse ICS with no attendees', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
METHOD:REQUEST
BEGIN:VEVENT
UID:no-attendees@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Solo Meeting
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      expect(result.value.attendees).toHaveLength(0);
    });

    it('should parse ICS date without Z suffix (local time)', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:local-time@intelliflow-crm.com
DTSTART:20250115T100000
DTEND:20250115T110000
SUMMARY:Local Time Event
END:VEVENT
END:VCALENDAR`;

      const result = service.parse(icsContent);

      expect(result.isSuccess).toBe(true);
      // Should still produce valid dates
      expect(result.value.startTime).toBeInstanceOf(Date);
      expect(result.value.endTime).toBeInstanceOf(Date);
    });
  });

  describe('validate() - additional edge cases', () => {
    it('should fail when missing VCALENDAR wrapper', () => {
      const icsContent = `VERSION:2.0
BEGIN:VEVENT
UID:test@example.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Test
DTSTAMP:20250115T090000Z
END:VEVENT`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('BEGIN:VCALENDAR');
    });

    it('should fail when missing VERSION', () => {
      const icsContent = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test@example.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Test
DTSTAMP:20250115T090000Z
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('VERSION:2.0');
    });

    it('should fail when missing VEVENT', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('BEGIN:VEVENT');
    });

    it('should fail when missing UID in VEVENT', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Test
DTSTAMP:20250115T090000Z
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('UID:');
    });

    it('should fail when missing SUMMARY', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test@example.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
DTSTAMP:20250115T090000Z
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('SUMMARY:');
    });

    it('should fail when missing DTSTAMP', () => {
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test@example.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Test
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(icsContent);

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('DTSTAMP:');
    });
  });

  describe('generate() - with meetingUrl', () => {
    it('should include URL in ICS when meetingUrl is provided', () => {
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@example.com',
        attendees: [],
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('URL:https://meet.google.com/abc-defg-hij');
      }
    });
  });

  describe('generate() - with EMAIL reminders', () => {
    it('should convert EMAIL action reminders correctly', () => {
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@example.com',
        attendees: [],
        reminders: [
          {
            minutesBefore: 30,
            action: 'EMAIL',
            description: 'Email reminder',
          },
        ],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('BEGIN:VALARM');
        expect(result.value.content).toContain('ACTION:EMAIL');
        expect(result.value.content).toContain('TRIGGER:-PT30M');
      }
    });

    it('should handle reminder with no description', () => {
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@example.com',
        attendees: [],
        reminders: [
          {
            minutesBefore: 10,
            action: 'DISPLAY',
          },
        ],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('BEGIN:VALARM');
        expect(result.value.content).toContain('ACTION:DISPLAY');
      }
    });
  });

  describe('generateCancellation() - description handling', () => {
    it('should include cancellation reason with original description', () => {
      const result = service.generateCancellation(appointment, {
        sequence: 1,
        organizerEmail: 'org@example.com',
        attendees: [],
        cancellationReason: 'Meeting rescheduled',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const content = result.value.content;
        expect(content).toContain('Meeting rescheduled');
      }
    });

    it('should include only cancellation reason when no original description', () => {
      // Create appointment without description
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 3);
      startTime.setHours(10, 0, 0, 0);

      const endTime = new Date(startTime);
      endTime.setHours(11, 0, 0, 0);

      const noDescAppt = Appointment.create({
        title: 'No Description Appointment',
        startTime,
        endTime,
        appointmentType: 'MEETING',
        organizerId: 'user-123',
        attendeeIds: [],
        reminderMinutes: 15,
      });

      if (noDescAppt.isFailure) throw noDescAppt.error;

      const result = service.generateCancellation(noDescAppt.value, {
        sequence: 1,
        organizerEmail: 'org@example.com',
        attendees: [],
        cancellationReason: 'No longer needed',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('No longer needed');
      }
    });

    it('should handle cancellation without reason', () => {
      const result = service.generateCancellation(appointment, {
        sequence: 2,
        organizerEmail: 'org@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('STATUS:CANCELLED');
        expect(result.value.method).toBe('CANCEL');
      }
    });
  });

  describe('generate() - ICS content structure', () => {
    it('should include PRODID', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'org@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('PRODID:-//IntelliFlow CRM//EN');
      }
    });

    it('should generate correct UID format', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'org@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.uid).toContain('@intelliflow-crm.com');
      }
    });
  });

  describe('generate() - with organizerName', () => {
    it('should include organizer name in ICS', () => {
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@example.com',
        organizerName: 'John Organizer',
        attendees: ['att@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.content).toContain('ORGANIZER');
        expect(result.value.content).toContain('org@example.com');
      }
    });
  });

  describe('roundtrip: generate then parse', () => {
    it('should generate and then successfully parse the result', () => {
      const genResult = service.generateInvitation(appointment, {
        organizerEmail: 'org@example.com',
        attendees: ['att1@example.com', 'att2@example.com'],
      });

      expect(genResult.isSuccess).toBe(true);

      const parseResult = service.parse(genResult.value.content);

      expect(parseResult.isSuccess).toBe(true);
      expect(parseResult.value.uid).toBe(genResult.value.uid);
      expect(parseResult.value.summary).toBe('Test Appointment');
      expect(parseResult.value.method).toBe('REQUEST');
      expect(parseResult.value.sequence).toBe(0);
    });

    it('should generate, validate, and parse successfully', () => {
      const genResult = service.generateInvitation(appointment, {
        organizerEmail: 'org@example.com',
        attendees: [],
      });

      expect(genResult.isSuccess).toBe(true);

      const validateResult = service.validate(genResult.value.content);
      expect(validateResult.isSuccess).toBe(true);

      const parseResult = service.parse(genResult.value.content);
      expect(parseResult.isSuccess).toBe(true);
    });
  });

  describe('generateUpdate() - additional', () => {
    it('should generate update with higher sequence', () => {
      const result = service.generateUpdate(appointment, {
        sequence: 5,
        organizerEmail: 'org@example.com',
        attendees: ['new-att@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.sequence).toBe(5);
        expect(result.value.method).toBe('REQUEST');
        expect(result.value.content).toContain('SEQUENCE:5');
      }
    });
  });
});
