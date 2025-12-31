import { describe, it, expect, beforeEach } from 'vitest';
import { IcsGenerationService } from '../ics/IcsGenerationService';
import { Appointment, TimeSlot, Buffer, AppointmentId } from '@intelliflow/domain';
import type { IcsMethod } from '@intelliflow/application';

describe('IcsGenerationService', () => {
  let service: IcsGenerationService;
  let appointment: Appointment;

  beforeEach(() => {
    service = new IcsGenerationService();

    // Create a test appointment in the future (3 days from now at 10am)
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 3);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(11, 0, 0, 0);

    const appointmentResult = Appointment.create({
      title: 'Test Appointment',
      description: 'This is a test appointment',
      startTime,
      endTime,
      appointmentType: 'MEETING',
      location: 'Conference Room A',
      organizerId: 'user-123',
      attendeeIds: ['attendee-1@example.com', 'attendee-2@example.com'],
      reminderMinutes: 15,
    });

    if (appointmentResult.isFailure) {
      throw appointmentResult.error;
    }

    appointment = appointmentResult.value;
  });

  describe('generateInvitation', () => {
    it('should generate RFC 5545 compliant ICS for new appointment', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: ['attendee-1@example.com', 'attendee-2@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('BEGIN:VCALENDAR');
        expect(ics.content).toContain('VERSION:2.0');
        expect(ics.content).toContain('BEGIN:VEVENT');
        expect(ics.content).toContain('END:VEVENT');
        expect(ics.content).toContain('END:VCALENDAR');
        expect(ics.mimeType).toBe('text/calendar; charset=utf-8');
      }
    });

    it('should set METHOD:REQUEST and SEQUENCE:0 for new invitation', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: ['attendee-1@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.method).toBe('REQUEST');
        expect(ics.sequence).toBe(0);
        expect(ics.content).toContain('METHOD:REQUEST');
        expect(ics.content).toContain('SEQUENCE:0');
      }
    });

    it('should include all required VEVENT fields', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: ['attendee-1@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        // Required fields per RFC 5545
        expect(ics.content).toMatch(/UID:[^\r\n]+/);
        expect(ics.content).toMatch(/DTSTART:[^\r\n]+/);
        expect(ics.content).toMatch(/DTEND:[^\r\n]+/);
        expect(ics.content).toContain('SUMMARY:Test Appointment');
        expect(ics.content).toMatch(/DTSTAMP:[^\r\n]+/);
      }
    });

    it('should format dates in UTC with Z suffix', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        // Dates should be in format: YYYYMMDDTHHmmssZ
        expect(ics.content).toMatch(/DTSTART:\d{8}T\d{6}Z/);
        expect(ics.content).toMatch(/DTEND:\d{8}T\d{6}Z/);
      }
    });

    it('should include VALARM component for reminders', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
        reminders: [{
          minutesBefore: 15,
          action: 'DISPLAY',
          description: 'Reminder: Meeting in 15 minutes',
        }],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('BEGIN:VALARM');
        expect(ics.content).toContain('ACTION:DISPLAY');
        expect(ics.content).toContain('TRIGGER:-PT15M'); // 15 minutes before
        expect(ics.content).toContain('END:VALARM');
      }
    });

    it('should include attendees in ICS', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: ['attendee-1@example.com', 'attendee-2@example.com'],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('ATTENDEE');
        // RFC 5545 allows line folding, so remove whitespace for comparison
        const contentNoWhitespace = ics.content.replace(/\s+/g, '');
        expect(contentNoWhitespace).toContain('attendee-1@example.com');
        expect(contentNoWhitespace).toContain('attendee-2@example.com');
      }
    });

    it('should include organizer in ICS', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('ORGANIZER');
        expect(ics.content).toContain('organizer@example.com');
      }
    });

    it('should include location if provided', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('LOCATION:Conference Room A');
      }
    });

    it('should include description if provided', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('DESCRIPTION:This is a test appointment');
      }
    });

    it('should generate valid filename', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.filename).toMatch(/appointment-.*\.ics/);
        expect(ics.filename).toContain('.ics');
      }
    });

    it('should calculate ICS content size', () => {
      const result = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.size).toBe(ics.content.length);
        expect(ics.size).toBeGreaterThan(0);
      }
    });
  });

  describe('generateUpdate', () => {
    it('should increment SEQUENCE number', () => {
      const result = service.generateUpdate(appointment, {
        sequence: 1,
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.sequence).toBe(1);
        expect(ics.content).toContain('SEQUENCE:1');
      }
    });

    it('should maintain same UID across updates', () => {
      const firstResult = service.generateInvitation(appointment, {
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      const secondResult = service.generateUpdate(appointment, {
        sequence: 1,
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(firstResult.isSuccess).toBe(true);
      expect(secondResult.isSuccess).toBe(true);

      if (firstResult.isSuccess && secondResult.isSuccess) {
        expect(firstResult.value.uid).toBe(secondResult.value.uid);
      }
    });

    it('should set METHOD:REQUEST for updates', () => {
      const result = service.generateUpdate(appointment, {
        sequence: 2,
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.method).toBe('REQUEST');
        expect(ics.content).toContain('METHOD:REQUEST');
      }
    });
  });

  describe('generateCancellation', () => {
    it('should set METHOD:CANCEL', () => {
      const result = service.generateCancellation(appointment, {
        sequence: 1,
        organizerEmail: 'organizer@example.com',
        attendees: [],
        cancellationReason: 'Meeting no longer needed',
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.method).toBe('CANCEL');
        expect(ics.content).toContain('METHOD:CANCEL');
      }
    });

    it('should set STATUS:CANCELLED', () => {
      const result = service.generateCancellation(appointment, {
        sequence: 1,
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain('STATUS:CANCELLED');
      }
    });

    it('should include cancellation reason in DESCRIPTION', () => {
      const reason = 'Meeting cancelled due to conflict';
      const result = service.generateCancellation(appointment, {
        sequence: 1,
        organizerEmail: 'organizer@example.com',
        attendees: [],
        cancellationReason: reason,
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.content).toContain(reason);
      }
    });

    it('should maintain SEQUENCE continuity', () => {
      const result = service.generateCancellation(appointment, {
        sequence: 3,
        organizerEmail: 'organizer@example.com',
        attendees: [],
      });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        const ics = result.value;
        expect(ics.sequence).toBe(3);
        expect(ics.content).toContain('SEQUENCE:3');
      }
    });
  });

  describe('validate', () => {
    it('should pass valid RFC 5545 ICS content', () => {
      const validIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//IntelliFlow CRM//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:test-123@intelliflow-crm.com
DTSTART:20250115T100000Z
DTEND:20250115T110000Z
SUMMARY:Test Event
DTSTAMP:20250115T090000Z
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(validIcs);
      expect(result.isSuccess).toBe(true);
    });

    it('should fail on missing required fields', () => {
      const invalidIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Test Event
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(invalidIcs);
      expect(result.isSuccess).toBe(false);
    });

    it('should fail on invalid date formats', () => {
      const invalidIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test@example.com
DTSTART:invalid-date
DTEND:2025-01-15
SUMMARY:Test
END:VEVENT
END:VCALENDAR`;

      const result = service.validate(invalidIcs);
      expect(result.isSuccess).toBe(false);
    });
  });

  describe('generateUid', () => {
    it('should generate UID in correct format', () => {
      const appointmentId = 'appt-12345';
      const uid = service.generateUid(appointmentId);

      expect(uid).toBe('appt-12345@intelliflow-crm.com');
    });

    it('should be consistent for same appointment ID', () => {
      const appointmentId = 'appt-67890';
      const uid1 = service.generateUid(appointmentId);
      const uid2 = service.generateUid(appointmentId);

      expect(uid1).toBe(uid2);
    });
  });
});
