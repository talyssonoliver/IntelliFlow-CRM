/**
 * Appointment Aggregate Tests
 *
 * Tests the Appointment aggregate root which handles scheduling,
 * conflict detection, buffers, and recurrence.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Appointment, CreateAppointmentProps } from '../Appointment';
import { AppointmentId } from '../AppointmentId';
import { TimeSlot } from '../TimeSlot';
import { Buffer } from '../Buffer';
import { Recurrence } from '../Recurrence';
import { CaseId } from '../../cases/CaseId';

// Helper to create future dates for testing
function getFutureDate(hoursFromNow: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow);
  return date;
}

// Helper to create test appointments
function createValidAppointmentProps(
  overrides?: Partial<CreateAppointmentProps>
): CreateAppointmentProps {
  const startTime = getFutureDate(24); // 24 hours from now
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

  return {
    title: 'Test Appointment',
    startTime,
    endTime,
    appointmentType: 'MEETING',
    organizerId: 'organizer-123',
    ...overrides,
  };
}

describe('Appointment Aggregate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create()', () => {
    it('should create a valid appointment', () => {
      const props = createValidAppointmentProps();
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.title).toBe('Test Appointment');
      expect(result.value.status).toBe('SCHEDULED');
      expect(result.value.organizerId).toBe('organizer-123');
    });

    it('should generate an appointment ID', () => {
      const props = createValidAppointmentProps();
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.id).toBeDefined();
      expect(result.value.id.value).toHaveLength(36); // UUID format
    });

    it('should set default buffer to none', () => {
      const props = createValidAppointmentProps();
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.buffer.beforeMinutes).toBe(0);
      expect(result.value.buffer.afterMinutes).toBe(0);
    });

    it('should accept custom buffer', () => {
      const buffer = Buffer.create(15, 15).value;
      const props = createValidAppointmentProps({ buffer });
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.buffer.beforeMinutes).toBe(15);
      expect(result.value.buffer.afterMinutes).toBe(15);
    });

    it('should fail for appointments in the past', () => {
      const pastStart = new Date('2024-01-14T10:00:00Z');
      const pastEnd = new Date('2024-01-14T11:00:00Z');
      const props = createValidAppointmentProps({ startTime: pastStart, endTime: pastEnd });

      const result = Appointment.create(props);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_IN_PAST');
    });

    it('should allow appointments within grace period', () => {
      // Appointment starting 3 minutes ago (within 5 min grace period)
      const startTime = new Date('2024-01-15T11:57:00Z');
      const endTime = new Date('2024-01-15T12:57:00Z');
      const props = createValidAppointmentProps({ startTime, endTime });

      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
    });

    it('should set createdAt and updatedAt', () => {
      const props = createValidAppointmentProps();
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.createdAt).toEqual(new Date('2024-01-15T12:00:00Z'));
      expect(result.value.updatedAt).toEqual(new Date('2024-01-15T12:00:00Z'));
    });

    it('should emit AppointmentCreatedEvent', () => {
      const props = createValidAppointmentProps();
      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      const events = result.value.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentCreatedEvent');
    });

    it('should accept optional fields', () => {
      const props = createValidAppointmentProps({
        description: 'Test description',
        location: 'Conference Room A',
        reminderMinutes: 30,
        attendeeIds: ['attendee-1', 'attendee-2'],
      });

      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.description).toBe('Test description');
      expect(result.value.location).toBe('Conference Room A');
      expect(result.value.reminderMinutes).toBe(30);
      expect(result.value.attendeeIds).toEqual(['attendee-1', 'attendee-2']);
    });

    it('should accept recurrence', () => {
      const recurrence = Recurrence.createWeekly(['MONDAY', 'WEDNESDAY']).value;
      const props = createValidAppointmentProps({ recurrence });

      const result = Appointment.create(props);

      expect(result.isSuccess).toBe(true);
      expect(result.value.isRecurring).toBe(true);
      expect(result.value.recurrence).toBeDefined();
    });
  });

  describe('reschedule()', () => {
    it('should reschedule to new time', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const newStart = getFutureDate(48);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);

      const result = appointment.reschedule(newStart, newEnd, 'user-1', 'Client requested');

      expect(result.isSuccess).toBe(true);
      expect(appointment.startTime.getTime()).toBe(newStart.getTime());
      expect(appointment.endTime.getTime()).toBe(newEnd.getTime());
    });

    it('should emit AppointmentRescheduledEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents(); // Clear creation event

      const newStart = getFutureDate(48);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
      appointment.reschedule(newStart, newEnd, 'user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentRescheduledEvent');
    });

    it('should fail to reschedule cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1', 'Test');

      const newStart = getFutureDate(48);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
      const result = appointment.reschedule(newStart, newEnd, 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    });

    it('should fail to reschedule completed appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.complete('user-1');

      const newStart = getFutureDate(48);
      const newEnd = new Date(newStart.getTime() + 60 * 60 * 1000);
      const result = appointment.reschedule(newStart, newEnd, 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_COMPLETED');
    });

    it('should fail to reschedule to past', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const pastStart = new Date('2024-01-14T10:00:00Z');
      const pastEnd = new Date('2024-01-14T11:00:00Z');
      const result = appointment.reschedule(pastStart, pastEnd, 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_IN_PAST');
    });
  });

  describe('confirm()', () => {
    it('should confirm scheduled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.confirm('user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('CONFIRMED');
    });

    it('should emit AppointmentConfirmedEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.confirm('user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentConfirmedEvent');
    });

    it('should fail to confirm cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.confirm('user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    });

    it('should fail to confirm already confirmed appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.confirm('user-1');

      const result = appointment.confirm('user-2');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    });
  });

  describe('start()', () => {
    it('should start scheduled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.start('user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('IN_PROGRESS');
    });

    it('should start confirmed appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.confirm('user-1');

      const result = appointment.start('user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('IN_PROGRESS');
    });

    it('should fail to start cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.start('user-1');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('complete()', () => {
    it('should complete appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.complete('user-1', 'Meeting went well');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('COMPLETED');
      expect(appointment.notes).toBe('Meeting went well');
      expect(appointment.completedAt).toBeDefined();
    });

    it('should emit AppointmentCompletedEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.complete('user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentCompletedEvent');
    });

    it('should fail to complete already completed appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.complete('user-1');

      const result = appointment.complete('user-2');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_COMPLETED');
    });

    it('should fail to complete cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.complete('user-1');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('cancel()', () => {
    it('should cancel appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.cancel('user-1', 'Client unavailable');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('CANCELLED');
      expect(appointment.cancellationReason).toBe('Client unavailable');
      expect(appointment.cancelledAt).toBeDefined();
    });

    it('should emit AppointmentCancelledEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.cancel('user-1', 'Test reason');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentCancelledEvent');
    });

    it('should fail to cancel already cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.cancel('user-2');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ALREADY_CANCELLED');
    });

    it('should fail to cancel completed appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.complete('user-1');

      const result = appointment.cancel('user-1');

      expect(result.isFailure).toBe(true);
    });
  });

  describe('markNoShow()', () => {
    it('should mark appointment as no-show', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.markNoShow('user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.status).toBe('NO_SHOW');
    });

    it('should emit AppointmentNoShowEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.markNoShow('user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentNoShowEvent');
    });

    it('should fail for cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.markNoShow('user-1');

      expect(result.isFailure).toBe(true);
    });

    it('should fail for in-progress appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.start('user-1');

      const result = appointment.markNoShow('user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_INVALID_STATUS_TRANSITION');
    });
  });

  describe('addAttendee()', () => {
    it('should add attendee', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.addAttendee('attendee-1', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.attendeeIds).toContain('attendee-1');
    });

    it('should emit AppointmentAttendeeAddedEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.addAttendee('attendee-1', 'user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentAttendeeAddedEvent');
    });

    it('should fail to add duplicate attendee', () => {
      const props = createValidAppointmentProps({ attendeeIds: ['attendee-1'] });
      const appointment = Appointment.create(props).value;

      const result = appointment.addAttendee('attendee-1', 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ATTENDEE_ALREADY_ADDED');
    });
  });

  describe('removeAttendee()', () => {
    it('should remove attendee', () => {
      const props = createValidAppointmentProps({ attendeeIds: ['attendee-1', 'attendee-2'] });
      const appointment = Appointment.create(props).value;

      const result = appointment.removeAttendee('attendee-1', 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.attendeeIds).not.toContain('attendee-1');
      expect(appointment.attendeeIds).toContain('attendee-2');
    });

    it('should emit AppointmentAttendeeRemovedEvent', () => {
      const props = createValidAppointmentProps({ attendeeIds: ['attendee-1'] });
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.removeAttendee('attendee-1', 'user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentAttendeeRemovedEvent');
    });

    it('should fail to remove non-existent attendee', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.removeAttendee('non-existent', 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_ATTENDEE_NOT_FOUND');
    });
  });

  describe('linkToCase()', () => {
    it('should link to case', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      const caseId = CaseId.generate();

      const result = appointment.linkToCase(caseId, 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.linkedCaseIds.map((id) => id.value)).toContain(caseId.value);
    });

    it('should emit AppointmentLinkedToCaseEvent', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      const caseId = CaseId.generate();
      appointment.linkToCase(caseId, 'user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentLinkedToCaseEvent');
    });

    it('should be idempotent for same case', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      const caseId = CaseId.generate();

      appointment.linkToCase(caseId, 'user-1');
      appointment.clearDomainEvents();
      const result = appointment.linkToCase(caseId, 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.linkedCaseIds.filter((id) => id.value === caseId.value)).toHaveLength(1);
      expect(appointment.domainEvents).toHaveLength(0); // No new event for duplicate
    });
  });

  describe('unlinkFromCase()', () => {
    it('should unlink from case', () => {
      const caseId = CaseId.generate();
      const props = createValidAppointmentProps({ linkedCaseIds: [caseId] });
      const appointment = Appointment.create(props).value;

      const result = appointment.unlinkFromCase(caseId, 'user-1');

      expect(result.isSuccess).toBe(true);
      expect(appointment.linkedCaseIds.map((id) => id.value)).not.toContain(caseId.value);
    });

    it('should emit AppointmentUnlinkedFromCaseEvent', () => {
      const caseId = CaseId.generate();
      const props = createValidAppointmentProps({ linkedCaseIds: [caseId] });
      const appointment = Appointment.create(props).value;
      appointment.clearDomainEvents();

      appointment.unlinkFromCase(caseId, 'user-1');

      const events = appointment.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0].constructor.name).toBe('AppointmentUnlinkedFromCaseEvent');
    });

    it('should fail for non-linked case', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      const caseId = CaseId.generate();

      const result = appointment.unlinkFromCase(caseId, 'user-1');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('APPOINTMENT_CASE_NOT_LINKED');
    });
  });

  describe('updateDetails()', () => {
    it('should update title', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.updateDetails({ title: 'New Title' });

      expect(result.isSuccess).toBe(true);
      expect(appointment.title).toBe('New Title');
    });

    it('should update multiple fields', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      const result = appointment.updateDetails({
        title: 'New Title',
        description: 'New description',
        location: 'New location',
        notes: 'New notes',
      });

      expect(result.isSuccess).toBe(true);
      expect(appointment.title).toBe('New Title');
      expect(appointment.description).toBe('New description');
      expect(appointment.location).toBe('New location');
      expect(appointment.notes).toBe('New notes');
    });

    it('should fail for cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');

      const result = appointment.updateDetails({ title: 'New Title' });

      expect(result.isFailure).toBe(true);
    });
  });

  describe('updateBuffer()', () => {
    it('should update buffer', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      const newBuffer = Buffer.create(30, 15).value;

      const result = appointment.updateBuffer(newBuffer);

      expect(result.isSuccess).toBe(true);
      expect(appointment.buffer.beforeMinutes).toBe(30);
      expect(appointment.buffer.afterMinutes).toBe(15);
    });

    it('should fail for cancelled appointment', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;
      appointment.cancel('user-1');
      const newBuffer = Buffer.create(30, 15).value;

      const result = appointment.updateBuffer(newBuffer);

      expect(result.isFailure).toBe(true);
    });
  });

  describe('setExternalCalendarId()', () => {
    it('should set external calendar ID', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      appointment.setExternalCalendarId('external-123');

      expect(appointment.externalCalendarId).toBe('external-123');
    });
  });

  describe('conflictsWith()', () => {
    it('should detect overlapping appointments', () => {
      const start1 = getFutureDate(24);
      const end1 = new Date(start1.getTime() + 60 * 60 * 1000);

      const start2 = new Date(start1.getTime() + 30 * 60 * 1000); // Starts 30 min into apt1
      const end2 = new Date(start2.getTime() + 60 * 60 * 1000);

      const apt1 = Appointment.create(
        createValidAppointmentProps({
          startTime: start1,
          endTime: end1,
        })
      ).value;

      const apt2 = Appointment.create(
        createValidAppointmentProps({
          startTime: start2,
          endTime: end2,
          organizerId: 'organizer-456',
        })
      ).value;

      expect(apt1.conflictsWith(apt2)).toBe(true);
    });

    it('should not conflict with self', () => {
      const props = createValidAppointmentProps();
      const appointment = Appointment.create(props).value;

      expect(appointment.conflictsWith(appointment)).toBe(false);
    });

    it('should not conflict with cancelled appointment', () => {
      const start1 = getFutureDate(24);
      const end1 = new Date(start1.getTime() + 60 * 60 * 1000);

      const apt1 = Appointment.create(
        createValidAppointmentProps({
          startTime: start1,
          endTime: end1,
        })
      ).value;

      const apt2 = Appointment.create(
        createValidAppointmentProps({
          startTime: start1,
          endTime: end1,
          organizerId: 'organizer-456',
        })
      ).value;
      apt2.cancel('user-1');

      expect(apt1.conflictsWith(apt2)).toBe(false);
    });

    it('should not conflict with non-overlapping appointments', () => {
      const start1 = getFutureDate(24);
      const end1 = new Date(start1.getTime() + 60 * 60 * 1000);

      const start2 = new Date(end1.getTime() + 30 * 60 * 1000); // Starts 30 min after apt1 ends
      const end2 = new Date(start2.getTime() + 60 * 60 * 1000);

      const apt1 = Appointment.create(
        createValidAppointmentProps({
          startTime: start1,
          endTime: end1,
        })
      ).value;

      const apt2 = Appointment.create(
        createValidAppointmentProps({
          startTime: start2,
          endTime: end2,
          organizerId: 'organizer-456',
        })
      ).value;

      expect(apt1.conflictsWith(apt2)).toBe(false);
    });

    it('should consider buffer in conflict detection', () => {
      const start1 = getFutureDate(24);
      const end1 = new Date(start1.getTime() + 60 * 60 * 1000);

      // apt2 starts right when apt1 ends, but apt1 has 30 min buffer after
      const start2 = new Date(end1.getTime());
      const end2 = new Date(start2.getTime() + 60 * 60 * 1000);

      const buffer = Buffer.create(0, 30).value; // 30 min after buffer

      const apt1 = Appointment.create(
        createValidAppointmentProps({
          startTime: start1,
          endTime: end1,
          buffer,
        })
      ).value;

      const apt2 = Appointment.create(
        createValidAppointmentProps({
          startTime: start2,
          endTime: end2,
          organizerId: 'organizer-456',
        })
      ).value;

      expect(apt1.conflictsWith(apt2)).toBe(true);
    });
  });

  describe('conflictsWithTimeSlot()', () => {
    it('should detect conflict with overlapping time slot', () => {
      const start = getFutureDate(24);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const apt = Appointment.create(
        createValidAppointmentProps({
          startTime: start,
          endTime: end,
        })
      ).value;

      const overlappingSlot = TimeSlot.create(
        new Date(start.getTime() + 30 * 60 * 1000),
        new Date(end.getTime() + 30 * 60 * 1000)
      ).value;

      expect(apt.conflictsWithTimeSlot(overlappingSlot)).toBe(true);
    });

    it('should not detect conflict when cancelled', () => {
      const start = getFutureDate(24);
      const end = new Date(start.getTime() + 60 * 60 * 1000);

      const apt = Appointment.create(
        createValidAppointmentProps({
          startTime: start,
          endTime: end,
        })
      ).value;
      apt.cancel('user-1');

      const overlappingSlot = TimeSlot.create(start, end).value;

      expect(apt.conflictsWithTimeSlot(overlappingSlot)).toBe(false);
    });
  });

  describe('computed properties', () => {
    it('should calculate effective start time with buffer', () => {
      const start = getFutureDate(24);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const buffer = Buffer.create(15, 0).value;

      const apt = Appointment.create(
        createValidAppointmentProps({
          startTime: start,
          endTime: end,
          buffer,
        })
      ).value;

      expect(apt.effectiveStartTime.getTime()).toBe(start.getTime() - 15 * 60 * 1000);
    });

    it('should calculate effective end time with buffer', () => {
      const start = getFutureDate(24);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const buffer = Buffer.create(0, 20).value;

      const apt = Appointment.create(
        createValidAppointmentProps({
          startTime: start,
          endTime: end,
          buffer,
        })
      ).value;

      expect(apt.effectiveEndTime.getTime()).toBe(end.getTime() + 20 * 60 * 1000);
    });

    it('should report isActive correctly', () => {
      const props = createValidAppointmentProps();

      const activeApt = Appointment.create(props).value;
      expect(activeApt.isActive).toBe(true);

      const cancelledApt = Appointment.create(props).value;
      cancelledApt.cancel('user-1');
      expect(cancelledApt.isActive).toBe(false);

      const completedApt = Appointment.create(props).value;
      completedApt.complete('user-1');
      expect(completedApt.isActive).toBe(false);
    });

    it('should report isRecurring correctly', () => {
      const nonRecurring = Appointment.create(createValidAppointmentProps()).value;
      expect(nonRecurring.isRecurring).toBe(false);

      const recurrence = Recurrence.createDaily().value;
      const recurring = Appointment.create(createValidAppointmentProps({ recurrence })).value;
      expect(recurring.isRecurring).toBe(true);
    });

    it('should return duration in minutes', () => {
      const start = getFutureDate(24);
      const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 minutes

      const apt = Appointment.create(
        createValidAppointmentProps({
          startTime: start,
          endTime: end,
        })
      ).value;

      expect(apt.durationMinutes).toBe(90);
    });
  });

  describe('reconstitute()', () => {
    it('should reconstitute from persistence', () => {
      const id = AppointmentId.generate();
      const timeSlot = TimeSlot.create(
        getFutureDate(24),
        new Date(getFutureDate(24).getTime() + 60 * 60 * 1000)
      ).value;

      const apt = Appointment.reconstitute(id, {
        title: 'Reconstituted',
        timeSlot,
        appointmentType: 'CONSULTATION',
        status: 'CONFIRMED',
        buffer: Buffer.none(),
        attendeeIds: ['attendee-1'],
        linkedCaseIds: [],
        organizerId: 'organizer-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(apt.id.value).toBe(id.value);
      expect(apt.title).toBe('Reconstituted');
      expect(apt.status).toBe('CONFIRMED');
    });
  });

  describe('toJSON()', () => {
    it('should serialize to JSON', () => {
      const props = createValidAppointmentProps({
        description: 'Test',
        location: 'Room A',
      });
      const apt = Appointment.create(props).value;

      const json = apt.toJSON();

      expect(json.id).toBe(apt.id.value);
      expect(json.title).toBe('Test Appointment');
      expect(json.description).toBe('Test');
      expect(json.location).toBe('Room A');
      expect(json.status).toBe('SCHEDULED');
      expect(json.durationMinutes).toBe(60);
      expect(json.isActive).toBe(true);
    });

    it('should include computed properties', () => {
      const props = createValidAppointmentProps();
      const apt = Appointment.create(props).value;

      const json = apt.toJSON();

      expect(json.effectiveStartTime).toBeDefined();
      expect(json.effectiveEndTime).toBeDefined();
      expect(json.isRecurring).toBeDefined();
      expect(json.isPast).toBeDefined();
      expect(json.isFuture).toBeDefined();
    });
  });
});
