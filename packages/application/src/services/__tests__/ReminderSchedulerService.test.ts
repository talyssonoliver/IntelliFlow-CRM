import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReminderSchedulerService } from '../ReminderSchedulerService';
import {
  Appointment,
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentCancelledEvent,
  TimeSlot,
  Result,
} from '@intelliflow/domain';
import type {
  NotificationServicePort,
  ScheduledNotification,
  NotificationChannel,
} from '../../ports/external';

describe('ReminderSchedulerService', () => {
  let service: ReminderSchedulerService;
  let mockNotificationService: NotificationServicePort;
  let appointment: Appointment;

  beforeEach(() => {
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

    service = new ReminderSchedulerService(mockNotificationService);

    // Create test appointment 3 days in future
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
    it('should schedule reminder based on reminderMinutes', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockScheduled: ScheduledNotification = {
        id: 'reminder-123',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(mockScheduled)
      );

      await service.handleAppointmentCreated(event, appointment);

      // Should calculate trigger time as startTime - reminderMinutes
      const expectedTriggerTime = new Date(appointment.startTime);
      expectedTriggerTime.setMinutes(expectedTriggerTime.getMinutes() - 15);

      expect(mockNotificationService.schedule).toHaveBeenCalledWith(
        'email',
        expect.any(Date),
        expect.objectContaining({
          to: appointment.attendeeIds,
          subject: expect.stringContaining(appointment.title),
        }),
        'high'
      );

      // Verify trigger time is correct (within 1 second tolerance)
      const actualTriggerTime = vi.mocked(mockNotificationService.schedule).mock.calls[0][1];
      const timeDiff = Math.abs(actualTriggerTime.getTime() - expectedTriggerTime.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });

    it('should not schedule reminder if reminderMinutes is not set', async () => {
      // Create appointment without reminder
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 3);
      startTime.setHours(10, 0, 0, 0);

      const endTime = new Date(startTime);
      endTime.setHours(11, 0, 0, 0);

      const noReminderResult = Appointment.create({
        title: 'No Reminder Meeting',
        startTime,
        endTime,
        appointmentType: 'MEETING',
        organizerId: 'org-123',
        attendeeIds: ['attendee1@example.com'],
        reminderMinutes: undefined,
      });

      const noReminderAppointment = noReminderResult.value;

      const event = new AppointmentCreatedEvent(
        noReminderAppointment.id,
        noReminderAppointment.title,
        noReminderAppointment.timeSlot,
        noReminderAppointment.appointmentType,
        noReminderAppointment.organizerId
      );

      await service.handleAppointmentCreated(event, noReminderAppointment);

      expect(mockNotificationService.schedule).not.toHaveBeenCalled();
    });

    it('should store reminder ID for future cancellation', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockScheduled: ScheduledNotification = {
        id: 'reminder-456',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(mockScheduled)
      );

      await service.handleAppointmentCreated(event, appointment);

      const reminderIds = await service.getReminderIds(appointment.id.value);
      expect(reminderIds).toContain('reminder-456');
    });

    it('should include appointment details in reminder notification', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const mockScheduled: ScheduledNotification = {
        id: 'reminder-789',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(mockScheduled)
      );

      await service.handleAppointmentCreated(event, appointment);

      const scheduleCall = vi.mocked(mockNotificationService.schedule).mock.calls[0];
      expect(scheduleCall[0]).toBe('email');
      expect(scheduleCall[1]).toBeInstanceOf(Date);
      expect(scheduleCall[2].subject).toContain('Reminder');
      expect(scheduleCall[2].subject).toContain(appointment.title);
      expect(scheduleCall[2].htmlBody).toContain(appointment.title);
      expect(scheduleCall[2].htmlBody).toContain(appointment.location!);
      expect(scheduleCall[3]).toBe('high');
    });
  });

  describe('handleAppointmentRescheduled', () => {
    it('should cancel old reminders and schedule new ones', async () => {
      // First, create initial reminder
      const createEvent = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const initialReminder: ScheduledNotification = {
        id: 'reminder-old',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(initialReminder)
      );

      await service.handleAppointmentCreated(createEvent, appointment);

      // Now reschedule
      const previousTimeSlot = appointment.timeSlot;

      const newStartTime = new Date();
      newStartTime.setDate(newStartTime.getDate() + 5);
      newStartTime.setHours(14, 0, 0, 0);

      const newEndTime = new Date(newStartTime);
      newEndTime.setHours(15, 0, 0, 0);

      const newTimeSlot = TimeSlot.create(newStartTime, newEndTime).value;

      const rescheduleEvent = new AppointmentRescheduledEvent(
        appointment.id,
        previousTimeSlot,
        newTimeSlot,
        'user-123',
        'Schedule conflict'
      );

      const newReminder: ScheduledNotification = {
        id: 'reminder-new',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(newReminder)
      );

      vi.mocked(mockNotificationService.cancelScheduled).mockResolvedValue(
        Result.ok(undefined)
      );

      // Service uses appointment.id.value to look up reminders, so we can pass
      // the original appointment object (the id is what matters)
      await service.handleAppointmentRescheduled(rescheduleEvent, appointment);

      // Should cancel old reminder
      expect(mockNotificationService.cancelScheduled).toHaveBeenCalledWith('reminder-old');

      // Should schedule new reminder (2nd call to schedule)
      expect(mockNotificationService.schedule).toHaveBeenCalledTimes(2);

      // Verify second schedule call is for email with high priority
      const secondScheduleCall = vi.mocked(mockNotificationService.schedule).mock.calls[1];
      expect(secondScheduleCall[0]).toBe('email');
      expect(secondScheduleCall[1]).toBeInstanceOf(Date);
      expect(secondScheduleCall[3]).toBe('high');
    });

    it('should handle rescheduling when no previous reminders exist', async () => {
      const previousTimeSlot = appointment.timeSlot;

      const newStartTime = new Date();
      newStartTime.setDate(newStartTime.getDate() + 5);
      newStartTime.setHours(14, 0, 0, 0);

      const newEndTime = new Date(newStartTime);
      newEndTime.setHours(15, 0, 0, 0);

      const newTimeSlot = TimeSlot.create(newStartTime, newEndTime).value;

      const rescheduleEvent = new AppointmentRescheduledEvent(
        appointment.id,
        previousTimeSlot,
        newTimeSlot,
        'user-123'
      );

      const newReminder: ScheduledNotification = {
        id: 'reminder-new',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(newReminder)
      );

      const updatedAppointment = Appointment.create({
        title: appointment.title,
        startTime: newStartTime,
        endTime: newEndTime,
        appointmentType: appointment.appointmentType,
        organizerId: appointment.organizerId,
        attendeeIds: [...appointment.attendeeIds],
        reminderMinutes: appointment.reminderMinutes,
      }).value;

      await service.handleAppointmentRescheduled(rescheduleEvent, updatedAppointment);

      // Should not attempt to cancel (no previous reminders)
      expect(mockNotificationService.cancelScheduled).not.toHaveBeenCalled();

      // Should still schedule new reminder
      expect(mockNotificationService.schedule).toHaveBeenCalled();
    });
  });

  describe('handleAppointmentCancelled', () => {
    it('should cancel all scheduled reminders', async () => {
      // First, create reminder
      const createEvent = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const reminder: ScheduledNotification = {
        id: 'reminder-cancel',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(reminder)
      );

      await service.handleAppointmentCreated(createEvent, appointment);

      // Now cancel
      const cancelEvent = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        'Meeting no longer needed'
      );

      vi.mocked(mockNotificationService.cancelScheduled).mockResolvedValue(
        Result.ok(undefined)
      );

      await service.handleAppointmentCancelled(cancelEvent, appointment);

      expect(mockNotificationService.cancelScheduled).toHaveBeenCalledWith('reminder-cancel');
    });

    it('should handle cancellation when no reminders exist', async () => {
      const cancelEvent = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        'Cancelled'
      );

      vi.mocked(mockNotificationService.cancelScheduled).mockResolvedValue(
        Result.ok(undefined)
      );

      await service.handleAppointmentCancelled(cancelEvent, appointment);

      // Should not throw error, gracefully handle no reminders
      expect(mockNotificationService.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should clear reminder IDs after cancellation', async () => {
      // First, create reminder
      const createEvent = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const reminder: ScheduledNotification = {
        id: 'reminder-clear',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(reminder)
      );

      await service.handleAppointmentCreated(createEvent, appointment);

      // Verify reminder is stored
      let reminderIds = await service.getReminderIds(appointment.id.value);
      expect(reminderIds).toContain('reminder-clear');

      // Now cancel
      const cancelEvent = new AppointmentCancelledEvent(
        appointment.id,
        'user-123',
        'Cancelled'
      );

      vi.mocked(mockNotificationService.cancelScheduled).mockResolvedValue(
        Result.ok(undefined)
      );

      await service.handleAppointmentCancelled(cancelEvent, appointment);

      // Verify reminder IDs are cleared
      reminderIds = await service.getReminderIds(appointment.id.value);
      expect(reminderIds).toHaveLength(0);
    });
  });

  describe('getReminderIds', () => {
    it('should return empty array for appointment with no reminders', async () => {
      const reminderIds = await service.getReminderIds('unknown-appt-123');
      expect(reminderIds).toEqual([]);
    });

    it('should return stored reminder IDs', async () => {
      const event = new AppointmentCreatedEvent(
        appointment.id,
        appointment.title,
        appointment.timeSlot,
        appointment.appointmentType,
        appointment.organizerId
      );

      const reminder1: ScheduledNotification = {
        id: 'reminder-1',
        appointmentId: appointment.id.value,
        channel: 'email',
        scheduledAt: new Date(),
        status: 'scheduled',
        priority: 'high',
      };

      vi.mocked(mockNotificationService.schedule).mockResolvedValue(
        Result.ok(reminder1)
      );

      await service.handleAppointmentCreated(event, appointment);

      const reminderIds = await service.getReminderIds(appointment.id.value);
      expect(reminderIds).toEqual(['reminder-1']);
    });
  });
});
