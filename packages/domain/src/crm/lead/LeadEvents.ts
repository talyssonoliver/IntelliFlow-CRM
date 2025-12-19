import { DomainEvent } from '../../shared/DomainEvent';
import { LeadId } from './LeadId';
import { Email } from './Email';
import { LeadScore } from './LeadScore';

/**
 * Event: Lead was created
 */
export class LeadCreatedEvent extends DomainEvent {
  readonly eventType = 'lead.created';

  constructor(
    public readonly leadId: LeadId,
    public readonly email: Email,
    public readonly source: string,
    public readonly ownerId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId.value,
      email: this.email.value,
      source: this.source,
      ownerId: this.ownerId,
    };
  }
}

/**
 * Event: Lead was scored by AI
 */
export class LeadScoredEvent extends DomainEvent {
  readonly eventType = 'lead.scored';

  constructor(
    public readonly leadId: LeadId,
    public readonly score: LeadScore,
    public readonly previousScore: LeadScore | null,
    public readonly modelVersion: string
  ) {
    super();
  }

  get newScore(): LeadScore {
    return this.score;
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId.value,
      score: this.score.value,
      confidence: this.score.confidence,
      tier: this.score.tier,
      previousScore: this.previousScore?.value ?? null,
      modelVersion: this.modelVersion,
    };
  }
}

/**
 * Event: Lead status changed
 */
export class LeadStatusChangedEvent extends DomainEvent {
  readonly eventType = 'lead.status_changed';

  constructor(
    public readonly leadId: LeadId,
    public readonly previousStatus: string,
    public readonly newStatus: string,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId.value,
      previousStatus: this.previousStatus,
      newStatus: this.newStatus,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Lead was qualified
 */
export class LeadQualifiedEvent extends DomainEvent {
  readonly eventType = 'lead.qualified';

  constructor(
    public readonly leadId: LeadId,
    public readonly qualifiedBy: string,
    public readonly reason: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId.value,
      qualifiedBy: this.qualifiedBy,
      reason: this.reason,
    };
  }
}

/**
 * Event: Lead was converted to contact
 */
export class LeadConvertedEvent extends DomainEvent {
  readonly eventType = 'lead.converted';

  constructor(
    public readonly leadId: LeadId,
    public readonly contactId: string,
    public readonly accountId: string | null,
    public readonly convertedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      leadId: this.leadId.value,
      contactId: this.contactId,
      accountId: this.accountId,
      convertedBy: this.convertedBy,
    };
  }
}
