/**
 * AppointmentIcsEventHandler Tests - b11
 *
 * Targets uncovered branches:
 * - ICS generation failure paths (invitation, update, cancellation)
 * - Email send failure paths for each handler
 * - Exception/catch block in each handler
 * - Rescheduled event without reason
 * - Cancelled event without reason
 * - Appointment without location/description (email body branches)
 * - Appointment without reminderMinutes (getReminders returning undefined)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppointmentIcsEventHandler } from '../AppointmentIcsEventHandler';
import {
  Appointment,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
  TimeSlot,
  Result,
  DomainError,
} from '@intelliflow/domain';
import type {
  IcsGenerationServicePort,
  NotificationServicePort,
  GeneratedIcs,
  NotificationResult,
} from '../../ports/external';

describe('AppointmentIcsEventHandler - b11', () => {
  let handler: AppointmentIcsEventHandler;
  let mockIcsService: IcsGenerationServicePort;
  let mockNotificationService: NotificationServicePort;
  let appointment: Appointment;
  let appointmentNoLocation: Appointment;

  beforeEach(() => {
    mockIcsService = {
      generateInvitation: vi.fn(),
      generateUpdate: vi.fn(),
      generateCancellation: vi.fn(),
      generate: vi.fn(),
      validate: vi.fn(),
      parse: vi.fn(),
      generateUid: vi.fn((id: string) => `${id}@intelliflow-crm.com`),
    };

    mockNotificationService = {
      sendEmail: vi.fn(),
      sendSms: vi.fn(),
      sendPush: vi.fn(),
      schedule: vi.fn(),
      cancelScheduled: vi.fn(),
      getStatus: vi.fn(),
      sendBatch: vi.fn(),
      validateEmail: vi.fn(() => true),
      validatePhoneNumber: vi.fn(() => true),
    };

    handler = new AppointmentIcsEventHandler(mockIcsService, mockNotificationService);

    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 3);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(11, 0, 0, 0);

    // With location, description, and reminders
    const result1 = Appointment.create({
      title: 'Test Meeting',
      description: 'Test description',
      startTime,
      endTime,
      appointmentType: 'MEETING',
      location: 'Conference Room',
      organizerId: 'org-123',
      attendeeIds: ['attendee1@example.com'],
      reminderMinutes: 15,
    });
    if (result1.isFailure) throw result1.error;
    appointment = result1.value;

    // Without location, description, or reminders
    const result2 = Appointment.create({
      title: 'Minimal Meeting',
      startTime,
      endTime,
      appointmentType: 'MEETING',
      organizerId: 'org-456',
      attendeeIds: ['attendee2@example.com'],
    });
    if (result2.isFailure) throw result2.error;
    appointmentNoLocation = result2.value;
  });

  describe('handleAppointmentCreated - failure paths', () => {
    it('should handle ICS generation failure gracefully', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      vi.mocked(mockIcsService.generateInvitation).mockReturnValue(
        Result.fail(new DomainError('ICS gen failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCreated(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ICS generation failed'),
        expect.anything()
      );
      expect(mockNotificationService.sendEmail).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle email send failure gracefully', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'REQUEST',
        sequence: 0,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateInvitation).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.fail(new DomainError('Email failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCreated(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email send failed'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should handle exception in handleAppointmentCreated', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      vi.mocked(mockIcsService.generateInvitation).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCreated(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling appointment created'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should build email body without location and description', async () => {
      const event = new AppointmentCreatedEvent(
        appointmentNoLocation.id,
        appointmentNoLocation.title,
        appointmentNoLocation.timeSlot,
        appointmentNoLocation.appointmentType,
        appointmentNoLocation.organizerId
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'REQUEST',
        sequence: 0,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateInvitation).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({ id: '1', channel: 'email', status: 'sent' } as NotificationResult)
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handler.handleAppointmentCreated(event, appointmentNoLocation);

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlBody: expect.not.stringContaining('Where:'),
          textBody: expect.not.stringContaining('Where:'),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleAppointmentRescheduled - failure paths', () => {
    it('should handle ICS update generation failure', async () => {
      handler['sequenceStore'].set(appointment.id.value, 0);

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        appointment.timeSlot,
        appointment.timeSlot,
        'user-123'
      );

      vi.mocked(mockIcsService.generateUpdate).mockReturnValue(
        Result.fail(new DomainError('ICS update gen failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentRescheduled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ICS update generation failed'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should handle email send failure in reschedule', async () => {
      handler['sequenceStore'].set(appointment.id.value, 0);

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        appointment.timeSlot,
        appointment.timeSlot,
        'user-123',
        'Schedule conflict'
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'REQUEST',
        sequence: 1,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateUpdate).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.fail(new DomainError('Email failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentRescheduled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reschedule email send failed'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should handle exception in handleAppointmentRescheduled', async () => {
      handler['sequenceStore'].set(appointment.id.value, 0);

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        appointment.timeSlot,
        appointment.timeSlot,
        'user-123'
      );

      vi.mocked(mockIcsService.generateUpdate).mockImplementation(() => {
        throw new Error('Unexpected');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentRescheduled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling appointment rescheduled'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should use default reason when event has no reason', async () => {
      handler['sequenceStore'].set(appointment.id.value, 0);

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        appointment.timeSlot,
        appointment.timeSlot,
        'user-123'
        // No reason
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'REQUEST',
        sequence: 1,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateUpdate).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({ id: '1', channel: 'email', status: 'sent' } as NotificationResult)
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handler.handleAppointmentRescheduled(event, appointment);

      // Should use default reason text
      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlBody: expect.stringContaining('appointment time has been changed'),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handleAppointmentCancelled - failure paths', () => {
    it('should handle ICS cancellation generation failure', async () => {
      handler['sequenceStore'].set(appointment.id.value, 1);

      const event = new AppointmentCancelledEvent(appointment.id, 'user-123', 'Not needed');

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(
        Result.fail(new DomainError('ICS cancel gen failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCancelled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ICS cancellation generation failed'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should handle email send failure in cancellation', async () => {
      handler['sequenceStore'].set(appointment.id.value, 1);

      const event = new AppointmentCancelledEvent(appointment.id, 'user-123', 'Not needed');

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'CANCEL',
        sequence: 2,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.fail(new DomainError('Email failed'))
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCancelled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cancellation email send failed'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should handle exception in handleAppointmentCancelled', async () => {
      handler['sequenceStore'].set(appointment.id.value, 1);

      const event = new AppointmentCancelledEvent(appointment.id, 'user-123', 'reason');

      vi.mocked(mockIcsService.generateCancellation).mockImplementation(() => {
        throw new Error('Unexpected');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handler.handleAppointmentCancelled(event, appointment);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error handling appointment cancelled'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('should use default cancellation reason when event has no reason', async () => {
      handler['sequenceStore'].set(appointment.id.value, 0);

      const event = new AppointmentCancelledEvent(
        appointment.id,
        'user-123'
        // No reason
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: 100,
        method: 'CANCEL',
        sequence: 1,
        uid: 'uid@test.com',
      };

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(Result.ok(mockIcs));
      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({ id: '1', channel: 'email', status: 'sent' } as NotificationResult)
      );

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handler.handleAppointmentCancelled(event, appointment);

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          textBody: expect.stringContaining('has been cancelled'),
        })
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getReminders', () => {
    it('should return undefined when appointment has no reminderMinutes', async () => {
      // Test appointment without reminderMinutes
      const reminders = handler['getReminders'](appointmentNoLocation);
      expect(reminders).toBeUndefined();
    });
  });

  describe('getMeetingUrl', () => {
    it('should return undefined (placeholder implementation)', async () => {
      const url = handler['getMeetingUrl'](appointment);
      expect(url).toBeUndefined();
    });
  });
});
