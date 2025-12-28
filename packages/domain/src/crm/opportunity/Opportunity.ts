import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { OpportunityId } from './OpportunityId';
import {
  OpportunityStage,
  OpportunityCreatedEvent,
  OpportunityStageChangedEvent,
  OpportunityValueUpdatedEvent,
  OpportunityWonEvent,
  OpportunityLostEvent,
  OpportunityProbabilityUpdatedEvent,
  OpportunityCloseDateChangedEvent,
  OpportunityReopenedEvent,
} from './OpportunityEvents';

export class OpportunityAlreadyClosedError extends DomainError {
  readonly code = 'OPPORTUNITY_ALREADY_CLOSED';
  constructor() {
    super('Opportunity has already been closed');
  }
}

export class OpportunityNotLostError extends DomainError {
  readonly code = 'OPPORTUNITY_NOT_LOST';
  constructor() {
    super('Only lost opportunities can be reopened');
  }
}

export class InvalidOpportunityValueError extends DomainError {
  readonly code = 'INVALID_OPPORTUNITY_VALUE';
  constructor(value: number) {
    super(`Invalid opportunity value: ${value}. Value must be positive.`);
  }
}

export class InvalidProbabilityError extends DomainError {
  readonly code = 'INVALID_PROBABILITY';
  constructor(value: number) {
    super(`Invalid probability: ${value}. Probability must be between 0 and 100.`);
  }
}

interface OpportunityProps {
  name: string;
  value: number;
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate?: Date;
  description?: string;
  accountId: string;
  contactId?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface CreateOpportunityProps {
  name: string;
  value: number;
  accountId: string;
  contactId?: string;
  expectedCloseDate?: Date;
  description?: string;
  ownerId: string;
}

/**
 * Opportunity Aggregate Root
 * Represents a sales opportunity in the CRM
 */
export class Opportunity extends AggregateRoot<OpportunityId> {
  private props: OpportunityProps;

  private constructor(id: OpportunityId, props: OpportunityProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get name(): string {
    return this.props.name;
  }

  get value(): number {
    return this.props.value;
  }

  get stage(): OpportunityStage {
    return this.props.stage;
  }

  get probability(): number {
    return this.props.probability;
  }

  get expectedCloseDate(): Date | undefined {
    return this.props.expectedCloseDate;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get accountId(): string {
    return this.props.accountId;
  }

  get contactId(): string | undefined {
    return this.props.contactId;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get closedAt(): Date | undefined {
    return this.props.closedAt;
  }

  get isClosed(): boolean {
    return this.props.stage === 'CLOSED_WON' || this.props.stage === 'CLOSED_LOST';
  }

  get isWon(): boolean {
    return this.props.stage === 'CLOSED_WON';
  }

  get isLost(): boolean {
    return this.props.stage === 'CLOSED_LOST';
  }

  get weightedValue(): number {
    return (this.props.value * this.props.probability) / 100;
  }

  // Factory method
  static create(props: CreateOpportunityProps): Result<Opportunity, DomainError> {
    if (props.value <= 0) {
      return Result.fail(new InvalidOpportunityValueError(props.value));
    }

    const now = new Date();
    const opportunityId = OpportunityId.generate();

    const opportunity = new Opportunity(opportunityId, {
      name: props.name,
      value: props.value,
      stage: 'PROSPECTING',
      probability: 10, // Default probability for prospecting stage
      expectedCloseDate: props.expectedCloseDate,
      description: props.description,
      accountId: props.accountId,
      contactId: props.contactId,
      ownerId: props.ownerId,
      createdAt: now,
      updatedAt: now,
    });

    opportunity.addDomainEvent(
      new OpportunityCreatedEvent(
        opportunityId,
        props.name,
        props.value,
        props.accountId,
        props.ownerId
      )
    );

    return Result.ok(opportunity);
  }

  // Reconstitute from persistence
  static reconstitute(id: OpportunityId, props: OpportunityProps): Opportunity {
    return new Opportunity(id, props);
  }

  // Commands
  changeStage(
    newStage: OpportunityStage,
    changedBy: string
  ): Result<void, OpportunityAlreadyClosedError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    const previousStage = this.props.stage;
    this.props.stage = newStage;
    this.props.updatedAt = new Date();

    // Auto-adjust probability based on stage
    this.props.probability = this.getDefaultProbabilityForStage(newStage);

    this.addDomainEvent(
      new OpportunityStageChangedEvent(this.id, previousStage, newStage, changedBy)
    );

    return Result.ok(undefined);
  }

  updateValue(newValue: number, updatedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    if (newValue <= 0) {
      return Result.fail(new InvalidOpportunityValueError(newValue));
    }

    const previousValue = this.props.value;
    this.props.value = newValue;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new OpportunityValueUpdatedEvent(this.id, previousValue, newValue, updatedBy)
    );

    return Result.ok(undefined);
  }

  updateProbability(newProbability: number, updatedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    if (newProbability < 0 || newProbability > 100) {
      return Result.fail(new InvalidProbabilityError(newProbability));
    }

    const previousProbability = this.props.probability;
    this.props.probability = newProbability;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new OpportunityProbabilityUpdatedEvent(
        this.id,
        previousProbability,
        newProbability,
        updatedBy
      )
    );

    return Result.ok(undefined);
  }

  updateExpectedCloseDate(
    newDate: Date,
    changedBy: string
  ): Result<void, OpportunityAlreadyClosedError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    const previousDate = this.props.expectedCloseDate ?? null;
    this.props.expectedCloseDate = newDate;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new OpportunityCloseDateChangedEvent(this.id, previousDate, newDate, changedBy)
    );

    return Result.ok(undefined);
  }

  markAsWon(closedBy: string): Result<void, OpportunityAlreadyClosedError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    this.props.stage = 'CLOSED_WON';
    this.props.probability = 100;
    this.props.closedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OpportunityWonEvent(this.id, this.props.value, closedBy));

    return Result.ok(undefined);
  }

  markAsLost(reason: string, closedBy: string): Result<void, OpportunityAlreadyClosedError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    this.props.stage = 'CLOSED_LOST';
    this.props.probability = 0;
    this.props.closedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OpportunityLostEvent(this.id, reason, closedBy));

    return Result.ok(undefined);
  }

  reopen(reopenedBy: string): Result<void, OpportunityNotLostError> {
    if (!this.isLost) {
      return Result.fail(new OpportunityNotLostError());
    }

    this.props.stage = 'PROSPECTING';
    this.props.probability = this.getDefaultProbabilityForStage('PROSPECTING');
    this.props.closedAt = undefined;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OpportunityReopenedEvent(this.id, reopenedBy));

    return Result.ok(undefined);
  }

  updateDescription(description: string): void {
    this.props.description = description;
    this.props.updatedAt = new Date();
  }

  // Private helpers
  private getDefaultProbabilityForStage(stage: OpportunityStage): number {
    const stageProb: Record<OpportunityStage, number> = {
      PROSPECTING: 10,
      QUALIFICATION: 20,
      NEEDS_ANALYSIS: 40,
      PROPOSAL: 60,
      NEGOTIATION: 80,
      CLOSED_WON: 100,
      CLOSED_LOST: 0,
    };
    return stageProb[stage];
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      name: this.name,
      value: this.value,
      stage: this.stage,
      probability: this.probability,
      weightedValue: this.weightedValue,
      expectedCloseDate: this.expectedCloseDate?.toISOString(),
      description: this.description,
      accountId: this.accountId,
      contactId: this.contactId,
      ownerId: this.ownerId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      closedAt: this.closedAt?.toISOString(),
    };
  }
}
