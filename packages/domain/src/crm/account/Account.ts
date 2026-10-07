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
import { DEFAULT_TIER_CONFIG, resolveAccountTier } from './AccountTierConfig';
import { TERRITORY_LIMITS } from './territory/territory-constants';
import {
  isIsoCountryCode,
  normalizeCountry,
  normalizePostalCode,
  normalizeRegion,
} from './territory/territory-matching';

// Default account-tier vocabulary (IFC-273, L-04). Tenants may rename, re-threshold,
// add and remove tiers (PG-196, ADR-073); these are the keys every tenant starts with.
// Mirrors the CONTACT_STATUSES / OPPORTUNITY_STAGES DRY-enum pattern.
export const ACCOUNT_TIERS = ['ENTERPRISE', 'MID_MARKET', 'SMB', 'STARTUP', 'UNKNOWN'] as const;

// Derive type from const array
export type AccountTier = (typeof ACCOUNT_TIERS)[number];

/**
 * Classify an account into a tier by the default annual revenue bands.
 * Pure function — no infra dependency. UNKNOWN when revenue is absent.
 * Tenant-specific tiers resolve through `resolveAccountTier(revenue, config)`.
 */
export function getAccountTier(revenue: number | null | undefined): AccountTier {
  return resolveAccountTier(revenue, DEFAULT_TIER_CONFIG);
}

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

export class InvalidGeographyError extends DomainError {
  readonly code = 'INVALID_GEOGRAPHY';
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
  country?: string | null;
  region?: string | null;
  postalCode?: string | null;
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
  country?: string | null;
  region?: string | null;
  postalCode?: string | null;
  ownerId: string;
  tenantId: string;
}

type GeographyField = 'country' | 'region' | 'postalCode';
type GeographyValues = Partial<Record<GeographyField, string | null>>;
const GEOGRAPHY_FIELDS: readonly GeographyField[] = ['country', 'region', 'postalCode'];

/** BR-1: normalise one geography value; empty → null; invalid → error. */
function normalizeGeographyField(
  field: GeographyField,
  raw: string | null
): Result<string | null, InvalidGeographyError> {
  if (field === 'country') {
    const country = normalizeCountry(raw);
    if (country !== null && !isIsoCountryCode(country)) {
      return Result.fail(
        new InvalidGeographyError(
          `Invalid country code: ${country}. Use an ISO 3166-1 alpha-2 code.`
        )
      );
    }
    return Result.ok(country);
  }
  const value = field === 'region' ? normalizeRegion(raw) : normalizePostalCode(raw);
  const max =
    field === 'region' ? TERRITORY_LIMITS.maxRegionLength : TERRITORY_LIMITS.maxPostalCodeLength;
  if (value !== null && value.length > max) {
    return Result.fail(new InvalidGeographyError(`${field} must be at most ${max} characters.`));
  }
  return Result.ok(value);
}

/** Normalise the supplied geography fields; undefined fields are left out. */
function normalizeGeography(
  input: GeographyValues
): Result<GeographyValues, InvalidGeographyError> {
  const normalized: GeographyValues = {};
  for (const field of GEOGRAPHY_FIELDS) {
    const raw = input[field];
    if (raw === undefined) continue;
    const result = normalizeGeographyField(field, raw);
    if (result.isFailure) return Result.fail(result.error);
    normalized[field] = result.value;
  }
  return Result.ok(normalized);
}

/**
 * IFC-270 B-08: fields accepted by the combined {@link Account.updateAccountInfo}
 * command. parentAccountId is intentionally absent — hierarchy changes go through
 * setParent (cycle/depth/existence checks live in AccountService).
 */
type AccountInfoUpdates = Partial<{
  name: string;
  website: string | WebsiteUrl;
  description: string;
  revenue: number;
  employees: number;
  industry: string;
  // PG-197: undefined = unchanged, null = clear.
  country: string | null;
  region: string | null;
  postalCode: string | null;
}>;

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

  get country(): string | null {
    return this.props.country ?? null;
  }

  get region(): string | null {
    return this.props.region ?? null;
  }

  get postalCode(): string | null {
    return this.props.postalCode ?? null;
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

    const geography = normalizeGeography({
      country: props.country ?? null,
      region: props.region ?? null,
      postalCode: props.postalCode ?? null,
    });
    if (geography.isFailure) {
      return Result.fail(geography.error);
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
      country: geography.value.country ?? null,
      region: geography.value.region ?? null,
      postalCode: geography.value.postalCode ?? null,
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
  updateAccountInfo(updates: AccountInfoUpdates, updatedBy: string): Result<void, DomainError> {
    // Validate every fallible field BEFORE mutating any state, so a failed update
    // leaves the aggregate unchanged (atomic command — IFC-271/IFC-270).
    const validated = this.validateAccountInfoUpdates(updates);
    if (validated.isFailure) {
      return Result.fail(validated.error);
    }

    const geography = normalizeGeography(updates);
    if (geography.isFailure) {
      return Result.fail(geography.error);
    }

    const updatedFields = [
      ...this.applyAccountInfoUpdates(updates, validated.value),
      ...this.applyGeographyUpdates(geography.value),
    ];

    if (updatedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(new AccountUpdatedEvent(this.id, updatedFields, updatedBy));
    }

    return Result.ok(undefined);
  }

  /**
   * Validate the fallible fields of a combined update and resolve the website
   * value object. Returns a failed Result on the first invalid field so the
   * aggregate is never partially mutated. (Extracted to keep updateAccountInfo
   * within the cognitive-complexity budget — behaviour is unchanged.)
   */
  private validateAccountInfoUpdates(
    updates: AccountInfoUpdates
  ): Result<WebsiteUrl | undefined, DomainError> {
    let newWebsite: WebsiteUrl | undefined;
    if (updates.website !== undefined) {
      if (typeof updates.website === 'string') {
        const websiteResult = WebsiteUrl.create(updates.website);
        if (websiteResult.isFailure) {
          return Result.fail(websiteResult.error);
        }
        newWebsite = websiteResult.value;
      } else {
        newWebsite = updates.website;
      }
    }

    // IFC-270 B-08: revenue/employees carry the same invariants as the dedicated
    // updateRevenue/updateEmployeeCount commands.
    if (updates.revenue !== undefined && updates.revenue < 0) {
      return Result.fail(new InvalidRevenueError(updates.revenue));
    }
    if (updates.employees !== undefined && updates.employees <= 0) {
      return Result.fail(new InvalidEmployeeCountError(updates.employees));
    }

    return Result.ok(newWebsite);
  }

  /**
   * Apply the (already validated) updates, mutating only fields that changed and
   * returning the list of changed field names for the AccountUpdatedEvent.
   * parentAccountId is intentionally NOT handled here — hierarchy changes go
   * through setParent (cross-aggregate checks owned by AccountService).
   */
  private applyAccountInfoUpdates(
    updates: AccountInfoUpdates,
    newWebsite: WebsiteUrl | undefined
  ): string[] {
    const updatedFields: string[] = [];

    if (updates.name !== undefined && updates.name !== this.props.name) {
      this.props.name = updates.name;
      updatedFields.push('name');
    }
    // newWebsite is set iff a website was supplied (and validated), narrowing it
    // to a defined WebsiteUrl for the equality check.
    if (newWebsite !== undefined && !this.props.website?.equals(newWebsite)) {
      this.props.website = newWebsite;
      updatedFields.push('website');
    }
    if (updates.description !== undefined && updates.description !== this.props.description) {
      this.props.description = updates.description;
      updatedFields.push('description');
    }
    if (updates.revenue !== undefined && updates.revenue !== this.props.revenue) {
      this.props.revenue = updates.revenue;
      updatedFields.push('revenue');
    }
    if (updates.employees !== undefined && updates.employees !== this.props.employees) {
      this.props.employees = updates.employees;
      updatedFields.push('employees');
    }
    if (updates.industry !== undefined && updates.industry !== this.props.industry) {
      this.props.industry = updates.industry;
      updatedFields.push('industry');
    }

    return updatedFields;
  }

  /**
   * PG-197: apply normalised geography values (null clears), returning the
   * changed field names. Never touches the owner (BR-2).
   */
  private applyGeographyUpdates(values: GeographyValues): string[] {
    const updatedFields: string[] = [];
    for (const field of GEOGRAPHY_FIELDS) {
      const value = values[field];
      if (value === undefined || value === (this.props[field] ?? null)) continue;
      this.props[field] = value;
      updatedFields.push(field);
    }
    return updatedFields;
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
      country: this.country,
      region: this.region,
      postalCode: this.postalCode,
      ownerId: this.ownerId,
      tenantId: this.tenantId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
