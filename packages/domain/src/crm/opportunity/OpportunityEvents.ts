import { DomainEvent } from '../../shared/DomainEvent';
import { OpportunityId } from './OpportunityId';

// Canonical enum values - single source of truth
export const OPPORTUNITY_STAGES = [
  'PROSPECTING',
  'QUALIFICATION',
  'NEEDS_ANALYSIS',
  'PROPOSAL',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const;

// Derive type from const array
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

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
    public readonly ownerId: string,
    public readonly sourceLeadId?: string
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
      sourceLeadId: this.sourceLeadId ?? null,
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

/**
 * Event: Lost opportunity was reopened
 */
export class OpportunityReopenedEvent extends DomainEvent {
  readonly eventType = 'opportunity.reopened';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly reopenedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      reopenedBy: this.reopenedBy,
    };
  }
}

/**
 * Event: Deal won with enriched context for downstream consumers
 * Published by CloseDealWonUseCase after the domain's OpportunityWonEvent.
 * Carries full context so consumers don't need additional DB lookups.
 * IFC-065: FLOW-009 Deal Won Closure Workflow
 */
export class DealWonEnrichedEvent extends DomainEvent {
  readonly eventType = 'opportunity.deal_won_enriched';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly value: number,
    public readonly currency: string,
    public readonly accountId: string,
    public readonly contactId: string | undefined,
    public readonly ownerId: string,
    public readonly tenantId: string,
    public readonly closedBy: string,
    public readonly closedAt: Date,
    public readonly salesCycleDays: number,
    public readonly opportunityName: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      value: this.value,
      currency: this.currency,
      accountId: this.accountId,
      contactId: this.contactId ?? null,
      ownerId: this.ownerId,
      tenantId: this.tenantId,
      closedBy: this.closedBy,
      closedAt: this.closedAt.toISOString(),
      salesCycleDays: this.salesCycleDays,
      opportunityName: this.opportunityName,
    };
  }
}

/**
 * Event: Deal lost with enriched context for downstream consumers
 * Published by CloseDealLostUseCase after the domain's OpportunityLostEvent.
 * Carries full context so consumers don't need additional DB lookups.
 * IFC-066: FLOW-009 Deal Lost Closure Workflow
 */
export class DealLostEnrichedEvent extends DomainEvent {
  readonly eventType = 'opportunity.deal_lost_enriched';

  constructor(
    public readonly opportunityId: OpportunityId,
    public readonly value: number,
    public readonly currency: string,
    public readonly accountId: string,
    public readonly contactId: string | undefined,
    public readonly ownerId: string,
    public readonly tenantId: string,
    public readonly closedBy: string,
    public readonly closedAt: Date,
    public readonly salesCycleDays: number,
    public readonly opportunityName: string,
    public readonly lossReason: string,
    public readonly stageAtLoss: OpportunityStage
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      opportunityId: this.opportunityId.value,
      value: this.value,
      currency: this.currency,
      accountId: this.accountId,
      contactId: this.contactId ?? null,
      ownerId: this.ownerId,
      tenantId: this.tenantId,
      closedBy: this.closedBy,
      closedAt: this.closedAt.toISOString(),
      salesCycleDays: this.salesCycleDays,
      opportunityName: this.opportunityName,
      lossReason: this.lossReason,
      stageAtLoss: this.stageAtLoss,
    };
  }
}
