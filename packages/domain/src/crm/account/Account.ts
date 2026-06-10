import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { AccountId } from './AccountId';
import { WebsiteUrl } from '../../shared/WebsiteUrl';
import {
  AccountCreatedEvent,
  AccountUpdatedEvent,
  AccountRevenueUpdatedEvent,
  AccountIndustryCategorizedEvent,
  AccountHierarchyUpdatedEvent,
  AccountOwnerAssignedEvent,
  AccountDeletedEvent,
} from './AccountEvents';

export class InvalidRevenueError extends DomainError {
  readonly code = 'INVALID_REVENUE';
  constructor(value: number) {
    super(`Invalid revenue value: ${value}. Revenue must be non-negative.`);
  }
}

export class InvalidEmployeeCountError extends DomainError {
  readonly code = 'INVALID_EMPLOYEE_COUNT';
  constructor(value: number) {
    super(`Invalid employee count: ${value}. Employee count must be positive.`);
  }
}

export class InvalidHierarchyError extends DomainError {
  readonly code = 'INVALID_HIERARCHY';
  constructor(message: string) {
    super(message);
  }
}

export class SameOwnerError extends DomainError {
  readonly code = 'SAME_OWNER';
  constructor(ownerId: string) {
    super(`Account is already owned by user: ${ownerId}`);
  }
}

interface AccountProps {
  name: string;
  website?: WebsiteUrl;
  industry?: string;
  employees?: number;
  revenue?: number;
  description?: string;
  parentAccountId?: string;
  ownerId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountProps {
  name: string;
  website?: string | WebsiteUrl;
  industry?: string;
  employees?: number;
  revenue?: number;
  description?: string;
  parentAccountId?: string;
  ownerId: string;
  tenantId: string;
}

/**
 * Account Aggregate Root
 * Represents a company/organization in the CRM
 */
export class Account extends AggregateRoot<AccountId> {
  private readonly props: AccountProps;

  private constructor(id: AccountId, props: AccountProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get name(): string {
    return this.props.name;
  }

  get website(): WebsiteUrl | undefined {
    return this.props.website;
  }

  get industry(): string | undefined {
    return this.props.industry;
  }

  get employees(): number | undefined {
    return this.props.employees;
  }

  get revenue(): number | undefined {
    return this.props.revenue;
  }

  get description(): string | undefined {
    return this.props.description;
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

  get parentAccountId(): string | undefined {
    return this.props.parentAccountId;
  }

  get hasIndustry(): boolean {
    return this.props.industry !== undefined;
  }

  get hasRevenue(): boolean {
    return this.props.revenue !== undefined;
  }

  // Factory method
  static create(props: CreateAccountProps): Result<Account, DomainError> {
    // Validate revenue if provided
    if (props.revenue !== undefined && props.revenue < 0) {
      return Result.fail(new InvalidRevenueError(props.revenue));
    }

    // Validate employee count if provided
    if (props.employees !== undefined && props.employees <= 0) {
      return Result.fail(new InvalidEmployeeCountError(props.employees));
    }

    // Convert website to WebsiteUrl if string provided
    let websiteUrl: WebsiteUrl | undefined = undefined;
    if (props.website) {
      if (typeof props.website === 'string') {
        const websiteResult = WebsiteUrl.create(props.website);
        if (websiteResult.isFailure) {
          return Result.fail(websiteResult.error);
        }
        websiteUrl = websiteResult.value;
      } else {
        // Already a WebsiteUrl instance
        websiteUrl = props.website;
      }
    }

    const now = new Date();
    const accountId = AccountId.generate();

    const account = new Account(accountId, {
      name: props.name,
      website: websiteUrl,
      industry: props.industry,
      employees: props.employees,
      revenue: props.revenue,
      description: props.description,
      parentAccountId: props.parentAccountId,
      ownerId: props.ownerId,
      tenantId: props.tenantId,
      createdAt: now,
      updatedAt: now,
    });

    account.addDomainEvent(new AccountCreatedEvent(accountId, props.name, props.ownerId));

    return Result.ok(account);
  }

  // Reconstitute from persistence
  static reconstitute(id: AccountId, props: AccountProps): Account {
    return new Account(id, props);
  }

  // Commands
  updateAccountInfo(
    updates: Partial<{
      name: string;
      website: string | WebsiteUrl;
      description: string;
    }>,
    updatedBy: string
  ): Result<void, DomainError> {
    const updatedFields: string[] = [];

    if (updates.name !== undefined && updates.name !== this.props.name) {
      this.props.name = updates.name;
      updatedFields.push('name');
    }

    if (updates.website !== undefined) {
      let newWebsite: WebsiteUrl | undefined;

      if (typeof updates.website === 'string') {
        const websiteResult = WebsiteUrl.create(updates.website);
        if (websiteResult.isFailure) {
          return Result.fail(websiteResult.error);
        }
        newWebsite = websiteResult.value;
      } else {
        newWebsite = updates.website;
      }

      if (!this.props.website?.equals(newWebsite)) {
        this.props.website = newWebsite;
        updatedFields.push('website');
      }
    }

    if (updates.description !== undefined && updates.description !== this.props.description) {
      this.props.description = updates.description;
      updatedFields.push('description');
    }

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new AccountUpdatedEvent(this.id, updatedFields, updatedBy));
    }

    return Result.ok(undefined);
  }

  updateRevenue(newRevenue: number, updatedBy: string): Result<void, InvalidRevenueError> {
    if (newRevenue < 0) {
      return Result.fail(new InvalidRevenueError(newRevenue));
    }

    const previousRevenue = this.props.revenue ?? null;
    this.props.revenue = newRevenue;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new AccountRevenueUpdatedEvent(this.id, previousRevenue, newRevenue, updatedBy)
    );

    return Result.ok(undefined);
  }

  updateEmployeeCount(
    newCount: number,
    updatedBy: string
  ): Result<void, InvalidEmployeeCountError> {
    if (newCount <= 0) {
      return Result.fail(new InvalidEmployeeCountError(newCount));
    }

    this.props.employees = newCount;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AccountUpdatedEvent(this.id, ['employees'], updatedBy));

    return Result.ok(undefined);
  }

  setParent(parentAccountId: string, updatedBy: string): Result<void, InvalidHierarchyError> {
    if (parentAccountId === this.id.value) {
      return Result.fail(new InvalidHierarchyError('Account cannot be its own parent'));
    }
    this.props.parentAccountId = parentAccountId;
    this.props.updatedAt = new Date();
    this.addDomainEvent(new AccountHierarchyUpdatedEvent(this.id, parentAccountId, updatedBy));
    return Result.ok(undefined);
  }

  removeParent(updatedBy: string): void {
    if (!this.props.parentAccountId) return;
    this.props.parentAccountId = undefined;
    this.props.updatedAt = new Date();
    this.addDomainEvent(new AccountHierarchyUpdatedEvent(this.id, undefined, updatedBy));
  }

  categorizeIndustry(industry: string, categorizedBy: string): void {
    this.props.industry = industry;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new AccountIndustryCategorizedEvent(this.id, industry, categorizedBy));
  }

  assignOwner(newOwnerId: string, assignedBy: string): Result<void, SameOwnerError> {
    if (newOwnerId === this.props.ownerId) {
      return Result.fail(new SameOwnerError(newOwnerId));
    }

    const previousOwnerId = this.props.ownerId;
    this.props.ownerId = newOwnerId;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new AccountOwnerAssignedEvent(this.id, previousOwnerId, newOwnerId, assignedBy)
    );

    return Result.ok(undefined);
  }

  /**
   * Mark this account as deleted, raising an {@link AccountDeletedEvent}.
   *
   * The aggregate is removed from persistence by the application layer; this
   * records the deletion as a domain event so the audit trail and downstream
   * consumers (events worker — IFC-272) observe it. There is no aggregate-level
   * invariant on deletion — the cross-aggregate rules (no contacts, no active
   * opportunities) are enforced by the service.
   */
  markAsDeleted(deletedBy: string): void {
    this.addDomainEvent(
      new AccountDeletedEvent(this.id, this.props.name, this.props.ownerId, deletedBy)
    );
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      name: this.name,
      website: this.website?.toValue(),
      industry: this.industry,
      employees: this.employees,
      revenue: this.revenue,
      description: this.description,
      parentAccountId: this.parentAccountId,
      ownerId: this.ownerId,
      tenantId: this.tenantId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
