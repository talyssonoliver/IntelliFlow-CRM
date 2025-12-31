import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppointmentIcsEventHandler } from '../AppointmentIcsEventHandler';
import {
  Appointment,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
  AppointmentId,
  TimeSlot,
  Result
} from '@intelliflow/domain';
import type {
  IcsGenerationServicePort,
  NotificationServicePort,
  GeneratedIcs,
  NotificationResult,
} from '../../ports/external';

describe('AppointmentIcsEventHandler', () => {
  let handler: AppointmentIcsEventHandler;
  let mockIcsService: IcsGenerationServicePort;
  let mockNotificationService: NotificationServicePort;
  let appointment: Appointment;

  beforeEach(() => {
    // Create mock ICS generation service
    mockIcsService = {
      generateInvitation: vi.fn(),
      generateUpdate: vi.fn(),
      generateCancellation: vi.fn(),
      generate: vi.fn(),
      validate: vi.fn(),
      parse: vi.fn(),
      generateUid: vi.fn((id: string) => `${id}@intelliflow-crm.com`),
    };

    // Create mock notification service
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

    handler = new AppointmentIcsEventHandler(
      mockIcsService,
      mockNotificationService
    );

    // Create test appointment
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 3);
    startTime.setHours(10, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(11, 0, 0, 0);

    const result = Appointment.create({
      title: 'Test Meeting',
      description: 'Test description',
      startTime,
      endTime,
      appointmentType: 'MEETING',
      location: 'Conference Room',
      organizerId: 'org-123',
      attendeeIds: ['attendee1@example.com', 'attendee2@example.com'],
      reminderMinutes: 15,
    });

    if (result.isFailure) {
      throw result.error;
    }

    appointment = result.value;
  });

  describe('handleAppointmentCreated', () => {
    it('should generate ICS invitation with SEQUENCE:0', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'REQUEST',
        sequence: 0,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateInvitation).mockReturnValue(
        Result.ok(mockIcs)
      );

      const mockEmailResult: NotificationResult = {
        id: 'email-123',
        channel: 'email',
        status: 'sent',
        sentAt: new Date(),
      };

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok(mockEmailResult)
      );

      await handler.handleAppointmentCreated(event, appointment);

      expect(mockIcsService.generateInvitation).toHaveBeenCalledWith(
        appointment,
        expect.objectContaining({
          organizerEmail: expect.any(String),
          attendees: appointment.attendeeIds,
        })
      );

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: appointment.attendeeIds,
          subject: expect.stringContaining(appointment.title),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: mockIcs.filename,
              content: mockIcs.content,
              contentType: 'text/calendar; method=REQUEST',
            }),
          ]),
        })
      );
    });

    it('should store initial sequence number as 0', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'REQUEST',
        sequence: 0,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateInvitation).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentCreated(event, appointment);

      const sequence = await handler.getSequenceNumber(appointment.id.value);
      expect(sequence).toBe(0);
    });
  });

  describe('handleAppointmentRescheduled', () => {
    it('should generate ICS update with incremented SEQUENCE', async () => {
      // Set up initial sequence
      await handler['sequenceStore'].set(appointment.id.value, 0);

      const previousTimeSlot = appointment.timeSlot;
      const newStartTime = new Date();
      newStartTime.setDate(newStartTime.getDate() + 5);
      newStartTime.setHours(14, 0, 0, 0);

      const newEndTime = new Date(newStartTime);
      newEndTime.setHours(15, 0, 0, 0);

      const newTimeSlot = TimeSlot.create(newStartTime, newEndTime).value;

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        previousTimeSlot,
        newTimeSlot,
        'user-123',
        'Schedule conflict'
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'REQUEST',
        sequence: 1,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateUpdate).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentRescheduled(event, appointment);

      expect(mockIcsService.generateUpdate).toHaveBeenCalledWith(
        appointment,
        expect.objectContaining({
          sequence: 1,
          organizerEmail: expect.any(String),
        })
      );

      const sequence = await handler.getSequenceNumber(appointment.id.value);
      expect(sequence).toBe(1);
    });

    it('should send email with rescheduled subject', async () => {
      await handler['sequenceStore'].set(appointment.id.value, 0);

      const previousTimeSlot = appointment.timeSlot;
      const newTimeSlot = appointment.timeSlot; // Use same for simplicity

      const event = new AppointmentRescheduledEvent(
        appointment.id,
        previousTimeSlot,
        newTimeSlot,
        'user-123'
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'REQUEST',
        sequence: 1,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateUpdate).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentRescheduled(event, appointment);

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/rescheduled/i),
        })
      );
    });
  });

  describe('handleAppointmentCancelled', () => {
    it('should generate ICS cancellation with METHOD:CANCEL', async () => {
      await handler['sequenceStore'].set(appointment.id.value, 2);

      const event = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        'Meeting no longer needed'
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'CANCEL',
        sequence: 3,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentCancelled(event, appointment);

      expect(mockIcsService.generateCancellation).toHaveBeenCalledWith(
        appointment,
        expect.objectContaining({
          sequence: 3,
          cancellationReason: 'Meeting no longer needed',
        })
      );
    });

    it('should send email with cancelled subject', async () => {
      await handler['sequenceStore'].set(appointment.id.value, 1);

      const event = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        'Cancelled'
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'CANCEL',
        sequence: 2,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentCancelled(event, appointment);

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/cancelled/i),
        })
      );
    });

    it('should include cancellation reason in email body', async () => {
      await handler['sequenceStore'].set(appointment.id.value, 0);

      const cancellationReason = 'Emergency situation';
      const event = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        cancellationReason
      );

      const mockIcs: GeneratedIcs = {
        content: 'BEGIN:VCALENDAR...',
        filename: 'appointment-123.ics',
        mimeType: 'text/calendar; charset=utf-8',
        size: 500,
        method: 'CANCEL',
        sequence: 1,
        uid: 'test-uid@example.com',
      };

      vi.mocked(mockIcsService.generateCancellation).mockReturnValue(
        Result.ok(mockIcs)
      );

      vi.mocked(mockNotificationService.sendEmail).mockResolvedValue(
        Result.ok({
          id: 'email-123',
          channel: 'email',
          status: 'sent',
        } as NotificationResult)
      );

      await handler.handleAppointmentCancelled(event, appointment);

      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlBody: expect.stringContaining(cancellationReason),
        })
      );
    });
  });

  describe('sequence number management', () => {
    it('should initialize sequence to 0 for new appointments', async () => {
      const sequence = await handler.getSequenceNumber('new-appt-123');
      expect(sequence).toBe(0);
    });

    it('should increment sequence number correctly', async () => {
      const appointmentId = 'appt-456';

      await handler['sequenceStore'].set(appointmentId, 0);
      await handler.incrementSequence(appointmentId);
      let sequence = await handler.getSequenceNumber(appointmentId);
      expect(sequence).toBe(1);

      await handler.incrementSequence(appointmentId);
      sequence = await handler.getSequenceNumber(appointmentId);
      expect(sequence).toBe(2);
    });
  });
});
