/**
 * TicketEvents Domain Events Tests
 *
 * Tests all 12 ticket domain events for correct creation and serialization
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import {
  TicketCreatedEvent,
  TicketStatusChangedEvent,
  TicketPriorityChangedEvent,
  TicketAssignedEvent,
  TicketUnassignedEvent,
  TicketResolvedEvent,
  TicketClosedEvent,
  TicketReopenedEvent,
  TicketResponseSlaBreachedEvent,
  TicketResolutionSlaBreachedEvent,
  TicketSlaPausedEvent,
  TicketSlaResumedEvent,
} from '../TicketEvents';
import { TicketId } from '../TicketId';

describe('TicketCreatedEvent', () => {
  it('should create event with correct payload', () => {
    const ticketId = TicketId.generate();
    const event = new TicketCreatedEvent(ticketId, 'T-00001', 'Login issue', 'HIGH', 'tenant-123');

    expect(event.eventType).toBe('ticket.created');
    expect(event.ticketId).toBe(ticketId);
    expect(event.ticketNumber).toBe('T-00001');
    expect(event.subject).toBe('Login issue');
    expect(event.priority).toBe('HIGH');
    expect(event.tenantId).toBe('tenant-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketCreatedEvent(ticketId, 'T-00001', 'Login issue', 'HIGH', 'tenant-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.ticketNumber).toBe('T-00001');
    expect(payload.subject).toBe('Login issue');
    expect(payload.priority).toBe('HIGH');
    expect(payload.tenantId).toBe('tenant-123');
    expect(typeof payload.occurredAt).toBe('string');
  });
});

describe('TicketStatusChangedEvent', () => {
  it('should create event with status change', () => {
    const ticketId = TicketId.generate();
    const event = new TicketStatusChangedEvent(ticketId, 'OPEN', 'IN_PROGRESS', 'user-123');

    expect(event.eventType).toBe('ticket.status_changed');
    expect(event.ticketId).toBe(ticketId);
    expect(event.previousStatus).toBe('OPEN');
    expect(event.newStatus).toBe('IN_PROGRESS');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketStatusChangedEvent(ticketId, 'OPEN', 'IN_PROGRESS', 'user-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.previousStatus).toBe('OPEN');
    expect(payload.newStatus).toBe('IN_PROGRESS');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('TicketPriorityChangedEvent', () => {
  it('should create event with priority change', () => {
    const ticketId = TicketId.generate();
    const event = new TicketPriorityChangedEvent(ticketId, 'MEDIUM', 'CRITICAL', 'user-123');

    expect(event.eventType).toBe('ticket.priority_changed');
    expect(event.ticketId).toBe(ticketId);
    expect(event.previousPriority).toBe('MEDIUM');
    expect(event.newPriority).toBe('CRITICAL');
    expect(event.changedBy).toBe('user-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketPriorityChangedEvent(ticketId, 'MEDIUM', 'CRITICAL', 'user-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.previousPriority).toBe('MEDIUM');
    expect(payload.newPriority).toBe('CRITICAL');
    expect(payload.changedBy).toBe('user-123');
  });
});

describe('TicketAssignedEvent', () => {
  it('should create event when ticket is assigned', () => {
    const ticketId = TicketId.generate();
    const event = new TicketAssignedEvent(ticketId, null, 'agent-456', 'manager-789');

    expect(event.eventType).toBe('ticket.assigned');
    expect(event.ticketId).toBe(ticketId);
    expect(event.previousAssigneeId).toBeNull();
    expect(event.newAssigneeId).toBe('agent-456');
    expect(event.assignedBy).toBe('manager-789');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should create event when ticket is reassigned', () => {
    const ticketId = TicketId.generate();
    const event = new TicketAssignedEvent(ticketId, 'agent-123', 'agent-456', 'manager-789');

    expect(event.previousAssigneeId).toBe('agent-123');
    expect(event.newAssigneeId).toBe('agent-456');
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketAssignedEvent(ticketId, 'agent-123', 'agent-456', 'manager-789');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.previousAssigneeId).toBe('agent-123');
    expect(payload.newAssigneeId).toBe('agent-456');
    expect(payload.assignedBy).toBe('manager-789');
  });
});

describe('TicketUnassignedEvent', () => {
  it('should create event when ticket is unassigned', () => {
    const ticketId = TicketId.generate();
    const event = new TicketUnassignedEvent(ticketId, 'agent-123', 'manager-456');

    expect(event.eventType).toBe('ticket.unassigned');
    expect(event.ticketId).toBe(ticketId);
    expect(event.previousAssigneeId).toBe('agent-123');
    expect(event.unassignedBy).toBe('manager-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketUnassignedEvent(ticketId, 'agent-123', 'manager-456');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.previousAssigneeId).toBe('agent-123');
    expect(payload.unassignedBy).toBe('manager-456');
  });
});

describe('TicketResolvedEvent', () => {
  it('should create event when ticket is resolved', () => {
    const ticketId = TicketId.generate();
    const resolvedAt = new Date();
    const event = new TicketResolvedEvent(
      ticketId,
      'Issue fixed by updating configuration',
      'agent-123',
      resolvedAt
    );

    expect(event.eventType).toBe('ticket.resolved');
    expect(event.ticketId).toBe(ticketId);
    expect(event.resolution).toBe('Issue fixed by updating configuration');
    expect(event.resolvedBy).toBe('agent-123');
    expect(event.resolvedAt).toBe(resolvedAt);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const resolvedAt = new Date('2026-02-05T10:00:00.000Z');
    const event = new TicketResolvedEvent(ticketId, 'Fixed', 'agent-123', resolvedAt);
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.resolution).toBe('Fixed');
    expect(payload.resolvedBy).toBe('agent-123');
    expect(payload.resolvedAt).toBe('2026-02-05T10:00:00.000Z');
  });
});

describe('TicketClosedEvent', () => {
  it('should create event when ticket is closed', () => {
    const ticketId = TicketId.generate();
    const closedAt = new Date();
    const event = new TicketClosedEvent(ticketId, 'admin-123', closedAt);

    expect(event.eventType).toBe('ticket.closed');
    expect(event.ticketId).toBe(ticketId);
    expect(event.closedBy).toBe('admin-123');
    expect(event.closedAt).toBe(closedAt);
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const closedAt = new Date('2026-02-05T12:00:00.000Z');
    const event = new TicketClosedEvent(ticketId, 'admin-123', closedAt);
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.closedBy).toBe('admin-123');
    expect(payload.closedAt).toBe('2026-02-05T12:00:00.000Z');
  });
});

describe('TicketReopenedEvent', () => {
  it('should create event when ticket is reopened', () => {
    const ticketId = TicketId.generate();
    const event = new TicketReopenedEvent(
      ticketId,
      'Customer reported issue persists',
      'agent-123'
    );

    expect(event.eventType).toBe('ticket.reopened');
    expect(event.ticketId).toBe(ticketId);
    expect(event.reason).toBe('Customer reported issue persists');
    expect(event.reopenedBy).toBe('agent-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const event = new TicketReopenedEvent(ticketId, 'Still broken', 'agent-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.reason).toBe('Still broken');
    expect(payload.reopenedBy).toBe('agent-123');
  });
});

describe('TicketResponseSlaBreachedEvent', () => {
  it('should create event when response SLA is breached', () => {
    const ticketId = TicketId.generate();
    const dueAt = new Date('2026-02-05T08:00:00.000Z');
    const breachedAt = new Date('2026-02-05T09:00:00.000Z');
    const event = new TicketResponseSlaBreachedEvent(ticketId, dueAt, breachedAt, 'sla-policy-123');

    expect(event.eventType).toBe('ticket.response_sla_breached');
    expect(event.ticketId).toBe(ticketId);
    expect(event.dueAt).toBe(dueAt);
    expect(event.breachedAt).toBe(breachedAt);
    expect(event.slaPolicyId).toBe('sla-policy-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const dueAt = new Date('2026-02-05T08:00:00.000Z');
    const breachedAt = new Date('2026-02-05T09:00:00.000Z');
    const event = new TicketResponseSlaBreachedEvent(ticketId, dueAt, breachedAt, 'sla-policy-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.dueAt).toBe('2026-02-05T08:00:00.000Z');
    expect(payload.breachedAt).toBe('2026-02-05T09:00:00.000Z');
    expect(payload.slaPolicyId).toBe('sla-policy-123');
  });
});

describe('TicketResolutionSlaBreachedEvent', () => {
  it('should create event when resolution SLA is breached', () => {
    const ticketId = TicketId.generate();
    const dueAt = new Date('2026-02-05T16:00:00.000Z');
    const breachedAt = new Date('2026-02-05T18:00:00.000Z');
    const event = new TicketResolutionSlaBreachedEvent(
      ticketId,
      dueAt,
      breachedAt,
      'sla-policy-456'
    );

    expect(event.eventType).toBe('ticket.resolution_sla_breached');
    expect(event.ticketId).toBe(ticketId);
    expect(event.dueAt).toBe(dueAt);
    expect(event.breachedAt).toBe(breachedAt);
    expect(event.slaPolicyId).toBe('sla-policy-456');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const dueAt = new Date('2026-02-05T16:00:00.000Z');
    const breachedAt = new Date('2026-02-05T18:00:00.000Z');
    const event = new TicketResolutionSlaBreachedEvent(
      ticketId,
      dueAt,
      breachedAt,
      'sla-policy-456'
    );
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.dueAt).toBe('2026-02-05T16:00:00.000Z');
    expect(payload.breachedAt).toBe('2026-02-05T18:00:00.000Z');
    expect(payload.slaPolicyId).toBe('sla-policy-456');
  });
});

describe('TicketSlaPausedEvent', () => {
  it('should create event when SLA is paused', () => {
    const ticketId = TicketId.generate();
    const pausedAt = new Date();
    const event = new TicketSlaPausedEvent(
      ticketId,
      pausedAt,
      'Waiting for customer response',
      'agent-123'
    );

    expect(event.eventType).toBe('ticket.sla_paused');
    expect(event.ticketId).toBe(ticketId);
    expect(event.pausedAt).toBe(pausedAt);
    expect(event.reason).toBe('Waiting for customer response');
    expect(event.pausedBy).toBe('agent-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const pausedAt = new Date('2026-02-05T14:00:00.000Z');
    const event = new TicketSlaPausedEvent(ticketId, pausedAt, 'Waiting', 'agent-123');
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.pausedAt).toBe('2026-02-05T14:00:00.000Z');
    expect(payload.reason).toBe('Waiting');
    expect(payload.pausedBy).toBe('agent-123');
  });
});

describe('TicketSlaResumedEvent', () => {
  it('should create event when SLA is resumed', () => {
    const ticketId = TicketId.generate();
    const resumedAt = new Date();
    const event = new TicketSlaResumedEvent(
      ticketId,
      resumedAt,
      3600000, // 1 hour in ms
      'agent-123'
    );

    expect(event.eventType).toBe('ticket.sla_resumed');
    expect(event.ticketId).toBe(ticketId);
    expect(event.resumedAt).toBe(resumedAt);
    expect(event.pausedDuration).toBe(3600000);
    expect(event.resumedBy).toBe('agent-123');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('should serialize to payload correctly', () => {
    const ticketId = TicketId.generate();
    const resumedAt = new Date('2026-02-05T15:00:00.000Z');
    const event = new TicketSlaResumedEvent(
      ticketId,
      resumedAt,
      7200000, // 2 hours
      'agent-123'
    );
    const payload = event.toPayload();

    expect(payload.ticketId).toBe(ticketId.value);
    expect(payload.resumedAt).toBe('2026-02-05T15:00:00.000Z');
    expect(payload.pausedDuration).toBe(7200000);
    expect(payload.resumedBy).toBe('agent-123');
  });
});
