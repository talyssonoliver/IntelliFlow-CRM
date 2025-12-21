import { DomainEvent } from '../../shared/DomainEvent';
import { OpportunityId } from './OpportunityId';

export type OpportunityStage =
  | 'PROSPECTING'
  | 'QUALIFICATION'
  | 'NEEDS_ANALYSIS'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

/**
 * Event: Opportunity was created
 */
export class OpportunityCreatedEvent extends DomainEvent {
  readonly eventType = 'opportunity.created';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly name: string,
    public readonly value: number,
    public readonly accountId: string,
    public readonly ownerId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      name: this.name,
      value: this.value,
      accountId: this.accountId,
      ownerId: this.ownerId,
    };
  }
}

/**
 * Event: Opportunity stage changed
 */
export class OpportunityStageChangedEvent extends DomainEvent {
  readonly eventType = 'opportunity.stage_changed';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly previousStage: OpportunityStage,
    public readonly newStage: OpportunityStage,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      previousStage: this.previousStage,
      newStage: this.newStage,
      changedBy: this.changedBy,
    };
  }
}

/**
 * Event: Opportunity value updated
 */
export class OpportunityValueUpdatedEvent extends DomainEvent {
  readonly eventType = 'opportunity.value_updated';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly previousValue: number,
    public readonly newValue: number,
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      previousValue: this.previousValue,
      newValue: this.newValue,
      updatedBy: this.updatedBy,
    };
  }
}

/**
 * Event: Opportunity was won
 */
export class OpportunityWonEvent extends DomainEvent {
  readonly eventType = 'opportunity.won';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly value: number,
    public readonly closedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      value: this.value,
      closedBy: this.closedBy,
    };
  }
}

/**
 * Event: Opportunity was lost
 */
export class OpportunityLostEvent extends DomainEvent {
  readonly eventType = 'opportunity.lost';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly reason: string,
    public readonly closedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      reason: this.reason,
      closedBy: this.closedBy,
    };
  }
}

/**
 * Event: Opportunity probability updated
 */
export class OpportunityProbabilityUpdatedEvent extends DomainEvent {
  readonly eventType = 'opportunity.probability_updated';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly previousProbability: number,
    public readonly newProbability: number,
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      previousProbability: this.previousProbability,
      newProbability: this.newProbability,
      updatedBy: this.updatedBy,
    };
  }
}

/**
 * Event: Opportunity expected close date changed
 */
export class OpportunityCloseDateChangedEvent extends DomainEvent {
  readonly eventType = 'opportunity.close_date_changed';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly previousDate: Date | null,
    public readonly newDate: Date,
    public readonly changedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      previousDate: this.previousDate?.toISOString() ?? null,
      newDate: this.newDate.toISOString(),
      changedBy: this.changedBy,
    };
  }
}
