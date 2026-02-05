import { DomainEvent } from '../../../shared/DomainEvent';

/**
 * Event emitted when a new AI output review is requested
 */
export class ReviewRequestedEvent extends DomainEvent {
  public readonly eventType = 'REVIEW_REQUESTED';

  constructor(
    public readonly reviewId: string,
    public readonly tenantId: string,
    public readonly outputType: string,
    public readonly confidence: number,
    public readonly slaDeadline: Date
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      reviewId: this.reviewId,
      tenantId: this.tenantId,
      outputType: this.outputType,
      confidence: this.confidence,
      slaDeadline: this.slaDeadline.toISOString(),
      eventId: this.eventId,
      occurredAt: this.occurredAt.toISOString(),
    };
  }
}
