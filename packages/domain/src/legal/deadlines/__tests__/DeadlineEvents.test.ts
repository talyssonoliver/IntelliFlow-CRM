import { describe, it, expect } from 'vitest';
import {
  DeadlineCreatedEvent,
  DeadlineStatusChangedEvent,
  DeadlineApproachingEvent,
  DeadlineDueTodayEvent,
  DeadlineOverdueEvent,
  DeadlineCompletedEvent,
  DeadlineWaivedEvent,
  DeadlineExtendedEvent,
  DeadlineReminderSentEvent,
} from '../DeadlineEvents';
import { DeadlineId } from '../DeadlineId';
import { CaseId } from '../../cases/CaseId';

describe('DeadlineCreatedEvent', () => {
  it('should create event with correct properties', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const event = new DeadlineCreatedEvent(
      deadlineId,
      caseId,
      'Response to Complaint',
      dueDate,
      'HIGH'
    );

    expect(event.eventType).toBe('deadline.created');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.title).toBe('Response to Complaint');
    expect(event.dueDate).toBe(dueDate);
    expect(event.priority).toBe('HIGH');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const event = new DeadlineCreatedEvent(
      deadlineId,
      caseId,
      'Response to Complaint',
      dueDate,
      'HIGH'
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.title).toBe('Response to Complaint');
    expect(payload.dueDate).toBe(dueDate.toISOString());
    expect(payload.priority).toBe('HIGH');
  });
});

describe('DeadlineStatusChangedEvent', () => {
  it('should create event with correct status change', () => {
    const deadlineId = DeadlineId.generate();

    const event = new DeadlineStatusChangedEvent(deadlineId, 'PENDING', 'APPROACHING');

    expect(event.eventType).toBe('deadline.status_changed');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.previousStatus).toBe('PENDING');
    expect(event.newStatus).toBe('APPROACHING');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();

    const event = new DeadlineStatusChangedEvent(deadlineId, 'PENDING', 'OVERDUE');

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.previousStatus).toBe('PENDING');
    expect(payload.newStatus).toBe('OVERDUE');
  });
});

describe('DeadlineApproachingEvent', () => {
  it('should create event with approaching deadline details', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const event = new DeadlineApproachingEvent(
      deadlineId,
      caseId,
      'Motion Response',
      dueDate,
      3
    );

    expect(event.eventType).toBe('deadline.approaching');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.title).toBe('Motion Response');
    expect(event.dueDate).toBe(dueDate);
    expect(event.daysRemaining).toBe(3);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const event = new DeadlineApproachingEvent(
      deadlineId,
      caseId,
      'Motion Response',
      dueDate,
      2
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.title).toBe('Motion Response');
    expect(payload.dueDate).toBe(dueDate.toISOString());
    expect(payload.daysRemaining).toBe(2);
  });
});

describe('DeadlineDueTodayEvent', () => {
  it('should create event for deadline due today', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineDueTodayEvent(deadlineId, caseId, 'Discovery Response');

    expect(event.eventType).toBe('deadline.due_today');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.title).toBe('Discovery Response');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineDueTodayEvent(deadlineId, caseId, 'Discovery Response');

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.title).toBe('Discovery Response');
  });
});

describe('DeadlineOverdueEvent', () => {
  it('should create event for overdue deadline', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 15);

    const event = new DeadlineOverdueEvent(
      deadlineId,
      caseId,
      'Filing Deadline',
      dueDate,
      5
    );

    expect(event.eventType).toBe('deadline.overdue');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.title).toBe('Filing Deadline');
    expect(event.dueDate).toBe(dueDate);
    expect(event.daysOverdue).toBe(5);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 15);

    const event = new DeadlineOverdueEvent(
      deadlineId,
      caseId,
      'Filing Deadline',
      dueDate,
      3
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.title).toBe('Filing Deadline');
    expect(payload.dueDate).toBe(dueDate.toISOString());
    expect(payload.daysOverdue).toBe(3);
  });
});

describe('DeadlineCompletedEvent', () => {
  it('should create event for completed deadline', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineCompletedEvent(deadlineId, caseId, 'user-123', false);

    expect(event.eventType).toBe('deadline.completed');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.completedBy).toBe('user-123');
    expect(event.wasOverdue).toBe(false);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should track if deadline was overdue when completed', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineCompletedEvent(deadlineId, caseId, 'user-123', true);

    expect(event.wasOverdue).toBe(true);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineCompletedEvent(deadlineId, caseId, 'user-456', true);

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.completedBy).toBe('user-456');
    expect(payload.wasOverdue).toBe(true);
  });
});

describe('DeadlineWaivedEvent', () => {
  it('should create event for waived deadline', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineWaivedEvent(
      deadlineId,
      caseId,
      'user-123',
      'Settlement reached'
    );

    expect(event.eventType).toBe('deadline.waived');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.waivedBy).toBe('user-123');
    expect(event.reason).toBe('Settlement reached');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineWaivedEvent(
      deadlineId,
      caseId,
      'admin-789',
      'Case dismissed'
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.waivedBy).toBe('admin-789');
    expect(payload.reason).toBe('Case dismissed');
  });
});

describe('DeadlineExtendedEvent', () => {
  it('should create event for extended deadline', () => {
    const deadlineId = DeadlineId.generate();
    const previousDueDate = new Date(2025, 0, 22);
    const newDueDate = new Date(2025, 1, 15);

    const event = new DeadlineExtendedEvent(
      deadlineId,
      previousDueDate,
      newDueDate,
      'user-123'
    );

    expect(event.eventType).toBe('deadline.extended');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.previousDueDate).toBe(previousDueDate);
    expect(event.newDueDate).toBe(newDueDate);
    expect(event.extendedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const previousDueDate = new Date(2025, 0, 22);
    const newDueDate = new Date(2025, 1, 15);

    const event = new DeadlineExtendedEvent(
      deadlineId,
      previousDueDate,
      newDueDate,
      'judge-001'
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.previousDueDate).toBe(previousDueDate.toISOString());
    expect(payload.newDueDate).toBe(newDueDate.toISOString());
    expect(payload.extendedBy).toBe('judge-001');
  });
});

describe('DeadlineReminderSentEvent', () => {
  it('should create event for sent reminder', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineReminderSentEvent(
      deadlineId,
      caseId,
      'user-123',
      'EMAIL',
      3
    );

    expect(event.eventType).toBe('deadline.reminder_sent');
    expect(event.deadlineId).toBe(deadlineId);
    expect(event.caseId).toBe(caseId);
    expect(event.recipientId).toBe('user-123');
    expect(event.reminderType).toBe('EMAIL');
    expect(event.daysUntilDue).toBe(3);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should support different reminder types', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const emailEvent = new DeadlineReminderSentEvent(
      deadlineId,
      caseId,
      'user-1',
      'EMAIL',
      7
    );
    expect(emailEvent.reminderType).toBe('EMAIL');

    const inAppEvent = new DeadlineReminderSentEvent(
      deadlineId,
      caseId,
      'user-2',
      'IN_APP',
      3
    );
    expect(inAppEvent.reminderType).toBe('IN_APP');

    const smsEvent = new DeadlineReminderSentEvent(
      deadlineId,
      caseId,
      'user-3',
      'SMS',
      1
    );
    expect(smsEvent.reminderType).toBe('SMS');
  });

  it('should serialize to payload correctly', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();

    const event = new DeadlineReminderSentEvent(
      deadlineId,
      caseId,
      'attorney-456',
      'IN_APP',
      1
    );

    const payload = event.toPayload();

    expect(payload.deadlineId).toBe(deadlineId.value);
    expect(payload.caseId).toBe(caseId.value);
    expect(payload.recipientId).toBe('attorney-456');
    expect(payload.reminderType).toBe('IN_APP');
    expect(payload.daysUntilDue).toBe(1);
  });
});

describe('Event inheritance', () => {
  it('all events should have occurredAt timestamp', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const events = [
      new DeadlineCreatedEvent(deadlineId, caseId, 'Test', dueDate, 'HIGH'),
      new DeadlineStatusChangedEvent(deadlineId, 'PENDING', 'COMPLETED'),
      new DeadlineApproachingEvent(deadlineId, caseId, 'Test', dueDate, 3),
      new DeadlineDueTodayEvent(deadlineId, caseId, 'Test'),
      new DeadlineOverdueEvent(deadlineId, caseId, 'Test', dueDate, 5),
      new DeadlineCompletedEvent(deadlineId, caseId, 'user', false),
      new DeadlineWaivedEvent(deadlineId, caseId, 'user', 'reason'),
      new DeadlineExtendedEvent(deadlineId, dueDate, new Date(), 'user'),
      new DeadlineReminderSentEvent(deadlineId, caseId, 'user', 'EMAIL', 3),
    ];

    for (const event of events) {
      expect(event.occurredAt).toBeInstanceOf(Date);
    }
  });

  it('all events should have unique eventType', () => {
    const deadlineId = DeadlineId.generate();
    const caseId = CaseId.generate();
    const dueDate = new Date(2025, 0, 22);

    const events = [
      new DeadlineCreatedEvent(deadlineId, caseId, 'Test', dueDate, 'HIGH'),
      new DeadlineStatusChangedEvent(deadlineId, 'PENDING', 'COMPLETED'),
      new DeadlineApproachingEvent(deadlineId, caseId, 'Test', dueDate, 3),
      new DeadlineDueTodayEvent(deadlineId, caseId, 'Test'),
      new DeadlineOverdueEvent(deadlineId, caseId, 'Test', dueDate, 5),
      new DeadlineCompletedEvent(deadlineId, caseId, 'user', false),
      new DeadlineWaivedEvent(deadlineId, caseId, 'user', 'reason'),
      new DeadlineExtendedEvent(deadlineId, dueDate, new Date(), 'user'),
      new DeadlineReminderSentEvent(deadlineId, caseId, 'user', 'EMAIL', 3),
    ];

    const eventTypes = events.map((e) => e.eventType);
    const uniqueEventTypes = new Set(eventTypes);

    expect(uniqueEventTypes.size).toBe(events.length);
  });
});
