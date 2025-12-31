import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { OpportunityId } from './OpportunityId';
import { Money } from '../../shared/Money';
import { Percentage } from '../../shared/Percentage';
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
  constructor(message: string) {
    super(message);
  }
}

export class InvalidProbabilityError extends DomainError {
  readonly code = 'INVALID_PROBABILITY';
  constructor(message: string) {
    super(message);
  }
}

interface OpportunityProps {
  name: string;
  value: Money;
  stage: OpportunityStage;
  probability: Percentage;
  expectedCloseDate?: Date;
  description?: string;
  accountId: string;
  contactId?: string;
  ownerId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

export interface CreateOpportunityProps {
  name: string;
  value: number | Money;
  accountId: string;
  contactId?: string;
  expectedCloseDate?: Date;
  description?: string;
  ownerId: string;
  tenantId: string;
  currency?: string;
}

/**
 * Opportunity Aggregate Root
 * Represents a sales opportunity in the CRM
 */
export class Opportunity extends AggregateRoot<OpportunityId> {
  private readonly props: OpportunityProps;

  private constructor(id: OpportunityId, props: OpportunityProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get name(): string {
    return this.props.name;
  }

  get value(): Money {
    return this.props.value;
  }

  get stage(): OpportunityStage {
    return this.props.stage;
  }

  get probability(): Percentage {
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

  get tenantId(): string {
    return this.props.tenantId;
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

  get weightedValue(): Money {
    // Calculate weighted value: value * (probability / 100)
    const weightedAmount = this.props.value.amount * this.props.probability.asDecimal;
    const weightedMoney = Money.create(weightedAmount, this.props.value.currency);
    return weightedMoney.isSuccess ? weightedMoney.value : this.props.value;
  }

  // Factory method
  static create(props: CreateOpportunityProps): Result<Opportunity, DomainError> {
    // Convert value to Money if number provided
    let moneyValue: Money;
    if (typeof props.value === 'number') {
      const moneyResult = Money.create(props.value, props.currency || 'USD');
      if (moneyResult.isFailure) {
        return Result.fail(new InvalidOpportunityValueError(moneyResult.error.message));
      }
      moneyValue = moneyResult.value;
    } else {
      moneyValue = props.value;
    }

    // Create default probability for prospecting stage
    const probabilityResult = Percentage.create(10);
    if (probabilityResult.isFailure) {
      return Result.fail(probabilityResult.error);
    }

    const now = new Date();
    const opportunityId = OpportunityId.generate();

    const opportunity = new Opportunity(opportunityId, {
      name: props.name,
      value: moneyValue,
      stage: 'PROSPECTING',
      probability: probabilityResult.value,
      expectedCloseDate: props.expectedCloseDate,
      description: props.description,
      accountId: props.accountId,
      contactId: props.contactId,
      ownerId: props.ownerId,
      tenantId: props.tenantId,
      createdAt: now,
      updatedAt: now,
    });

    opportunity.addDomainEvent(
      new OpportunityCreatedEvent(
        opportunityId,
        props.name,
        moneyValue.amount,
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
  ): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    const previousStage = this.props.stage;
    this.props.stage = newStage;
    this.props.updatedAt = new Date();

    // Auto-adjust probability based on stage
    const probabilityResult = this.getDefaultProbabilityForStage(newStage);
    if (probabilityResult.isFailure) {
      return Result.fail(probabilityResult.error);
    }
    this.props.probability = probabilityResult.value;

    this.addDomainEvent(
      new OpportunityStageChangedEvent(this.id, previousStage, newStage, changedBy)
    );

    return Result.ok(undefined);
  }

  updateValue(newValue: number | Money, updatedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    // Convert to Money if number provided
    let moneyValue: Money;
    if (typeof newValue === 'number') {
      const moneyResult = Money.create(newValue, this.props.value.currency);
      if (moneyResult.isFailure) {
        return Result.fail(new InvalidOpportunityValueError(moneyResult.error.message));
      }
      moneyValue = moneyResult.value;
    } else {
      moneyValue = newValue;
    }

    const previousValue = this.props.value;
    this.props.value = moneyValue;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new OpportunityValueUpdatedEvent(this.id, previousValue.amount, moneyValue.amount, updatedBy)
    );

    return Result.ok(undefined);
  }

  updateProbability(newProbability: number | Percentage, updatedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    // Convert to Percentage if number provided
    let percentageValue: Percentage;
    if (typeof newProbability === 'number') {
      const percentageResult = Percentage.create(newProbability);
      if (percentageResult.isFailure) {
        return Result.fail(new InvalidProbabilityError(percentageResult.error.message));
      }
      percentageValue = percentageResult.value;
    } else {
      percentageValue = newProbability;
    }

    const previousProbability = this.props.probability;
    this.props.probability = percentageValue;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new OpportunityProbabilityUpdatedEvent(
        this.id,
        previousProbability.value,
        percentageValue.value,
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

  markAsWon(closedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    this.props.stage = 'CLOSED_WON';

    const probabilityResult = Percentage.create(100);
    if (probabilityResult.isFailure) {
      return Result.fail(probabilityResult.error);
    }
    this.props.probability = probabilityResult.value;

    this.props.closedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OpportunityWonEvent(this.id, this.props.value.amount, closedBy));

    return Result.ok(undefined);
  }

  markAsLost(reason: string, closedBy: string): Result<void, DomainError> {
    if (this.isClosed) {
      return Result.fail(new OpportunityAlreadyClosedError());
    }

    this.props.stage = 'CLOSED_LOST';

    const probabilityResult = Percentage.create(0);
    if (probabilityResult.isFailure) {
      return Result.fail(probabilityResult.error);
    }
    this.props.probability = probabilityResult.value;

    this.props.closedAt = new Date();
    this.props.updatedAt = new Date();

    this.addDomainEvent(new OpportunityLostEvent(this.id, reason, closedBy));

    return Result.ok(undefined);
  }

  reopen(reopenedBy: string): Result<void, DomainError> {
    if (!this.isLost) {
      return Result.fail(new OpportunityNotLostError());
    }

    this.props.stage = 'PROSPECTING';

    const probabilityResult = this.getDefaultProbabilityForStage('PROSPECTING');
    if (probabilityResult.isFailure) {
      return Result.fail(probabilityResult.error);
    }
    this.props.probability = probabilityResult.value;

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
  private getDefaultProbabilityForStage(stage: OpportunityStage): Result<Percentage, DomainError> {
    const stageProb: Record<OpportunityStage, number> = {
      PROSPECTING: 10,
      QUALIFICATION: 20,
      NEEDS_ANALYSIS: 40,
      PROPOSAL: 60,
      NEGOTIATION: 80,
      CLOSED_WON: 100,
      CLOSED_LOST: 0,
    };
    return Percentage.create(stageProb[stage]);
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      name: this.name,
      value: this.value.toValue(),
      stage: this.stage,
      probability: this.probability.toValue(),
      weightedValue: this.weightedValue.toValue(),
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
