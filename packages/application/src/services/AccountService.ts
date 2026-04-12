import {
  Result,
  DomainError,
  Account,
  AccountId,
  AccountRepository,
  ContactRepository,
  OpportunityRepository,
  CreateAccountProps,
  type AccountHierarchyRecord,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError, NotFoundError } from '../errors';

/**
 * Account tier based on revenue
 */
export type AccountTier = 'ENTERPRISE' | 'MID_MARKET' | 'SMB' | 'STARTUP';

/**
 * Account tier thresholds (annual revenue in currency units)
 */
export const ACCOUNT_TIER_THRESHOLDS = {
  ENTERPRISE: 10_000_000,
  MID_MARKET: 1_000_000,
  SMB: 100_000,
  STARTUP: 0,
} as const;

const THIRTY_DAYS_IN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Account hierarchy relationship (legacy — kept for backward compatibility)
 */
export interface AccountHierarchy {
  parentAccountId?: string;
  childAccountIds: string[];
}

/**
 * Hierarchy tree node for UI rendering
 */
export interface HierarchyNode {
  id: string;
  name: string;
  industry?: string;
  revenue?: number;
  _count: { contacts: number; opportunities: number };
  children: HierarchyNode[];
}

/**
 * Hierarchy response for the getHierarchy endpoint
 */
export interface HierarchyResponse {
  ancestors: Array<{ id: string; name: string }>;
  current: HierarchyNode;
  rootAccount: { id: string; name: string } | null;
}

/**
 * Account health score factors
 */
export interface AccountHealthScore {
  overallScore: number;
  opportunityValue: number;
  contactEngagement: number;
  recentActivity: number;
  tier: AccountTier;
}

/**
 * Account Service
 *
 * Orchestrates account-related business logic including:
 * - Account creation and management
 * - Account hierarchy (parent/child relationships)
 * - Account billing and revenue tracking
 * - Account health scoring
 * - Industry categorization
 */
export class AccountService {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly contactRepository: ContactRepository,
    private readonly opportunityRepository: OpportunityRepository,
    private readonly eventBus: EventBusPort
  ) {}

  /**
   * Create a new account with validation
   */
  async createAccount(props: CreateAccountProps): Promise<Result<Account, DomainError>> {
    // Check for duplicate name within tenant (IFC-269 B-03)
    const existingAccount = await this.accountRepository.existsByName(props.name, props.tenantId);
    if (existingAccount) {
      return Result.fail(new ValidationError(`Account with name "${props.name}" already exists`));
    }

    // Create account
    const accountResult = Account.create(props);
    if (accountResult.isFailure) {
      return Result.fail(accountResult.error);
    }

    const account = accountResult.value;

    // Persist
    try {
      await this.accountRepository.save(account);
    } catch {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    // Publish events
    await this.publishEvents(account);

    return Result.ok(account);
  }

  /**
   * Get account by ID
   */
  async getAccountById(accountId: string, tenantId: string): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new NotFoundError(`Account not found: ${accountId}`));
    }

    return Result.ok(account);
  }

  /**
   * Update account basic information
   */
  async updateAccountInfo(
    accountId: string,
    updates: {
      name?: string;
      website?: string;
      description?: string;
    },
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new NotFoundError(`Account not found: ${accountId}`));
    }

    // Check for name uniqueness within tenant if changing name (IFC-269 B-03)
    if (updates.name && updates.name !== account.name) {
      const existingAccount = await this.accountRepository.existsByName(updates.name, tenantId);
      if (existingAccount) {
        return Result.fail(
          new ValidationError(`Account with name "${updates.name}" already exists`)
        );
      }
    }

    account.updateAccountInfo(updates, updatedBy);

    try {
      await this.accountRepository.save(account);
    } catch {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    await this.publishEvents(account);

    return Result.ok(account);
  }

  /**
   * Update account revenue with validation
   */
  async updateRevenue(
    accountId: string,
    newRevenue: number,
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const updateResult = account.updateRevenue(newRevenue, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.accountRepository.save(account);
    } catch {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    await this.publishEvents(account);

    return Result.ok(account);
  }

  /**
   * Update employee count
   */
  async updateEmployeeCount(
    accountId: string,
    newCount: number,
    updatedBy: string,
    tenantId: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const updateResult = account.updateEmployeeCount(newCount, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.accountRepository.save(account);
    } catch {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    await this.publishEvents(account);

    return Result.ok(account);
  }

  /**
   * Categorize account industry
   */
  async categorizeIndustry(
    accountId: string,
    industry: string,
    categorizedBy: string,
    tenantId: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    account.categorizeIndustry(industry, categorizedBy);

    try {
      await this.accountRepository.save(account);
    } catch {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    await this.publishEvents(account);

    return Result.ok(account);
  }

  /**
   * Get account tier based on revenue
   */
  getAccountTier(revenue: number | undefined): AccountTier {
    if (!revenue) return 'STARTUP';

    if (revenue >= ACCOUNT_TIER_THRESHOLDS.ENTERPRISE) return 'ENTERPRISE';
    if (revenue >= ACCOUNT_TIER_THRESHOLDS.MID_MARKET) return 'MID_MARKET';
    if (revenue >= ACCOUNT_TIER_THRESHOLDS.SMB) return 'SMB';
    return 'STARTUP';
  }

  /**
   * Calculate account health score
   */
  async calculateAccountHealth(
    accountId: string,
    tenantId: string
  ): Promise<Result<AccountHealthScore, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    // Get related data
    const [contacts, opportunities] = await Promise.all([
      this.contactRepository.findByAccountId(accountId),
      this.opportunityRepository.findByAccountId(accountId),
    ]);

    // Calculate opportunity value score (0-100)
    const activeOpportunities = opportunities.filter((o) => !o.isClosed);
    const totalOpportunityValue = activeOpportunities.reduce((sum, o) => sum + o.value.amount, 0);
    const opportunityValueScore = Math.min(100, Math.log10(totalOpportunityValue + 1) * 20);

    // Calculate contact engagement score (0-100)
    const contactCount = contacts.length;
    const contactEngagementScore = Math.min(100, contactCount * 20);

    // Calculate recent activity score (based on opportunities)
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_IN_MS);

    const recentOpportunities = opportunities.filter((o) => o.updatedAt >= thirtyDaysAgo);
    const recentActivityScore = Math.min(100, recentOpportunities.length * 25);

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      opportunityValueScore * 0.4 + contactEngagementScore * 0.3 + recentActivityScore * 0.3
    );

    return Result.ok({
      overallScore,
      opportunityValue: Math.round(opportunityValueScore),
      contactEngagement: Math.round(contactEngagementScore),
      recentActivity: Math.round(recentActivityScore),
      tier: this.getAccountTier(account.revenue),
    });
  }

  /**
   * Get high-value accounts
   */
  async getHighValueAccounts(
    minRevenue: number = ACCOUNT_TIER_THRESHOLDS.MID_MARKET,
    ownerId?: string,
    tenantId?: string
  ): Promise<Account[]> {
    const accounts =
      ownerId && tenantId ? await this.accountRepository.findByOwnerId(ownerId, tenantId) : [];

    return accounts.filter((a) => (a.revenue ?? 0) >= minRevenue);
  }

  /**
   * Get accounts by industry
   */
  async getAccountsByIndustry(industry: string, tenantId: string): Promise<Account[]> {
    return this.accountRepository.findByIndustry(industry, tenantId);
  }

  /**
   * Get account with full context (contacts, opportunities)
   */
  async getAccountWithContext(
    accountId: string,
    tenantId: string
  ): Promise<
    Result<
      {
        account: Account;
        contacts: number;
        opportunities: {
          total: number;
          totalValue: number;
          activeCount: number;
        };
        tier: AccountTier;
      },
      DomainError
    >
  > {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const [contacts, opportunities] = await Promise.all([
      this.contactRepository.countByAccountId(accountId),
      this.opportunityRepository.findByAccountId(accountId),
    ]);

    const activeOpportunities = opportunities.filter((o) => !o.isClosed);
    const totalValue = opportunities.reduce((sum, o) => sum + o.value.amount, 0);

    return Result.ok({
      account,
      contacts,
      opportunities: {
        total: opportunities.length,
        totalValue,
        activeCount: activeOpportunities.length,
      },
      tier: this.getAccountTier(account.revenue),
    });
  }

  /**
   * Get account statistics
   */
  async getAccountStatistics(
    ownerId?: string,
    tenantId?: string
  ): Promise<{
    total: number;
    byTier: Record<AccountTier, number>;
    byIndustry: Record<string, number>;
    totalRevenue: number;
    averageRevenue: number;
  }> {
    const accounts =
      ownerId && tenantId ? await this.accountRepository.findByOwnerId(ownerId, tenantId) : [];

    const byTier: Record<AccountTier, number> = {
      ENTERPRISE: 0,
      MID_MARKET: 0,
      SMB: 0,
      STARTUP: 0,
    };

    const byIndustry: Record<string, number> = {};
    let totalRevenue = 0;

    accounts.forEach((account) => {
      // Count by tier
      const tier = this.getAccountTier(account.revenue);
      byTier[tier]++;

      // Count by industry
      const industry = account.industry ?? 'Uncategorized';
      byIndustry[industry] = (byIndustry[industry] ?? 0) + 1;

      // Sum revenue
      totalRevenue += account.revenue ?? 0;
    });

    return {
      total: accounts.length,
      byTier,
      byIndustry,
      totalRevenue,
      averageRevenue: accounts.length > 0 ? totalRevenue / accounts.length : 0,
    };
  }

  /**
   * Delete account with business rules
   */
  async deleteAccount(accountId: string, tenantId: string): Promise<Result<void, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    // Business rule: Cannot delete account with associated contacts
    const contactCount = await this.contactRepository.countByAccountId(accountId);
    if (contactCount > 0) {
      return Result.fail(
        new ValidationError(
          `Cannot delete account with ${contactCount} associated contacts. Reassign or delete contacts first.`
        )
      );
    }

    // Business rule: Cannot delete account with active opportunities
    const opportunities = await this.opportunityRepository.findByAccountId(accountId);
    const activeOpportunities = opportunities.filter((o) => !o.isClosed);
    if (activeOpportunities.length > 0) {
      return Result.fail(
        new ValidationError(
          `Cannot delete account with ${activeOpportunities.length} active opportunities. Close or reassign them first.`
        )
      );
    }

    try {
      await this.accountRepository.delete(accountIdResult.value, tenantId);
    } catch {
      return Result.fail(new PersistenceError('Failed to delete account'));
    }

    return Result.ok(undefined);
  }

  // =========================================================================
  // IFC-185: New methods for Account router endpoints
  // =========================================================================

  /**
   * Get contacts associated with an account
   * Supports cursor-based pagination for performance
   */
  async getAccountContacts(
    accountId: string,
    tenantId: string,
    options: {
      limit: number;
      cursor?: string;
      status?: string[];
    }
  ): Promise<
    Result<
      {
        contacts: Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          phone?: string;
          status: string;
          createdAt: Date;
        }>;
        nextCursor?: string;
        total: number;
      },
      DomainError
    >
  > {
    // Validate account ID
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    // Verify account exists within tenant (IFC-269: repository-level isolation)
    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new NotFoundError(`Account with ID ${accountId} not found`));
    }

    // Get contacts for account
    const contacts = await this.contactRepository.findByAccountId(accountId);

    // Apply status filter if provided
    let filteredContacts = contacts;
    if (options.status && options.status.length > 0) {
      filteredContacts = contacts.filter((c) => options.status!.includes(c.status));
    }

    // Apply cursor-based pagination
    let startIndex = 0;
    if (options.cursor) {
      const cursorIndex = filteredContacts.findIndex((c) => c.id.toString() === options.cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedContacts = filteredContacts.slice(startIndex, startIndex + options.limit + 1);
    const hasMore = paginatedContacts.length > options.limit;
    const results = hasMore ? paginatedContacts.slice(0, -1) : paginatedContacts;

    return Result.ok({
      contacts: results.map((c) => ({
        id: c.id.toString(),
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email.toValue(),
        phone: c.phone?.toValue(),
        status: c.status,
        createdAt: c.createdAt,
      })),
      nextCursor: hasMore ? results.at(-1)?.id.toString() : undefined,
      total: filteredContacts.length,
    });
  }

  /**
   * Get opportunities associated with an account
   * Supports cursor-based pagination and stage filtering
   */
  async getAccountOpportunities(
    accountId: string,
    tenantId: string,
    options: {
      limit: number;
      cursor?: string;
      stage?: string[];
    }
  ): Promise<
    Result<
      {
        opportunities: Array<{
          id: string;
          name: string;
          stage: string;
          value: number;
          probability: number;
          expectedCloseDate?: Date;
          createdAt: Date;
        }>;
        nextCursor?: string;
        total: number;
        summary: {
          totalValue: number;
          weightedValue: number;
          stageBreakdown: Record<string, number>;
        };
      },
      DomainError
    >
  > {
    // Validate account ID
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    // Verify account exists within tenant (IFC-269: repository-level isolation)
    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new NotFoundError(`Account with ID ${accountId} not found`));
    }

    // Get opportunities for account
    const opportunities = await this.opportunityRepository.findByAccountId(accountId);

    // Apply stage filter if provided
    let filteredOpportunities = opportunities;
    if (options.stage && options.stage.length > 0) {
      filteredOpportunities = opportunities.filter((o) => options.stage!.includes(o.stage));
    }

    // Calculate summary
    const totalValue = filteredOpportunities.reduce((sum, o) => sum + o.value.amount, 0);
    const weightedValue = filteredOpportunities.reduce(
      (sum, o) => sum + (o.value.amount * o.probability.value) / 100,
      0
    );
    const stageBreakdown = filteredOpportunities.reduce(
      (acc, o) => {
        acc[o.stage] = (acc[o.stage] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Apply cursor-based pagination
    let startIndex = 0;
    if (options.cursor) {
      const cursorIndex = filteredOpportunities.findIndex(
        (o) => o.id.toString() === options.cursor
      );
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedOpportunities = filteredOpportunities.slice(
      startIndex,
      startIndex + options.limit + 1
    );
    const hasMore = paginatedOpportunities.length > options.limit;
    const results = hasMore ? paginatedOpportunities.slice(0, -1) : paginatedOpportunities;

    return Result.ok({
      opportunities: results.map((o) => ({
        id: o.id.toString(),
        name: o.name,
        stage: o.stage,
        value: o.value.amount,
        probability: o.probability.value,
        expectedCloseDate: o.expectedCloseDate,
        createdAt: o.createdAt,
      })),
      nextCursor: hasMore ? results.at(-1)?.id.toString() : undefined,
      total: filteredOpportunities.length,
      summary: { totalValue, weightedValue, stageBreakdown },
    });
  }

  /**
   * Get activity feed for an account
   * Aggregates activities from contacts and opportunities
   */
  async getAccountActivity(
    accountId: string,
    tenantId: string,
    options: {
      limit: number;
      cursor?: string;
      types?: string[];
    }
  ): Promise<
    Result<
      {
        activities: Array<{
          id: string;
          type: string;
          description: string;
          entityType: 'CONTACT' | 'OPPORTUNITY';
          entityId: string;
          entityName: string;
          createdAt: Date;
        }>;
        nextCursor?: string;
      },
      DomainError
    >
  > {
    // Validate account ID
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    // Verify account exists within tenant (IFC-269: repository-level isolation)
    const account = await this.accountRepository.findById(accountIdResult.value, tenantId);
    if (!account) {
      return Result.fail(new NotFoundError(`Account with ID ${accountId} not found`));
    }

    // Get contacts and opportunities for activity aggregation
    const [contacts, opportunities] = await Promise.all([
      this.contactRepository.findByAccountId(accountId),
      this.opportunityRepository.findByAccountId(accountId),
    ]);

    // Build activity feed from domain entities
    // Note: In a full implementation, this would query ActivityEvent and ContactActivity tables
    // For now, we return account-level activity based on entity creation/updates
    const activities: Array<{
      id: string;
      type: string;
      description: string;
      entityType: 'CONTACT' | 'OPPORTUNITY';
      entityId: string;
      entityName: string;
      createdAt: Date;
    }> = [];

    // Add contact activities
    for (const contact of contacts) {
      activities.push({
        id: `contact-${contact.id.toString()}`,
        type: 'CONTACT_CREATED',
        description: `Contact ${contact.firstName} ${contact.lastName} added`,
        entityType: 'CONTACT',
        entityId: contact.id.toString(),
        entityName: `${contact.firstName} ${contact.lastName}`,
        createdAt: contact.createdAt,
      });
    }

    // Add opportunity activities
    for (const opportunity of opportunities) {
      activities.push({
        id: `opportunity-${opportunity.id.toString()}`,
        type: 'OPPORTUNITY_CREATED',
        description: `Opportunity ${opportunity.name} created`,
        entityType: 'OPPORTUNITY',
        entityId: opportunity.id.toString(),
        entityName: opportunity.name,
        createdAt: opportunity.createdAt,
      });
    }

    // Sort by date descending
    activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply type filter if provided
    let filteredActivities = activities;
    if (options.types && options.types.length > 0) {
      filteredActivities = activities.filter((a) => options.types!.includes(a.type));
    }

    // Apply cursor-based pagination
    let startIndex = 0;
    if (options.cursor) {
      const cursorDate = new Date(options.cursor);
      const cursorIndex = filteredActivities.findIndex((a) => a.createdAt < cursorDate);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex;
      }
    }

    const paginatedActivities = filteredActivities.slice(
      startIndex,
      startIndex + options.limit + 1
    );
    const hasMore = paginatedActivities.length > options.limit;
    const results = hasMore ? paginatedActivities.slice(0, -1) : paginatedActivities;

    return Result.ok({
      activities: results,
      nextCursor: hasMore ? results.at(-1)?.createdAt.toISOString() : undefined,
    });
  }

  async getHierarchy(
    accountId: string,
    tenantId: string,
    maxDepth: number = 5
  ): Promise<Result<HierarchyResponse, DomainError>> {
    const id = AccountId.create(accountId);
    if (id.isFailure) return Result.fail(new ValidationError(id.error.message));

    const rawRecord = await this.accountRepository.findWithChildren(id.value, maxDepth, tenantId);
    if (!rawRecord) return Result.fail(new NotFoundError(`Account not found: ${accountId}`));

    const ancestors = await this.accountRepository.findAncestors(id.value, tenantId);
    const ancestorList = ancestors.map((a) => ({ id: a.id.value, name: a.name }));

    const mapToNode = (record: AccountHierarchyRecord): HierarchyNode => ({
      id: record.id,
      name: record.name,
      industry: record.industry ?? undefined,
      revenue: record.revenue ? Number(record.revenue) : undefined,
      _count: record._count ?? { contacts: 0, opportunities: 0 },
      children: (record.childAccounts ?? []).map(mapToNode),
    });

    const current = mapToNode(rawRecord);
    const rootAccount = ancestorList.length > 0 ? (ancestorList.at(-1) ?? null) : null;

    return Result.ok({ ancestors: ancestorList, current, rootAccount });
  }

  async setParent(
    accountId: string,
    parentAccountId: string | null,
    tenantId: string,
    userId: string
  ): Promise<Result<Account, DomainError>> {
    const id = AccountId.create(accountId);
    if (id.isFailure) return Result.fail(new ValidationError(id.error.message));

    const account = await this.accountRepository.findById(id.value, tenantId);
    if (!account) return Result.fail(new NotFoundError(`Account not found: ${accountId}`));

    if (parentAccountId === null) {
      account.removeParent(userId);
      await this.accountRepository.save(account);
      await this.publishEvents(account);
      return Result.ok(account);
    }

    const parentId = AccountId.create(parentAccountId);
    if (parentId.isFailure) return Result.fail(new ValidationError(parentId.error.message));

    const parent = await this.accountRepository.findById(parentId.value, tenantId);
    if (!parent)
      return Result.fail(new NotFoundError(`Parent account not found: ${parentAccountId}`));

    // Cycle detection: walk ancestors of proposed parent
    const parentAncestors = await this.accountRepository.findAncestors(parentId.value, tenantId);
    const ancestorIds = parentAncestors.map((a) => a.id.value);
    if (ancestorIds.includes(accountId) || parentAccountId === accountId) {
      return Result.fail(new ValidationError('Circular hierarchy detected'));
    }

    // Depth check: parent's depth + 1 (for this account) must not exceed 5
    const parentDepth = await this.accountRepository.getHierarchyDepth(parentId.value, tenantId);
    if (parentDepth + 1 >= 5) {
      return Result.fail(new ValidationError('Maximum hierarchy depth (5 levels) exceeded'));
    }

    const setResult = account.setParent(parentAccountId, userId);
    if (setResult.isFailure) return Result.fail(setResult.error);

    await this.accountRepository.save(account);
    await this.publishEvents(account);
    return Result.ok(account);
  }

  private async publishEvents(account: Account): Promise<void> {
    const events = account.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events);
      } catch (error) {
        console.error('Failed to publish account domain events:', error);
      }
    }
    account.clearDomainEvents();
  }
}
