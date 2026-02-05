import { DomainEvent } from '../../shared/DomainEvent';
import { TicketId } from './TicketId';
import type { TicketStatus, TicketPriority } from '../../support/TicketConstants';

/**
 * Event: Ticket was created
 */
export class TicketCreatedEvent extends DomainEvent {
  readonly eventType = 'ticket.created';

  constructor(
    public readonly ticketId: TicketId,
    public readonly ticketNumber: string,
    public readonly subject: string,
    public readonly priority: TicketPriority,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      ticketNumber: this.ticketNumber,
      subject: this.subject,
      priority: this.priority,
      tenantId: this.tenantId,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}

/**
 * Event: Ticket status changed
 */
export class TicketStatusChangedEvent extends DomainEvent {
  readonly eventType = 'ticket.status_changed';

  constructor(
    public readonly ticketId: TicketId,
    public readonly previousStatus: TicketStatus,
    public readonly newStatus: TicketStatus,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Ticket priority changed
 */
export class TicketPriorityChangedEvent extends DomainEvent {
  readonly eventType = 'ticket.priority_changed';

  constructor(
    public readonly ticketId: TicketId,
    public readonly previousPriority: TicketPriority,
    public readonly newPriority: TicketPriority,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      previousPriority: this.previousPriority,
      newPriority: this.newPriority,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Ticket was assigned
 */
export class TicketAssignedEvent extends DomainEvent {
  readonly eventType = 'ticket.assigned';

  constructor(
    public readonly ticketId: TicketId,
    public readonly previousAssigneeId: string | null,
    public readonly newAssigneeId: string,
    public readonly assignedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      previousAssigneeId: this.previousAssigneeId,
      newAssigneeId: this.newAssigneeId,
      assignedBy: this.assignedBy,
    };
  }
}

/**
 * Event: Ticket was unassigned
 */
export class TicketUnassignedEvent extends DomainEvent {
  readonly eventType = 'ticket.unassigned';

  constructor(
    public readonly ticketId: TicketId,
    public readonly previousAssigneeId: string,
    public readonly unassignedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      previousAssigneeId: this.previousAssigneeId,
      unassignedBy: this.unassignedBy,
    };
  }
}

/**
 * Event: Ticket was resolved
 */
export class TicketResolvedEvent extends DomainEvent {
  readonly eventType = 'ticket.resolved';

  constructor(
    public readonly ticketId: TicketId,
    public readonly resolution: string,
    public readonly resolvedBy: string,
    public readonly resolvedAt: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      resolution: this.resolution,
      resolvedBy: this.resolvedBy,
      resolvedAt: this.resolvedAt.toISOString(),
    };
  }
}

/**
 * Event: Ticket was closed
 */
export class TicketClosedEvent extends DomainEvent {
  readonly eventType = 'ticket.closed';

  constructor(
    public readonly ticketId: TicketId,
    public readonly closedBy: string,
    public readonly closedAt: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      closedBy: this.closedBy,
      closedAt: this.closedAt.toISOString(),
    };
  }
}

/**
 * Event: Ticket was reopened
 */
export class TicketReopenedEvent extends DomainEvent {
  readonly eventType = 'ticket.reopened';

  constructor(
    public readonly ticketId: TicketId,
    public readonly reason: string,
    public readonly reopenedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      reason: this.reason,
      reopenedBy: this.reopenedBy,
    };
  }
}

/**
 * Event: Response SLA was breached
 */
export class TicketResponseSlaBreachedEvent extends DomainEvent {
  readonly eventType = 'ticket.response_sla_breached';

  constructor(
    public readonly ticketId: TicketId,
    public readonly dueAt: Date,
    public readonly breachedAt: Date,
    public readonly slaPolicyId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      dueAt: this.dueAt.toISOString(),
      breachedAt: this.breachedAt.toISOString(),
      slaPolicyId: this.slaPolicyId,
    };
  }
}

/**
 * Event: Resolution SLA was breached
 */
export class TicketResolutionSlaBreachedEvent extends DomainEvent {
  readonly eventType = 'ticket.resolution_sla_breached';

  constructor(
    public readonly ticketId: TicketId,
    public readonly dueAt: Date,
    public readonly breachedAt: Date,
    public readonly slaPolicyId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      dueAt: this.dueAt.toISOString(),
      breachedAt: this.breachedAt.toISOString(),
      slaPolicyId: this.slaPolicyId,
    };
  }
}

/**
 * Event: SLA was paused
 */
export class TicketSlaPausedEvent extends DomainEvent {
  readonly eventType = 'ticket.sla_paused';

  constructor(
    public readonly ticketId: TicketId,
    public readonly pausedAt: Date,
    public readonly reason: string,
    public readonly pausedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      pausedAt: this.pausedAt.toISOString(),
      reason: this.reason,
      pausedBy: this.pausedBy,
    };
  }
}

/**
 * Event: SLA was resumed
 */
export class TicketSlaResumedEvent extends DomainEvent {
  readonly eventType = 'ticket.sla_resumed';

  constructor(
    public readonly ticketId: TicketId,
    public readonly resumedAt: Date,
    public readonly pausedDuration: number,
    public readonly resumedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      ticketId: this.ticketId.value,
      resumedAt: this.resumedAt.toISOString(),
      pausedDuration: this.pausedDuration,
      resumedBy: this.resumedBy,
    };
  }
}
