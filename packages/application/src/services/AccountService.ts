import {
  Result,
  DomainError,
  Account,
  AccountId,
  AccountRepository,
  ContactRepository,
  OpportunityRepository,
  CreateAccountProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, ValidationError } from '../errors';

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

/**
 * Account hierarchy relationship
 */
export interface AccountHierarchy {
  parentAccountId?: string;
  childAccountIds: string[];
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
    // Check for duplicate name
    const existingAccount = await this.accountRepository.existsByName(props.name);
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
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save account'));
    }

    // Publish events
    await this.publishEvents(account);

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
    updatedBy: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    // Check for name uniqueness if changing name
    if (updates.name && updates.name !== account.name) {
      const existingAccount = await this.accountRepository.existsByName(updates.name);
      if (existingAccount) {
        return Result.fail(
          new ValidationError(`Account with name "${updates.name}" already exists`)
        );
      }
    }

    account.updateAccountInfo(updates, updatedBy);

    try {
      await this.accountRepository.save(account);
    } catch (error) {
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
    updatedBy: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const updateResult = account.updateRevenue(newRevenue, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.accountRepository.save(account);
    } catch (error) {
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
    updatedBy: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const updateResult = account.updateEmployeeCount(newCount, updatedBy);
    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    try {
      await this.accountRepository.save(account);
    } catch (error) {
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
    categorizedBy: string
  ): Promise<Result<Account, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    account.categorizeIndustry(industry, categorizedBy);

    try {
      await this.accountRepository.save(account);
    } catch (error) {
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
    accountId: string
  ): Promise<Result<AccountHealthScore, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
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
    const totalOpportunityValue = activeOpportunities.reduce((sum, o) => sum + o.value, 0);
    const opportunityValueScore = Math.min(100, Math.log10(totalOpportunityValue + 1) * 20);

    // Calculate contact engagement score (0-100)
    const contactCount = contacts.length;
    const contactEngagementScore = Math.min(100, contactCount * 20);

    // Calculate recent activity score (based on opportunities)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
    ownerId?: string
  ): Promise<Account[]> {
    const accounts = ownerId ? await this.accountRepository.findByOwnerId(ownerId) : [];

    return accounts.filter((a) => (a.revenue ?? 0) >= minRevenue);
  }

  /**
   * Get accounts by industry
   */
  async getAccountsByIndustry(industry: string): Promise<Account[]> {
    return this.accountRepository.findByIndustry(industry);
  }

  /**
   * Get account with full context (contacts, opportunities)
   */
  async getAccountWithContext(accountId: string): Promise<
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

    const account = await this.accountRepository.findById(accountIdResult.value);
    if (!account) {
      return Result.fail(new ValidationError(`Account not found: ${accountId}`));
    }

    const [contacts, opportunities] = await Promise.all([
      this.contactRepository.countByAccountId(accountId),
      this.opportunityRepository.findByAccountId(accountId),
    ]);

    const activeOpportunities = opportunities.filter((o) => !o.isClosed);
    const totalValue = opportunities.reduce((sum, o) => sum + o.value, 0);

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
  async getAccountStatistics(ownerId?: string): Promise<{
    total: number;
    byTier: Record<AccountTier, number>;
    byIndustry: Record<string, number>;
    totalRevenue: number;
    averageRevenue: number;
  }> {
    const accounts = ownerId ? await this.accountRepository.findByOwnerId(ownerId) : [];

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
  async deleteAccount(accountId: string): Promise<Result<void, DomainError>> {
    const accountIdResult = AccountId.create(accountId);
    if (accountIdResult.isFailure) {
      return Result.fail(accountIdResult.error);
    }

    const account = await this.accountRepository.findById(accountIdResult.value);
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
      await this.accountRepository.delete(accountIdResult.value);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to delete account'));
    }

    return Result.ok(undefined);
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
