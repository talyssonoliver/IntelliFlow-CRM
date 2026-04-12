import { DomainEvent } from '../../../shared/DomainEvent';
import { ReviewDecision } from '../ReviewStatus';

/**
 * Event emitted when an AI output review is rejected
 */
export class ReviewRejectedEvent extends DomainEvent {
  public readonly eventType = 'REVIEW_REJECTED';

  constructor(
    public readonly reviewId: string,
    public readonly tenantId: string,
    public readonly reviewerId: string,
    public readonly decision: ReviewDecision,
    public readonly notes: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      reviewId: this.reviewId,
      tenantId: this.tenantId,
      reviewerId: this.reviewerId,
      decision: this.decision,
      notes: this.notes,
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
