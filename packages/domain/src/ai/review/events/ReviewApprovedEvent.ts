import { DomainEvent } from '../../../shared/DomainEvent';

/**
 * Event emitted when an AI output review is approved
 */
export class ReviewApprovedEvent extends DomainEvent {
  public readonly eventType = 'REVIEW_APPROVED';

  constructor(
    public readonly reviewId: string,
    public readonly tenantId: string,
    public readonly reviewerId: string,
    public readonly notes?: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      reviewId: this.reviewId,
      tenantId: this.tenantId,
      reviewerId: this.reviewerId,
      notes: this.notes,
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
