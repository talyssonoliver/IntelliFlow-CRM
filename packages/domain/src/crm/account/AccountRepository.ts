import { Account } from './Account';
import { AccountId } from './AccountId';

/**
 * Account Repository Interface
 * Defines the contract for account persistence
 * Implementation lives in adapters layer
 */
export interface AccountRepository {
  /**
   * Save an account (create or update)
   */
  save(account: Account): Promise<void>;

  /**
   * Find an account by ID
   */
  findById(id: AccountId): Promise<Account | null>;

  /**
   * Find accounts by name (partial match)
   */
  findByName(name: string): Promise<Account[]>;

  /**
   * Find all accounts for an owner
   */
  findByOwnerId(ownerId: string): Promise<Account[]>;

  /**
   * Find accounts by industry
   */
  findByIndustry(industry: string): Promise<Account[]>;

  /**
   * Delete an account
   */
  delete(id: AccountId): Promise<void>;

  /**
   * Check if account name exists
   */
  existsByName(name: string): Promise<boolean>;

  /**
   * Count accounts by industry
   */
  countByIndustry(): Promise<Record<string, number>>;
}

/**
 * Account Query Service Interface
 * For complex read-only queries that don't need domain logic
 */
export interface AccountQueryService {
  /**
   * Search accounts with filters
   */
  search(params: AccountSearchParams): Promise<AccountSearchResult>;

  /**
   * Get account statistics
   */
  getStatistics(ownerId?: string): Promise<AccountStatistics>;

  /**
   * Get high-value accounts
   */
  getHighValueAccounts(minRevenue: number, ownerId?: string): Promise<Account[]>;
}

// Query Types
export interface AccountSearchParams {
  query?: string;
  industry?: string[];
  minRevenue?: number;
  maxRevenue?: number;
  minEmployees?: number;
  maxEmployees?: number;
  ownerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AccountSearchResult {
  accounts: Account[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AccountStatistics {
  total: number;
  byIndustry: Record<string, number>;
  averageRevenue: number;
  totalRevenue: number;
  averageEmployees: number;
}
