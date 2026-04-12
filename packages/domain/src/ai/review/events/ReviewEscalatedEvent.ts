import { DomainEvent } from '../../../shared/DomainEvent';

/**
 * Event emitted when an AI output review is escalated
 */
export class ReviewEscalatedEvent extends DomainEvent {
  public readonly eventType = 'REVIEW_ESCALATED';

  constructor(
    public readonly reviewId: string,
    public readonly tenantId: string,
    public readonly escalationDepth: number,
    public readonly reason?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      reviewId: this.reviewId,
      tenantId: this.tenantId,
      escalationDepth: this.escalationDepth,
      reason: this.reason,
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
