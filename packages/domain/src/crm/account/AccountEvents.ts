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
/**
 * Event: Account hierarchy was updated (parent set or removed)
 */
export class AccountHierarchyUpdatedEvent extends DomainEvent {
  readonly eventType = 'account.hierarchy_updated';

  constructor(
    public readonly accountId: AccountId,
    public readonly parentAccountId: string | undefined,
    public readonly updatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      parentAccountId: this.parentAccountId ?? null,
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

/**
 * Event: Account owner was reassigned
 */
export class AccountOwnerAssignedEvent extends DomainEvent {
  readonly eventType = 'account.owner_assigned';

  constructor(
    public readonly accountId: AccountId,
    public readonly previousOwnerId: string,
    public readonly newOwnerId: string,
    public readonly assignedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      previousOwnerId: this.previousOwnerId,
      newOwnerId: this.newOwnerId,
      assignedBy: this.assignedBy,
    };
  }
}

/**
 * Event: Account was deleted
 *
 * Raised by `Account.markAsDeleted()` after the aggregate has been removed from
 * persistence. Mirrors `AccountCreatedEvent` (id / name / ownerId) and adds the
 * `deletedBy` actor for the audit trail and the events-worker dispatcher
 * (IFC-272), consistent with the other account mutation events.
 */
export class AccountDeletedEvent extends DomainEvent {
  readonly eventType = 'account.deleted';

  constructor(
    public readonly accountId: AccountId,
    public readonly name: string,
    public readonly ownerId: string,
    public readonly deletedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      accountId: this.accountId.value,
      name: this.name,
      ownerId: this.ownerId,
      deletedBy: this.deletedBy,
    };
  }
}
