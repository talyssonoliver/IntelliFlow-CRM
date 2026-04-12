/**
 * AppointmentEvents - B11 coverage tests
 *
 * Targets uncovered toPayload() methods on all event classes:
 * - AppointmentCreatedEvent
 * - AppointmentRescheduledEvent
 * - AppointmentConfirmedEvent
 * - AppointmentCancelledEvent
 * - AppointmentCompletedEvent
 * - AppointmentNoShowEvent
 * - AppointmentLinkedToCaseEvent
 * - AppointmentUnlinkedFromCaseEvent
 * - AppointmentAttendeeAddedEvent
 * - AppointmentAttendeeRemovedEvent
 * - AppointmentConflictDetectedEvent
 */
import { describe, it, expect } from 'vitest';
import {
  AppointmentCreatedEvent,
  AppointmentRescheduledEvent,
  AppointmentConfirmedEvent,
  AppointmentCancelledEvent,
  AppointmentCompletedEvent,
  AppointmentNoShowEvent,
  AppointmentLinkedToCaseEvent,
  AppointmentUnlinkedFromCaseEvent,
  AppointmentAttendeeAddedEvent,
  AppointmentAttendeeRemovedEvent,
  AppointmentConflictDetectedEvent,
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
} from '../AppointmentEvents';
import { AppointmentId } from '../AppointmentId';
import { TimeSlot } from '../TimeSlot';
import { CaseId } from '../../cases/CaseId';

const aptId = AppointmentId.generate();
const aptId2 = AppointmentId.generate();

function createTimeSlot(startHour: number = 10, endHour: number = 11): TimeSlot {
  const start = new Date('2026-03-10T00:00:00Z');
  start.setUTCHours(startHour, 0, 0, 0);
  const end = new Date('2026-03-10T00:00:00Z');
  end.setUTCHours(endHour, 0, 0, 0);
  return TimeSlot.create(start, end).value;
}

describe('AppointmentEvents - b11 coverage', () => {
  describe('APPOINTMENT_STATUSES and APPOINTMENT_TYPES constants', () => {
    it('should export all statuses', () => {
      expect(APPOINTMENT_STATUSES).toContain('SCHEDULED');
      expect(APPOINTMENT_STATUSES).toContain('CONFIRMED');
      expect(APPOINTMENT_STATUSES).toContain('IN_PROGRESS');
      expect(APPOINTMENT_STATUSES).toContain('COMPLETED');
      expect(APPOINTMENT_STATUSES).toContain('CANCELLED');
      expect(APPOINTMENT_STATUSES).toContain('NO_SHOW');
    });

    it('should export all types', () => {
      expect(APPOINTMENT_TYPES).toContain('MEETING');
      expect(APPOINTMENT_TYPES).toContain('CALL');
      expect(APPOINTMENT_TYPES).toContain('HEARING');
      expect(APPOINTMENT_TYPES).toContain('CONSULTATION');
      expect(APPOINTMENT_TYPES).toContain('DEPOSITION');
      expect(APPOINTMENT_TYPES).toContain('OTHER');
    });
  });

  describe('AppointmentCreatedEvent', () => {
    it('should have correct eventType', () => {
      const ts = createTimeSlot();
      const event = new AppointmentCreatedEvent(aptId, 'Meeting', ts, 'MEETING', 'user-1');
      expect(event.eventType).toBe('appointment.created');
    });

    it('should produce correct payload', () => {
      const ts = createTimeSlot();
      const event = new AppointmentCreatedEvent(aptId, 'Meeting', ts, 'CONSULTATION', 'user-2');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.title).toBe('Meeting');
      expect(payload.appointmentType).toBe('CONSULTATION');
      expect(payload.createdBy).toBe('user-2');
      expect(payload.timeSlot).toBeDefined();
    });
  });

  describe('AppointmentRescheduledEvent', () => {
    it('should have correct eventType', () => {
      const prev = createTimeSlot(10, 11);
      const next = createTimeSlot(14, 15);
      const event = new AppointmentRescheduledEvent(aptId, prev, next, 'user-1');
      expect(event.eventType).toBe('appointment.rescheduled');
    });

    it('should produce correct payload with reason', () => {
      const prev = createTimeSlot(10, 11);
      const next = createTimeSlot(14, 15);
      const event = new AppointmentRescheduledEvent(aptId, prev, next, 'user-1', 'Conflict');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.rescheduledBy).toBe('user-1');
      expect(payload.reason).toBe('Conflict');
      expect(payload.previousTimeSlot).toBeDefined();
      expect(payload.newTimeSlot).toBeDefined();
    });

    it('should produce payload without reason', () => {
      const prev = createTimeSlot(10, 11);
      const next = createTimeSlot(14, 15);
      const event = new AppointmentRescheduledEvent(aptId, prev, next, 'user-1');
      const payload = event.toPayload();
      expect(payload.reason).toBeUndefined();
    });
  });

  describe('AppointmentConfirmedEvent', () => {
    it('should have correct eventType and payload', () => {
      const event = new AppointmentConfirmedEvent(aptId, 'user-3');
      expect(event.eventType).toBe('appointment.confirmed');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.confirmedBy).toBe('user-3');
    });
  });

  describe('AppointmentCancelledEvent', () => {
    it('should produce payload with reason', () => {
      const event = new AppointmentCancelledEvent(aptId, 'user-1', 'No longer needed');
      expect(event.eventType).toBe('appointment.cancelled');
      const payload = event.toPayload();
      expect(payload.cancelledBy).toBe('user-1');
      expect(payload.reason).toBe('No longer needed');
    });

    it('should produce payload without reason', () => {
      const event = new AppointmentCancelledEvent(aptId, 'user-1');
      const payload = event.toPayload();
      expect(payload.reason).toBeUndefined();
    });
  });

  describe('AppointmentCompletedEvent', () => {
    it('should produce payload with notes', () => {
      const event = new AppointmentCompletedEvent(aptId, 'user-1', 'Good meeting');
      expect(event.eventType).toBe('appointment.completed');
      const payload = event.toPayload();
      expect(payload.completedBy).toBe('user-1');
      expect(payload.notes).toBe('Good meeting');
    });

    it('should produce payload without notes', () => {
      const event = new AppointmentCompletedEvent(aptId, 'user-1');
      const payload = event.toPayload();
      expect(payload.notes).toBeUndefined();
    });
  });

  describe('AppointmentNoShowEvent', () => {
    it('should have correct eventType and payload', () => {
      const event = new AppointmentNoShowEvent(aptId, 'user-1');
      expect(event.eventType).toBe('appointment.no_show');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.markedBy).toBe('user-1');
    });
  });

  describe('AppointmentLinkedToCaseEvent', () => {
    it('should have correct eventType and payload', () => {
      const caseId = CaseId.generate();
      const event = new AppointmentLinkedToCaseEvent(aptId, caseId, 'user-1');
      expect(event.eventType).toBe('appointment.linked_to_case');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.caseId).toBe(caseId.value);
      expect(payload.linkedBy).toBe('user-1');
    });
  });

  describe('AppointmentUnlinkedFromCaseEvent', () => {
    it('should have correct eventType and payload', () => {
      const caseId = CaseId.generate();
      const event = new AppointmentUnlinkedFromCaseEvent(aptId, caseId, 'user-2');
      expect(event.eventType).toBe('appointment.unlinked_from_case');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.caseId).toBe(caseId.value);
      expect(payload.unlinkedBy).toBe('user-2');
    });
  });

  describe('AppointmentAttendeeAddedEvent', () => {
    it('should have correct eventType and payload', () => {
      const event = new AppointmentAttendeeAddedEvent(aptId, 'attendee-1', 'user-1');
      expect(event.eventType).toBe('appointment.attendee_added');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.attendeeId).toBe('attendee-1');
      expect(payload.addedBy).toBe('user-1');
    });
  });

  describe('AppointmentAttendeeRemovedEvent', () => {
    it('should have correct eventType and payload', () => {
      const event = new AppointmentAttendeeRemovedEvent(aptId, 'attendee-2', 'user-3');
      expect(event.eventType).toBe('appointment.attendee_removed');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect(payload.attendeeId).toBe('attendee-2');
      expect(payload.removedBy).toBe('user-3');
    });
  });

  describe('AppointmentConflictDetectedEvent', () => {
    it('should have correct eventType and payload', () => {
      const conflicting = [aptId2, AppointmentId.generate()];
      const detectedAt = new Date('2026-03-10T12:00:00Z');
      const event = new AppointmentConflictDetectedEvent(aptId, conflicting, detectedAt);
      expect(event.eventType).toBe('appointment.conflict_detected');
      const payload = event.toPayload();
      expect(payload.appointmentId).toBe(aptId.value);
      expect((payload.conflictingAppointmentIds as string[]).length).toBe(2);
      expect(payload.detectedAt).toBe(detectedAt.toISOString());
    });

    it('should handle empty conflicting list', () => {
      const detectedAt = new Date();
      const event = new AppointmentConflictDetectedEvent(aptId, [], detectedAt);
      const payload = event.toPayload();
      expect((payload.conflictingAppointmentIds as string[]).length).toBe(0);
    });
  });
});
