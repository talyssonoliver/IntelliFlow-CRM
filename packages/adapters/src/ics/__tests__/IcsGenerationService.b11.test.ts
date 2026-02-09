/**
 * IcsGenerationService Tests - b11
 *
 * Targets uncovered branches:
 * - generate() catch block (exception case)
 * - generate() error from createEvent (error.message fallback)
 * - generate() empty value from createEvent
 * - validate() missing fields, invalid dates, catch block
 * - parse() missing UID, missing DTSTART/DTEND, catch block
 * - buildDescription() with CANCEL + cancellationReason + existing description
 * - buildDescription() with CANCEL + cancellationReason without description
 * - addMethod() without PRODID (fallback to VERSION line)
 * - addMethod() with neither PRODID nor VERSION
 * - convertReminderToAlarm() with EMAIL action
 * - parseIcsDate() non-UTC date
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('ics', () => ({
  createEvent: vi.fn(),
}));

import { IcsGenerationService } from '../IcsGenerationService';
import { createEvent } from 'ics';
import { Result } from '@intelliflow/domain';

const mockCreateEvent = vi.mocked(createEvent);

function makeMockAppointment(overrides: Record<string, unknown> = {}): any {
  return {
    id: { value: 'appt-001' },
    title: overrides.title ?? 'Test Meeting',
    description: overrides.description ?? 'A test meeting',
    location: overrides.location ?? 'Room A',
    startTime: overrides.startTime ?? new Date('2025-06-15T10:00:00Z'),
    endTime: overrides.endTime ?? new Date('2025-06-15T11:00:00Z'),
    organizerId: 'org-123',
    attendeeIds: ['attendee@test.com'],
    reminderMinutes: overrides.reminderMinutes ?? undefined,
    ...overrides,
  };
}

describe('IcsGenerationService - b11', () => {
  let service: IcsGenerationService;

  beforeEach(() => {
    service = new IcsGenerationService();
    mockCreateEvent.mockReset();
  });

  describe('generate() error paths', () => {
    it('should handle createEvent returning an error object', () => {
      mockCreateEvent.mockReturnValue({
        error: new Error('ICS library error') as any,
        value: undefined as any,
      });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to create ICS event');
    });

    it('should handle createEvent returning error without message', () => {
      mockCreateEvent.mockReturnValue({
        error: { toString: () => 'some error' } as any,
        value: undefined as any,
      });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Failed to create ICS event');
    });

    it('should handle createEvent returning empty value', () => {
      mockCreateEvent.mockReturnValue({
        error: undefined as any,
        value: '' as any,
      });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('empty content');
    });

    it('should handle exception thrown in generate', () => {
      mockCreateEvent.mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('ICS generation failed');
    });

    it('should handle non-Error exception in generate', () => {
      mockCreateEvent.mockImplementation(() => {
        throw 'string error';
      });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('string error');
    });
  });

  describe('generate() with reminders and meetingUrl', () => {
    it('should include alarms when reminders are provided', () => {
      const icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockCreateEvent.mockReturnValue({ error: undefined as any, value: icsContent as any });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
        reminders: [
          { minutesBefore: 15, action: 'DISPLAY', description: 'Reminder' },
          { minutesBefore: 60, action: 'EMAIL', description: 'Email reminder' },
        ],
        meetingUrl: 'https://meet.example.com/123',
      });

      expect(result.isSuccess).toBe(true);
      // Verify createEvent was called with alarms and url
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          alarms: expect.arrayContaining([
            expect.objectContaining({ action: 'display' }),
            expect.objectContaining({ action: 'email' }),
          ]),
          url: 'https://meet.example.com/123',
        })
      );
    });
  });

  describe('generate() with CANCEL method', () => {
    it('should set status to CANCELLED and include cancellation reason in description', () => {
      const icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockCreateEvent.mockReturnValue({ error: undefined as any, value: icsContent as any });

      const appointment = makeMockAppointment({ description: 'Original desc' });
      const result = service.generate(appointment, {
        method: 'CANCEL',
        sequence: 2,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
        cancellationReason: 'Meeting cancelled by organizer',
      });

      expect(result.isSuccess).toBe(true);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'CANCELLED',
          description: expect.stringContaining('Meeting cancelled by organizer'),
        })
      );
    });

    it('should handle CANCEL with cancellationReason but no description', () => {
      const icsContent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockCreateEvent.mockReturnValue({ error: undefined as any, value: icsContent as any });

      const appointment = makeMockAppointment({ description: undefined });
      const result = service.generate(appointment, {
        method: 'CANCEL',
        sequence: 2,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
        cancellationReason: 'Cancelled',
      });

      expect(result.isSuccess).toBe(true);
      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Cancelled',
        })
      );
    });
  });

  describe('addMethod() edge cases', () => {
    it('should add METHOD after VERSION when no PRODID', () => {
      const icsWithoutProdId = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockCreateEvent.mockReturnValue({ error: undefined as any, value: icsWithoutProdId as any });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.content).toContain('METHOD:REQUEST');
    });

    it('should return content as-is when neither PRODID nor VERSION found', () => {
      const weirdIcs = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR';
      mockCreateEvent.mockReturnValue({ error: undefined as any, value: weirdIcs as any });

      const appointment = makeMockAppointment();
      const result = service.generate(appointment, {
        method: 'REQUEST',
        sequence: 0,
        organizerEmail: 'org@test.com',
        attendees: ['a@test.com'],
      });

      expect(result.isSuccess).toBe(true);
      // Without PRODID or VERSION, the method should not be added
      expect(result.value.content).toBe(weirdIcs);
    });
  });

  describe('validate()', () => {
    it('should validate valid ICS content', () => {
      const validIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'DTSTART:20250615T100000Z',
        'DTEND:20250615T110000Z',
        'DTSTAMP:20250615T090000Z',
        'SUMMARY:Test',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.validate(validIcs);
      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should fail when required field is missing', () => {
      const invalidIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.validate(invalidIcs);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Missing required field');
    });

    it('should fail when date fields are invalid or missing', () => {
      const noDateIcs = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'SUMMARY:Test',
        'DTSTAMP:nodate',
        'DTSTART:nodate',
        'DTEND:nodate',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.validate(noDateIcs);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Invalid or missing date fields');
    });
  });

  describe('parse()', () => {
    it('should parse valid ICS content', () => {
      const icsContent = [
        'BEGIN:VCALENDAR',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:appt-001@intelliflow-crm.com',
        'SEQUENCE:2',
        'SUMMARY:Test Meeting',
        'DTSTART:20250615T100000Z',
        'DTEND:20250615T110000Z',
        'ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:user@test.com',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.parse(icsContent);
      expect(result.isSuccess).toBe(true);
      expect(result.value.uid).toBe('appt-001@intelliflow-crm.com');
      expect(result.value.sequence).toBe(2);
      expect(result.value.method).toBe('REQUEST');
      expect(result.value.summary).toBe('Test Meeting');
      expect(result.value.attendees).toContain('user@test.com');
    });

    it('should fail when UID is missing', () => {
      const noUidIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'SUMMARY:Test',
        'DTSTART:20250615T100000Z',
        'DTEND:20250615T110000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.parse(noUidIcs);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Missing UID');
    });

    it('should fail when DTSTART or DTEND is missing', () => {
      const noDatesIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'SUMMARY:Test',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.parse(noDatesIcs);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Missing DTSTART or DTEND');
    });

    it('should handle parse exception gracefully', () => {
      // Pass null-like content that causes an exception
      const result = service.parse(null as any);
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Parse failed');
    });

    it('should use default values when SEQUENCE and METHOD are missing', () => {
      const minIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'SUMMARY:Test',
        'DTSTART:20250615T100000Z',
        'DTEND:20250615T110000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.parse(minIcs);
      expect(result.isSuccess).toBe(true);
      expect(result.value.sequence).toBe(0);
      expect(result.value.method).toBe('REQUEST');
    });
  });

  describe('parseIcsDate() - non-UTC', () => {
    it('should parse non-UTC date (without Z suffix)', () => {
      const localIcs = [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'SUMMARY:Local Time',
        'DTSTART:20250615T100000',
        'DTEND:20250615T110000',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const result = service.parse(localIcs);
      expect(result.isSuccess).toBe(true);
      // Non-UTC, should use local time constructor
      expect(result.value.startTime).toBeDefined();
    });
  });

  describe('generateUid()', () => {
    it('should generate consistent UID', () => {
      const uid = service.generateUid('appt-123');
      expect(uid).toBe('appt-123@intelliflow-crm.com');
    });
  });
});

// Need the import at the top level for beforeEach
import { beforeEach } from 'vitest';
