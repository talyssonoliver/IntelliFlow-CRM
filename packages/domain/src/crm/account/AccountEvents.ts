import { DomainEvent } from '../../shared/DomainEvent';
import { AccountId } from './AccountId';

/**
 * Event: Account was created
 */
export class AccountCreatedEvent extends DomainEvent {
  readonly eventType = 'account.created';

  constructor(
    public readonly accountId: AccountId,
    public readonly name: string,
    public readonly ownerId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      name: this.name,
      ownerId: this.ownerId,
    };
  }
}

/**
 * Event: Account was updated
 */
export class AccountUpdatedEvent extends DomainEvent {
  readonly eventType = 'account.updated';

  constructor(
    public readonly accountId: AccountId,
    public readonly updatedFields: string[],
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      updatedFields: this.updatedFields,
      updatedBy: this.updatedBy,
    };
  }
}

/**
 * Event: Account revenue was updated
 */
export class AccountRevenueUpdatedEvent extends DomainEvent {
  readonly eventType = 'account.revenue_updated';

  constructor(
    public readonly accountId: AccountId,
    public readonly previousRevenue: number | null,
    public readonly newRevenue: number,
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      previousRevenue: this.previousRevenue,
      newRevenue: this.newRevenue,
      updatedBy: this.updatedBy,
    };
  }
}

/**
 * Event: Account industry was categorized
 */
export class AccountIndustryCategorizedEvent extends DomainEvent {
  readonly eventType = 'account.industry_categorized';

  constructor(
    public readonly accountId: AccountId,
    public readonly industry: string,
    public readonly categorizedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      industry: this.industry,
      categorizedBy: this.categorizedBy,
    };
  }
}
